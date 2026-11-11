import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UsageLimitsService } from './usage-limits.service';
import {
  SubscriptionFeatureType,
  UserSubscriptionStatus,
  FeatureDailyQuota,
} from '@ai-exam/types';

export interface QuotaStatus {
  /** null = بلا حد */
  limit: number | null;
  used: number;
  /** منتصف الليل UTC */
  resetAt: string;
}

export interface FeatureQuotaStatus {
  feature: SubscriptionFeatureType;
  limit: number | null; // null = unlimited
  used: number;
  remaining: number | null; // null = unlimited
  allowed: boolean;
  resetAt: string;
  planCode: string;
  planName: string;
}

const DEFAULT_FREE_LIMITS: Record<SubscriptionFeatureType, number> = {
  quiz: 3,
  assessment: 1,
  chat: 10,
};

/**
 * حصة التوليد اليومية — مكان موحد لحصص الكويزات، اختبارات التقييم، وشات الذكاء الاصطناعي.
 * يدعم باقات الاشتراك (Free, Pro, Ultimate) وحصص الحساب ودور الفريق.
 * العدادات مخزنة بـ Redis بمفتاح يومي ينتهي عند منتصف الليل UTC.
 */
@Injectable()
export class QuotaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly limits: UsageLimitsService,
  ) {}

  key(userId: string, day = new Date()): string {
    return `rate_limit:gen:${userId}:${day.toISOString().slice(0, 10)}`;
  }

  featureKey(
    userId: string,
    feature: SubscriptionFeatureType,
    day = new Date(),
  ): string {
    return `rate_limit:${feature}:${userId}:${day.toISOString().slice(0, 10)}`;
  }

  private midnight(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
  }

  /**
   * جلب الباقة النشطة للمستخدم (إن وجدت).
   */
  async getActiveSubscription(userId: string): Promise<any | null> {
    try {
      const sub = await (this.prisma as any).userSubscription?.findFirst?.({
        where: {
          userId,
          status: 'ACTIVE',
          expiresAt: { gt: new Date() },
        },
        include: { plan: true },
        orderBy: { createdAt: 'desc' },
      });
      return sub ?? null;
    } catch {
      return null;
    }
  }

  async limitFor(userId: string): Promise<number | null> {
    const [user, settings, sub] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          dailyQuota: true,
          staffRole: { select: { dailyQuota: true } },
        },
      }),
      this.limits.get(),
      this.getActiveSubscription(userId),
    ]);
    if (user?.dailyQuota != null) return user.dailyQuota;
    if (user?.role === Role.ADMIN) return user.staffRole?.dailyQuota ?? null;
    if (sub?.plan) {
      return sub.plan.dailyQuizLimit;
    }
    return settings.dailyQuota > 0 ? settings.dailyQuota : null;
  }

  async status(userId: string): Promise<QuotaStatus> {
    const [limit, rawFeature, rawLegacy, dbUsed] = await Promise.all([
      this.limitFor(userId),
      this.redis.get(this.featureKey(userId, 'quiz')),
      this.redis.get(this.key(userId)),
      this.getDbUsageToday(userId, 'quiz'),
    ]);
    const raw = rawFeature ?? rawLegacy;
    const redisUsed = raw ? parseInt(raw, 10) : 0;
    const used = Math.max(redisUsed, dbUsed);
    return {
      limit,
      used,
      resetAt: this.midnight().toISOString(),
    };
  }

  /** عمليات اليوم لعدة حسابات (لجدول المستخدمين) */
  async usedToday(userIds: string[]): Promise<Map<string, number>> {
    const values = await Promise.all(
      userIds.map((id) => this.redis.get(this.key(id))),
    );
    return new Map(
      userIds.map((id, i) => [id, parseInt(values[i] ?? '0', 10)]),
    );
  }

  /**
   * يحجز عملية عامة من الحصة (للتوافق مع الاستدعاءات القديمة).
   */
  async consume(
    userId: string,
  ): Promise<QuotaStatus & { allowed: boolean; key: string }> {
    const key = this.key(userId);
    const midnight = this.midnight();
    const ttl = Math.ceil((midnight.getTime() - Date.now()) / 1000);
    const [used, limit] = await Promise.all([
      this.redis.incrWithExpiry(key, ttl),
      this.limitFor(userId),
    ]);
    return {
      key,
      used,
      limit,
      resetAt: midnight.toISOString(),
      allowed: limit === null || used <= limit,
    };
  }

  async refund(key: string): Promise<void> {
    await this.redis.decrNotBelowZero(key);
  }

  /** إعادة تصفير حصة اليوم لحساب (من صفحة المستخدمين) */
  async reset(userId: string): Promise<void> {
    await this.redis.del(this.key(userId));
  }

  /* ─────────────────────────────────────────────────────────────
   * حصص الميزات المحددة (Granular Feature Quotas: quiz, assessment, chat)
   * ───────────────────────────────────────────────────────────── */

  async getFeatureLimit(
    userId: string,
    feature: SubscriptionFeatureType,
  ): Promise<{
    limit: number | null;
    planCode: string;
    planName: string;
    isPaid: boolean;
  }> {
    const [user, sub] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          role: true,
          dailyQuota: true,
          staffRole: { select: { dailyQuota: true } },
        },
      }),
      this.getActiveSubscription(userId),
    ]);

    // الإدارة وأعضاء الفريق: بلا حد
    if (user?.role === Role.ADMIN) {
      return {
        limit: null,
        planCode: 'ADMIN',
        planName: 'فريق الإدارة',
        isPaid: true,
      };
    }

    // مشترك في باقة نشطة
    if (sub?.plan) {
      let limit: number | null = null;
      if (feature === 'quiz') limit = sub.plan.dailyQuizLimit;
      else if (feature === 'assessment') limit = sub.plan.dailyAssessmentLimit;
      else if (feature === 'chat') limit = sub.plan.dailyChatLimit;

      return {
        limit,
        planCode: sub.plan.code,
        planName: sub.plan.name,
        isPaid: sub.plan.code !== 'FREE',
      };
    }

    // الحساب العادي بدون اشتراك مدفوع (الباقة المجانية الافتراضية)
    let freeLimit = DEFAULT_FREE_LIMITS[feature];
    if (feature === 'quiz' && user?.dailyQuota != null) {
      freeLimit = user.dailyQuota;
    }

    return {
      limit: freeLimit,
      planCode: 'FREE',
      planName: 'الباقة المجانية',
      isPaid: false,
    };
  }

  /**
   * حساب الاستهلاك الفعلي لليوم مباشرة من قاعدة البيانات كخط دفاع ومصدر حقيقة قاطع.
   * يضمن دقة الرصيد حتى في حال إعادة تشغيل السيرفر أو استخدام MockRedis.
   */
  async getDbUsageToday(
    userId: string,
    feature: SubscriptionFeatureType,
  ): Promise<number> {
    const now = new Date();
    const todayStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    try {
      if (feature === 'quiz') {
        const [completedEvents, recentQuestions] = await Promise.all([
          (this.prisma as any).studentActivityEvent?.count?.({
            where: {
              studentId: userId,
              eventType: { in: ['QUIZ_COMPLETED', 'QUESTIONS_GENERATED'] },
              createdAt: { gte: todayStart },
            },
          }) ?? 0,
          (this.prisma as any).generatedQuestion?.findMany?.({
            where: {
              studentId: userId,
              createdAt: { gte: todayStart },
            },
            select: { createdAt: true },
            orderBy: { createdAt: 'desc' },
          }) ?? [],
        ]);

        let distinctGenerationBatches = 0;
        let lastBatchTime = 0;
        for (const q of recentQuestions) {
          const t = new Date(q.createdAt).getTime();
          if (Math.abs(t - lastBatchTime) > 10_000) {
            distinctGenerationBatches++;
            lastBatchTime = t;
          }
        }

        return Math.max(completedEvents, distinctGenerationBatches);
      }

      if (feature === 'assessment') {
        return (
          (await (this.prisma as any).assessmentAttempt?.count?.({
            where: {
              userId,
              startedAt: { gte: todayStart },
            },
          })) ?? 0
        );
      }

      if (feature === 'chat') {
        return (
          (await (this.prisma as any).chatMessage?.count?.({
            where: {
              role: 'STUDENT',
              createdAt: { gte: todayStart },
              session: { studentId: userId },
            },
          })) ?? 0
        );
      }
    } catch {
      // تجنب إفشال الخدمة في حال كانت الجداول غير مهيأة
    }

    return 0;
  }

  async getFeatureStatus(
    userId: string,
    feature: SubscriptionFeatureType,
  ): Promise<FeatureQuotaStatus> {
    const [{ limit, planCode, planName }, raw, dbUsed] = await Promise.all([
      this.getFeatureLimit(userId, feature),
      this.redis.get(this.featureKey(userId, feature)),
      this.getDbUsageToday(userId, feature),
    ]);
    const redisUsed = raw ? parseInt(raw, 10) : 0;
    const used = Math.max(redisUsed, dbUsed);
    const remaining = limit === null ? null : Math.max(0, limit - used);
    const allowed = limit === null || used < limit;

    // مزامنة الـ Redis إذا كانت قاعدة البيانات تحتوي استهلاكاً أعلى
    if (dbUsed > redisUsed) {
      const midnight = this.midnight();
      const ttl = Math.ceil((midnight.getTime() - Date.now()) / 1000);
      void this.redis
        .set(this.featureKey(userId, feature), String(dbUsed), ttl)
        .catch(() => {});
    }

    return {
      feature,
      limit,
      used,
      remaining,
      allowed,
      resetAt: this.midnight().toISOString(),
      planCode,
      planName,
    };
  }

  async consumeFeature(
    userId: string,
    feature: SubscriptionFeatureType,
  ): Promise<FeatureQuotaStatus & { key: string }> {
    const key = this.featureKey(userId, feature);
    const midnight = this.midnight();
    const ttl = Math.ceil((midnight.getTime() - Date.now()) / 1000);

    const [{ limit, planCode, planName }, dbUsed] = await Promise.all([
      this.getFeatureLimit(userId, feature),
      this.getDbUsageToday(userId, feature),
    ]);

    const redisCount = await this.redis.incrWithExpiry(key, ttl);
    const used = Math.max(redisCount, dbUsed + 1);

    if (used > redisCount) {
      void this.redis.set(key, String(used), ttl).catch(() => {});
    }

    if (feature === 'quiz') {
      void this.redis.incrWithExpiry(this.key(userId), ttl).catch(() => {});
    }

    const allowed = limit === null || used <= limit;
    const remaining = limit === null ? null : Math.max(0, limit - used);

    return {
      key,
      feature,
      limit,
      used,
      remaining,
      allowed,
      resetAt: midnight.toISOString(),
      planCode,
      planName,
    };
  }

  async refundFeature(
    userId: string,
    feature: SubscriptionFeatureType,
  ): Promise<void> {
    await this.redis.decrNotBelowZero(this.featureKey(userId, feature));
    if (feature === 'quiz') {
      await this.redis.decrNotBelowZero(this.key(userId)).catch(() => {});
    }
  }

  async getAllFeaturesStatus(userId: string): Promise<UserSubscriptionStatus> {
    const [sub, quizStatus, assessmentStatus, chatStatus] = await Promise.all([
      this.getActiveSubscription(userId),
      this.getFeatureStatus(userId, 'quiz'),
      this.getFeatureStatus(userId, 'assessment'),
      this.getFeatureStatus(userId, 'chat'),
    ]);

    const expiresAt = sub?.expiresAt ? new Date(sub.expiresAt) : null;
    const now = new Date();
    const daysRemaining = expiresAt
      ? Math.max(
          0,
          Math.ceil(
            (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          ),
        )
      : null;

    const toFeatureDaily = (s: FeatureQuotaStatus): FeatureDailyQuota => ({
      limit: s.limit,
      used: s.used,
      remaining: s.remaining,
      allowed: s.allowed,
    });

    return {
      planCode: sub?.plan?.code ?? quizStatus.planCode,
      planName: sub?.plan?.name ?? quizStatus.planName,
      badge: sub?.plan?.badge ?? null,
      isPaid: (sub?.plan?.code ?? 'FREE') !== 'FREE',
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      daysRemaining,
      resetAt: this.midnight().toISOString(),
      quotas: {
        quiz: toFeatureDaily(quizStatus),
        assessment: toFeatureDaily(assessmentStatus),
        chat: toFeatureDaily(chatStatus),
      },
    };
  }
}
