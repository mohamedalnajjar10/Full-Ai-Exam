import { QuotaService } from './quota.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RedisService } from '../redis/redis.service';
import type { UsageLimitsService } from './usage-limits.service';

describe('QuotaService', () => {
  const findUnique = jest.fn();
  const findFirst = jest.fn();
  const redis = {
    get: jest.fn(),
    incrWithExpiry: jest.fn(),
    decrNotBelowZero: jest.fn(),
    del: jest.fn(),
  };
  const limits = { get: jest.fn() };
  const service = new QuotaService(
    {
      user: { findUnique },
      userSubscription: { findFirst },
    } as unknown as PrismaService,
    redis as unknown as RedisService,
    limits as unknown as UsageLimitsService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    limits.get.mockResolvedValue({ dailyQuota: 20 });
    findFirst.mockResolvedValue(null);
  });

  const user = (over: Record<string, unknown>) =>
    findUnique.mockResolvedValue({
      role: 'STUDENT',
      dailyQuota: null,
      staffRole: null,
      ...over,
    });

  it('uses the platform default for students', async () => {
    user({});
    await expect(service.limitFor('u')).resolves.toBe(20);
  });

  it('treats a platform default of 0 as unlimited', async () => {
    user({});
    limits.get.mockResolvedValue({ dailyQuota: 0 });
    await expect(service.limitFor('u')).resolves.toBeNull();
  });

  it('prefers a per-account override over everything', async () => {
    user({ dailyQuota: 50, role: 'ADMIN', staffRole: { dailyQuota: 200 } });
    await expect(service.limitFor('u')).resolves.toBe(50);
  });

  it("gives staff their role's quota, or none", async () => {
    user({ role: 'ADMIN', staffRole: { dailyQuota: 200 } });
    await expect(service.limitFor('u')).resolves.toBe(200);
    user({ role: 'ADMIN', staffRole: { dailyQuota: null } });
    await expect(service.limitFor('u')).resolves.toBeNull();
  });

  it('allows up to and including the limit', async () => {
    user({});
    redis.incrWithExpiry.mockResolvedValue(20);
    await expect(service.consume('u')).resolves.toMatchObject({
      allowed: true,
      used: 20,
      limit: 20,
    });
    redis.incrWithExpiry.mockResolvedValue(21);
    await expect(service.consume('u')).resolves.toMatchObject({
      allowed: false,
    });
  });

  it('never blocks an unlimited account', async () => {
    user({ dailyQuota: null, role: 'ADMIN', staffRole: null });
    redis.incrWithExpiry.mockResolvedValue(10_000);
    await expect(service.consume('u')).resolves.toMatchObject({
      allowed: true,
      limit: null,
    });
  });

  describe('Feature Quotas (quiz, assessment, chat)', () => {
    it('returns default free limits when user has no active subscription', async () => {
      user({});
      const status = await service.getFeatureStatus('u', 'quiz');
      expect(status.limit).toBe(3);
      expect(status.planCode).toBe('FREE');
    });

    it('returns subscription plan limits when user has active Pro subscription', async () => {
      user({});
      findFirst.mockResolvedValue({
        status: 'ACTIVE',
        expiresAt: new Date(Date.now() + 86400000),
        plan: {
          code: 'PRO_MONTHLY',
          name: 'باقة التفوق',
          dailyQuizLimit: 30,
          dailyAssessmentLimit: 5,
          dailyChatLimit: 100,
        },
      });

      const quizStatus = await service.getFeatureStatus('u', 'quiz');
      expect(quizStatus.limit).toBe(30);
      expect(quizStatus.planCode).toBe('PRO_MONTHLY');

      const chatStatus = await service.getFeatureStatus('u', 'chat');
      expect(chatStatus.limit).toBe(100);
    });

    it('consumeFeature enforces limits correctly', async () => {
      user({});
      redis.incrWithExpiry.mockResolvedValue(3); // limit is 3 for free quiz
      const allowed = await service.consumeFeature('u', 'quiz');
      expect(allowed.allowed).toBe(true);

      redis.incrWithExpiry.mockResolvedValue(4);
      const blocked = await service.consumeFeature('u', 'quiz');
      expect(blocked.allowed).toBe(false);
    });

    it('getAllFeaturesStatus returns complete breakdown for student', async () => {
      user({});
      redis.get.mockResolvedValue('1');
      const all = await service.getAllFeaturesStatus('u');

      expect(all.planCode).toBe('FREE');
      expect(all.quotas.quiz).toBeDefined();
      expect(all.quotas.assessment).toBeDefined();
      expect(all.quotas.chat).toBeDefined();
    });
  });
});
