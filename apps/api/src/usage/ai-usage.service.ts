import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentUserId } from '../common/request-context';
import { UsageLimitsService } from './usage-limits.service';

export type AiTask =
  | 'classification'
  | 'generation'
  | 'answer'
  | 'extraction'
  | 'validation'
  | 'style'
  | 'transcription'
  | 'embedding'
  | 'other';

export interface AiCallRecord {
  task: AiTask;
  provider: 'anthropic' | 'openrouter' | 'gemini';
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs: number;
  success: boolean;
  error?: string;
}

const SPEND_CACHE_MS = 60_000;

/**
 * سجل كل طلب لنموذج ذكاء اصطناعي + فحص الميزانية الشهرية. الكتابة ما
 * بتوقف الطلب ولا بتفشّله — السجل مراقبة، مش جزء من المنطق.
 */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);
  private spend: { usd: number; at: number; month: string } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: UsageLimitsService,
  ) {}

  record(call: AiCallRecord): void {
    const userId = currentUserId();
    if (call.costUsd && this.spend) this.spend.usd += call.costUsd;
    this.prisma.aiUsageLog
      .create({
        data: {
          task: call.task,
          provider: call.provider,
          model: call.model,
          inputTokens: call.inputTokens ?? 0,
          outputTokens: call.outputTokens ?? 0,
          costUsd: call.costUsd ?? 0,
          latencyMs: Math.round(call.latencyMs),
          success: call.success,
          error: call.error?.slice(0, 500),
          userId,
        },
      })
      .catch((err: unknown) =>
        this.logger.warn(`Failed to record AI usage: ${String(err)}`),
      );
  }

  static monthStart(now = new Date()): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  }

  /** صرف الشهر الحالي (UTC) بالدولار */
  async monthSpendUsd(): Promise<number> {
    const month = new Date().toISOString().slice(0, 7);
    if (
      this.spend &&
      this.spend.month === month &&
      Date.now() - this.spend.at < SPEND_CACHE_MS
    ) {
      return this.spend.usd;
    }
    const agg = await this.prisma.aiUsageLog.aggregate({
      _sum: { costUsd: true },
      where: { createdAt: { gte: AiUsageService.monthStart() } },
    });
    const usd = agg._sum.costUsd ?? 0;
    this.spend = { usd, at: Date.now(), month };
    return usd;
  }

  /**
   * true لما الإيقاف الصارم مفعّل والصرف وصل السقف — GeminiService بيتخطى
   * النماذج المدفوعة ساعتها. فشل القراءة ما بيوقف الخدمة.
   */
  async paidModelsBlocked(): Promise<boolean> {
    try {
      const limits = await this.limits.get();
      if (!limits.hardStop || limits.monthlyBudgetUsd <= 0) return false;
      return (await this.monthSpendUsd()) >= limits.monthlyBudgetUsd;
    } catch {
      return false;
    }
  }
}
