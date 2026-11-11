import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/** حدود الاستهلاك — بتنحفظ بـ AppSetting وبتنعدّل من صفحة «الاستهلاك والحصص» */
export interface UsageLimits {
  /** عمليات توليد يومية لكل طالب؛ 0 = بلا حد */
  dailyQuota: number;
  /** أقصى عدد أسئلة بطلب توليد واحد */
  perRequestMax: number;
  /** سقف الصرف الشهري بالدولار؛ 0 = بلا سقف */
  monthlyBudgetUsd: number;
  /** نسبة الصرف يلي بيظهر عندها تنبيه بلوحة التحكم */
  alertAtPct: number;
  /** عند السقف: النماذج المدفوعة بتتوقف وبيكمل التوليد بالمجانية بس */
  hardStop: boolean;
}

const KEY = 'usage.limits';
const CACHE_MS = 30_000;

@Injectable()
export class UsageLimitsService {
  private cached: { value: UsageLimits; at: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  defaults(): UsageLimits {
    return {
      dailyQuota: this.config.get<number>('DAILY_GENERATION_QUOTA') ?? 20,
      perRequestMax: 10,
      monthlyBudgetUsd: 50,
      alertAtPct: 80,
      hardStop: true,
    };
  }

  /** بتنقرا بكل طلب توليد وبكل نداء للنموذج — منخزّنها شوي */
  async get(): Promise<UsageLimits> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return this.cached.value;
    }
    const row = await this.prisma.appSetting.findUnique({
      where: { key: KEY },
    });
    const value = {
      ...this.defaults(),
      ...((row?.value as Partial<UsageLimits> | null) ?? {}),
    };
    this.cached = { value, at: Date.now() };
    return value;
  }

  async save(
    patch: Partial<UsageLimits>,
    userId: string,
  ): Promise<UsageLimits> {
    const value = { ...(await this.get()), ...patch };
    await this.prisma.appSetting.upsert({
      where: { key: KEY },
      create: {
        key: KEY,
        value: value,
        updatedBy: userId,
      },
      update: {
        value: value,
        updatedBy: userId,
      },
    });
    this.cached = { value, at: Date.now() };
    return value;
  }
}
