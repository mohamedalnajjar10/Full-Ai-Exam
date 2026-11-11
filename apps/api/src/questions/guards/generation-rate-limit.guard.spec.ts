import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { GenerationRateLimitGuard } from './generation-rate-limit.guard';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaService } from '../../usage/quota.service';
import { UsageLimitsService } from '../../usage/usage-limits.service';

const mockRedis = {
  incrWithExpiry: jest.fn(),
  get: jest.fn(),
};

const mockPrisma = {
  user: {
    findUnique: jest.fn().mockResolvedValue({
      role: 'STUDENT',
      dailyQuota: null,
      staffRole: null,
    }),
  },
  userSubscription: {
    findFirst: jest.fn().mockResolvedValue(null),
  },
};
const mockLimits = { get: jest.fn().mockResolvedValue({ dailyQuota: 20 }) };

function buildMockContext(
  studentId: string | null,
  responseHeaders: Record<string, string | number> = {},
  url = '/api/v1/questions/generate',
): ExecutionContext {
  const setHeader = jest.fn((key: string, value: string | number) => {
    responseHeaders[key] = value;
  });

  return {
    switchToHttp: () => ({
      getRequest: () => ({
        url,
        user: studentId
          ? { sub: studentId, email: 'test@test.com' }
          : undefined,
      }),
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
}

describe('GenerationRateLimitGuard', () => {
  let guard: GenerationRateLimitGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GenerationRateLimitGuard,
        QuotaService,
        { provide: RedisService, useValue: mockRedis },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: UsageLimitsService, useValue: mockLimits },
      ],
    }).compile();

    guard = module.get<GenerationRateLimitGuard>(GenerationRateLimitGuard);
    mockRedis.incrWithExpiry.mockReset();
    mockPrisma.userSubscription.findFirst.mockResolvedValue(null);
  });

  it('should pass through when no user is authenticated (let JwtAuthGuard handle)', async () => {
    const ctx = buildMockContext(null);
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(mockRedis.incrWithExpiry).not.toHaveBeenCalled();
  });

  it('should allow requests within daily quota', async () => {
    mockRedis.incrWithExpiry.mockResolvedValue(2); // 2nd request, free quiz quota is 3
    const headers: Record<string, string | number> = {};
    const ctx = buildMockContext('student-1', headers);

    const result = await guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(mockRedis.incrWithExpiry).toHaveBeenCalledWith(
      expect.stringContaining('rate_limit:quiz:student-1:'),
      expect.any(Number),
    );
    expect(headers['X-RateLimit-Limit']).toBe(3);
    expect(headers['X-RateLimit-Remaining']).toBe(1); // 3 - 2
    expect(headers['X-RateLimit-Reset']).toBeDefined();
  });

  it('should throw HTTP 429 when quota is exceeded', async () => {
    mockRedis.incrWithExpiry.mockResolvedValue(4); // 4th request, over limit of 3
    const ctx = buildMockContext('student-1');

    await expect(guard.canActivate(ctx)).rejects.toThrow(HttpException);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });

  it('should include structured payload in 429 response', async () => {
    mockRedis.incrWithExpiry.mockResolvedValue(5); // well over quota
    const ctx = buildMockContext('student-2');

    try {
      await guard.canActivate(ctx);
      fail('Expected HttpException to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const response = (err as HttpException).getResponse() as Record<
        string,
        unknown
      >;
      expect(response.statusCode).toBe(429);
      expect(response.error).toBe('QUOTA_EXCEEDED');
      expect(response.feature).toBe('quiz');
      expect(response.message).toContain('استنفدت حصتك');
      expect(response.quotaLimit).toBe(3);
      expect(response.upgradeUrl).toBe('/subscriptions');
      expect(response.resetAt).toBeDefined();
    }
  });

  it('should use atomic Redis key per student per day per feature', async () => {
    mockRedis.incrWithExpiry.mockResolvedValue(1);
    const ctx = buildMockContext('student-abc');

    await guard.canActivate(ctx);

    const today = new Date().toISOString().slice(0, 10);
    expect(mockRedis.incrWithExpiry).toHaveBeenCalledWith(
      `rate_limit:quiz:student-abc:${today}`,
      expect.any(Number),
    );
  });

  it('should detect assessment feature and enforce assessment limits', async () => {
    mockRedis.incrWithExpiry.mockResolvedValue(1); // 1st assessment request
    const headers: Record<string, string | number> = {};
    const ctx = buildMockContext(
      'student-1',
      headers,
      '/api/v1/assessments/generate',
    );

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(mockRedis.incrWithExpiry).toHaveBeenCalledWith(
      expect.stringContaining('rate_limit:assessment:student-1:'),
      expect.any(Number),
    );
    expect(headers['X-RateLimit-Limit']).toBe(1); // 1 assessment for free tier
    expect(headers['X-RateLimit-Remaining']).toBe(0);
  });
});
