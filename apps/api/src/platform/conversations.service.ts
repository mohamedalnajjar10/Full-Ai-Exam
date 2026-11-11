import { Injectable, NotFoundException } from '@nestjs/common';
import { ChatMessageRole, ChatMessageType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { ListConversationsDto } from './dto/platform.dto';

/**
 * النية محفوظة بمكان مختلف حسب عمر الرسالة: intentName (الجديد، لكل رد)،
 * intent.intent (رفض/شرح)، intentClassification.intent (توليد قديم).
 */
const INTENT_SQL = Prisma.sql`COALESCE(
  m.metadata->>'intentName',
  m.metadata->'intent'->>'intent',
  m.metadata->'intentClassification'->>'intent'
)`;

const DAY_MS = 24 * 60 * 60_000;

/** مراقبة جودة ردود المساعد: نوايا الطلاب، الرفض، الأخطاء، والبلاغات */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async stats(days = 7) {
    const since = new Date(Date.now() - days * DAY_MS);
    const [intents, sessions, studentMessages, assistant, latency] =
      await Promise.all([
        this.prisma.$queryRaw<{ intent: string; count: bigint }[]>`
          SELECT ${INTENT_SQL} AS intent, COUNT(*)::bigint AS count
          FROM "ChatMessage" m
          WHERE m.role = 'ASSISTANT' AND m."createdAt" >= ${since}
            AND ${INTENT_SQL} IS NOT NULL
          GROUP BY 1 ORDER BY 2 DESC`,
        this.prisma.chatSession.count({ where: { updatedAt: { gte: since } } }),
        this.prisma.chatMessage.count({
          where: { role: ChatMessageRole.STUDENT, createdAt: { gte: since } },
        }),
        this.prisma.chatMessage.groupBy({
          by: ['type'],
          where: {
            role: ChatMessageRole.ASSISTANT,
            createdAt: { gte: since },
          },
          _count: true,
        }),
        // زمن الرد الوسيط لطلبات المحادثة (توليد وشرح) من سجل الاستهلاك
        this.prisma.$queryRaw<{ task: string; p50: number | null }[]>`
          SELECT task, percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50
          FROM "AiUsageLog"
          WHERE "createdAt" >= ${since} AND success = true
            AND task IN ('generation', 'answer')
          GROUP BY task`,
      ]);

    const intentCounts = intents.map((r) => ({
      intent: r.intent,
      count: Number(r.count),
    }));
    const classified = intentCounts.reduce((n, r) => n + r.count, 0);
    const offTopic =
      intentCounts.find((r) => r.intent === 'OFF_TOPIC')?.count ?? 0;
    const replies = assistant.reduce((n, r) => n + r._count, 0);
    const errors =
      assistant.find((r) => r.type === ChatMessageType.ERROR)?._count ?? 0;

    return {
      days,
      intents: intentCounts,
      sessions,
      studentMessages,
      // نسب من 0 لـ 1؛ null لما ما في بيانات (أصدق من 0%)
      offTopicRate: classified ? offTopic / classified : null,
      // أخطاء غير الرفض: حصة منتهية، فشل توليد، لا مراجع...
      errorRate: replies
        ? (errors - offTopic > 0 ? errors - offTopic : 0) / replies
        : null,
      medianLatencyMs: Object.fromEntries(
        latency.map((r) => [r.task, r.p50 === null ? null : Math.round(r.p50)]),
      ) as Record<string, number | null>,
    };
  }

  async list(dto: ListConversationsDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 30;
    const and: Prisma.ChatSessionWhereInput[] = [];
    if (dto.subjectId) and.push({ subjectId: dto.subjectId });
    if (dto.filter === 'flagged') and.push({ flaggedAt: { not: null } });
    if (dto.filter === 'errors') {
      and.push({
        messages: {
          some: {
            role: ChatMessageRole.ASSISTANT,
            type: ChatMessageType.ERROR,
            NOT: { metadata: { path: ['intentName'], equals: 'OFF_TOPIC' } },
          },
        },
      });
    }
    if (dto.filter === 'off_topic') {
      and.push({
        messages: {
          some: {
            role: ChatMessageRole.ASSISTANT,
            OR: [
              { metadata: { path: ['intentName'], equals: 'OFF_TOPIC' } },
              { metadata: { path: ['intent', 'intent'], equals: 'OFF_TOPIC' } },
            ],
          },
        },
      });
    }
    const q = dto.q?.trim();
    if (q) {
      and.push({
        OR: [
          { student: { name: { contains: q, mode: 'insensitive' } } },
          { student: { email: { contains: q, mode: 'insensitive' } } },
          {
            messages: {
              some: {
                role: ChatMessageRole.STUDENT,
                content: { contains: q, mode: 'insensitive' },
              },
            },
          },
        ],
      });
    }
    const where: Prisma.ChatSessionWhereInput = and.length ? { AND: and } : {};

    const [rows, total] = await Promise.all([
      this.prisma.chatSession.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          isActive: true,
          flaggedAt: true,
          flagNote: true,
          updatedAt: true,
          student: { select: { id: true, name: true, email: true } },
          subject: { select: { id: true, name: true } },
          _count: { select: { messages: true } },
        },
      }),
      this.prisma.chatSession.count({ where }),
    ]);

    // عدد الأخطاء لكل محادثة بالصفحة — مؤشر سريع بالقائمة
    const errorCounts = await this.prisma.chatMessage.groupBy({
      by: ['sessionId'],
      where: {
        sessionId: { in: rows.map((r) => r.id) },
        role: ChatMessageRole.ASSISTANT,
        type: ChatMessageType.ERROR,
      },
      _count: true,
    });
    const errorsBySession = new Map(
      errorCounts.map((e) => [e.sessionId, e._count]),
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        student: r.student,
        subject: r.subject,
        isActive: r.isActive,
        flagged: r.flaggedAt !== null,
        flagNote: r.flagNote,
        messages: r._count.messages,
        errors: errorsBySession.get(r.id) ?? 0,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      limit,
    };
  }

  async transcript(id: string) {
    const session = await this.prisma.chatSession.findUnique({
      where: { id },
      select: {
        id: true,
        isActive: true,
        flaggedAt: true,
        flagNote: true,
        createdAt: true,
        updatedAt: true,
        flaggedBy: { select: { name: true, email: true } },
        student: { select: { id: true, name: true, email: true } },
        subject: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 300,
          select: {
            id: true,
            role: true,
            type: true,
            content: true,
            fileMimeType: true,
            metadata: true,
            createdAt: true,
          },
        },
      },
    });
    if (!session) throw new NotFoundException('المحادثة غير موجودة.');

    return {
      ...session,
      flagged: session.flaggedAt !== null,
      messages: session.messages.map((m) => {
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        const legacy =
          (meta.intent as
            { intent?: string; confidence?: number } | undefined) ??
          (meta.intentClassification as
            { intent?: string; confidence?: number } | undefined);
        const questions = meta.questions as unknown[] | undefined;
        const sources = meta.sources as unknown[] | undefined;
        return {
          id: m.id,
          role: m.role,
          type: m.type,
          content: m.content,
          fileMimeType: m.fileMimeType,
          createdAt: m.createdAt,
          // مختصر بدل الـ metadata كاملة (الأسئلة المولّدة بتكون كبيرة)
          intent:
            (meta.intentName as string | undefined) ?? legacy?.intent ?? null,
          confidence:
            (meta.intentConfidence as number | undefined) ??
            legacy?.confidence ??
            null,
          questionCount: questions?.length ?? 0,
          sourceCount: sources?.length ?? 0,
          sourceType: (meta.sourceType as string | undefined) ?? null,
        };
      }),
    };
  }

  async flag(id: string, userId: string, flagged: boolean, note?: string) {
    const exists = await this.prisma.chatSession.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('المحادثة غير موجودة.');
    // SQL مباشر: Prisma بيحدّث updatedAt (@updatedAt) مع أي update، وهو
    // ترتيب القائمة حسب آخر رسالة — البلاغ ما لازم يحرّك المحادثة لفوق
    await this.prisma.$executeRaw`
      UPDATE "ChatSession" SET
        "flaggedAt" = ${flagged ? new Date() : null},
        "flaggedById" = ${flagged ? userId : null},
        "flagNote" = ${flagged ? note?.trim() || null : null}
      WHERE id = ${id}`;
    return this.transcript(id);
  }
}
