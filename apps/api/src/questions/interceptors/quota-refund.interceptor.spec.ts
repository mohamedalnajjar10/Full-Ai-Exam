import { Test, TestingModule } from '@nestjs/testing';
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { QuotaRefundInterceptor } from './quota-refund.interceptor';
import { RedisService } from '../../redis/redis.service';
import { QUOTA_KEY_REQUEST_PROPERTY } from '../guards/generation-rate-limit.guard';

describe('QuotaRefundInterceptor', () => {
  let interceptor: QuotaRefundInterceptor;
  let redis: { decrNotBelowZero: jest.Mock };

  const QUOTA_KEY = 'rate_limit:gen:student-1:2026-09-20';

  const contextFor = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(async () => {
    redis = { decrNotBelowZero: jest.fn().mockResolvedValue(0) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaRefundInterceptor,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    interceptor = moduleRef.get(QuotaRefundInterceptor);
  });

  it('refunds the charged quota when the handler throws', async () => {
    const request = { [QUOTA_KEY_REQUEST_PROPERTY]: QUOTA_KEY };
    const next: CallHandler = {
      handle: () => throwError(() => new Error('Gemini unavailable')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(contextFor(request), next)),
    ).rejects.toThrow('Gemini unavailable');

    expect(redis.decrNotBelowZero).toHaveBeenCalledWith(QUOTA_KEY);
  });

  it('keeps the charge when the handler succeeds', async () => {
    const request = { [QUOTA_KEY_REQUEST_PROPERTY]: QUOTA_KEY };
    const next: CallHandler = { handle: () => of({ success: true }) };

    await expect(
      lastValueFrom(interceptor.intercept(contextFor(request), next)),
    ).resolves.toEqual({ success: true });

    expect(redis.decrNotBelowZero).not.toHaveBeenCalled();
  });

  it('does nothing when no quota key was stamped on the request', async () => {
    const next: CallHandler = {
      handle: () => throwError(() => new Error('boom')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(contextFor({}), next)),
    ).rejects.toThrow('boom');

    expect(redis.decrNotBelowZero).not.toHaveBeenCalled();
  });

  it('still propagates the original error if the refund itself fails', async () => {
    redis.decrNotBelowZero.mockRejectedValue(new Error('redis down'));
    const request = { [QUOTA_KEY_REQUEST_PROPERTY]: QUOTA_KEY };
    const next: CallHandler = {
      handle: () => throwError(() => new Error('empty question bank')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(contextFor(request), next)),
    ).rejects.toThrow('empty question bank');
  });
});
