import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiUsageService } from '../usage/ai-usage.service';
import { UsageLimitsService } from '../usage/usage-limits.service';

const DAY_MS = 24 * 60 * 60_000;

/** أرقام صفحة «الاستهلاك والحصص» — كلها من AiUsageLog */
@Injectable()
export class UsageStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usage: AiUsageService,
    private readonly limits: UsageLimitsService,
  ) {}

  async overview(days = 30) {
    const since = new Date(Date.now() - days * DAY_MS);
    // بداية اليوم (UTC) حتى أول يوم بالسلسلة يكون كامل
    since.setUTCHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);

    const [daily, byModel, byTask, top, limits, monthSpend, roles] =
      await Promise.all([
        this.prisma.$queryRaw<
          { day: Date; requests: bigint; errors: bigint; cost: number }[]
        >`
          SELECT date_trunc('day', "createdAt") AS day,
                 COUNT(*)::bigint AS requests,
                 COUNT(*) FILTER (WHERE NOT success)::bigint AS errors,
                 COALESCE(SUM("costUsd"), 0)::float8 AS cost
          FROM "AiUsageLog" WHERE "createdAt" >= ${since}
          GROUP BY 1 ORDER BY 1`,
        this.prisma.$queryRaw<
          {
            model: string;
            provider: string;
            requests: bigint;
            errors: bigint;
            input: bigint;
            output: bigint;
            cost: number;
            p50: number | null;
          }[]
        >`
          SELECT model, MIN(provider) AS provider,
                 COUNT(*)::bigint AS requests,
                 COUNT(*) FILTER (WHERE NOT success)::bigint AS errors,
                 COALESCE(SUM("inputTokens"), 0)::bigint AS input,
                 COALESCE(SUM("outputTokens"), 0)::bigint AS output,
                 COALESCE(SUM("costUsd"), 0)::float8 AS cost,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs")
                   FILTER (WHERE success) AS p50
          FROM "AiUsageLog" WHERE "createdAt" >= ${since}
          GROUP BY model ORDER BY requests DESC LIMIT 20`,
        this.prisma.$queryRaw<
          { task: string; requests: bigint; errors: bigint; cost: number }[]
        >`
          SELECT task, COUNT(*)::bigint AS requests,
                 COUNT(*) FILTER (WHERE NOT success)::bigint AS errors,
                 COALESCE(SUM("costUsd"), 0)::float8 AS cost
          FROM "AiUsageLog" WHERE "createdAt" >= ${since}
          GROUP BY task ORDER BY requests DESC`,
        // طلب الطالب الواحد = نداء توليد أو شرح (التصنيف قبله ما بينحسب)
        this.prisma.$queryRaw<
          {
            userId: string;
            name: string | null;
            email: string;
            branch: string | null;
            requests: bigint;
          }[]
        >`
          SELECT l."userId", u.name, u.email, b.name AS branch,
                 COUNT(*)::bigint AS requests
          FROM "AiUsageLog" l
          JOIN "User" u ON u.id = l."userId"
          LEFT JOIN "Branch" b ON b.id = u."branchId"
          WHERE l."createdAt" >= ${weekAgo} AND l.success
            AND l.task IN ('generation', 'answer') AND u.role = 'STUDENT'
          GROUP BY 1, 2, 3, 4 ORDER BY requests DESC LIMIT 8`,
        this.limits.get(),
        this.usage.monthSpendUsd(),
        this.prisma.staffRole.findMany({
          select: { id: true, name: true, dailyQuota: true, system: true },
          orderBy: [{ system: 'desc' }, { createdAt: 'asc' }],
        }),
      ]);

    // سلسلة متصلة: يوم بلا طلبات = صفر (مش فجوة بالرسم)
    const byDay = new Map(
      daily.map((d) => [d.day.toISOString().slice(0, 10), d]),
    );
    const series = Array.from({ length: days }, (_, i) => {
      const day = new Date(since.getTime() + (i + 1) * DAY_MS)
        .toISOString()
        .slice(0, 10);
      const d = byDay.get(day);
      return {
        day,
        requests: Number(d?.requests ?? 0),
        errors: Number(d?.errors ?? 0),
        cost: d?.cost ?? 0,
      };
    });

    return {
      days,
      series,
      totals: {
        requests: series.reduce((n, d) => n + d.requests, 0),
        errors: series.reduce((n, d) => n + d.errors, 0),
        cost: series.reduce((n, d) => n + d.cost, 0),
      },
      models: byModel.map((m) => ({
        model: m.model,
        provider: m.provider,
        requests: Number(m.requests),
        errorRate: Number(m.requests)
          ? Number(m.errors) / Number(m.requests)
          : 0,
        inputTokens: Number(m.input),
        outputTokens: Number(m.output),
        cost: m.cost,
        medianLatencyMs: m.p50 === null ? null : Math.round(m.p50),
      })),
      tasks: byTask.map((t) => ({
        task: t.task,
        requests: Number(t.requests),
        errors: Number(t.errors),
        cost: t.cost,
      })),
      topStudents: top.map((t) => ({
        id: t.userId,
        name: t.name ?? t.email,
        branch: t.branch,
        requests: Number(t.requests),
      })),
      budget: {
        spentUsd: monthSpend,
        ...limits,
        blocked: await this.usage.paidModelsBlocked(),
      },
      roleQuotas: roles,
    };
  }

  /** حصص أدوار الفريق من صفحة الاستهلاك (null = بلا حد) */
  async saveRoleQuotas(rows: { id: string; dailyQuota: number | null }[]) {
    const existing = await this.prisma.staffRole.findMany({
      where: { id: { in: rows.map((r) => r.id) } },
      select: { id: true },
    });
    const known = new Set(existing.map((r) => r.id));
    const unknown = rows.find((r) => !known.has(r.id));
    if (unknown) throw new NotFoundException(`الدور ${unknown.id} غير موجود.`);
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.staffRole.update({
          where: { id: r.id },
          data: { dailyQuota: r.dailyQuota },
        }),
      ),
    );
  }
}
