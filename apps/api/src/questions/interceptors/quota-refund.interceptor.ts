import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { RedisService } from '../../redis/redis.service';
import { QUOTA_KEY_REQUEST_PROPERTY } from '../guards/generation-rate-limit.guard';

interface RequestWithQuotaKey {
  [QUOTA_KEY_REQUEST_PROPERTY]?: string;
}

/**
 * Gives a student their generation quota back when the request that was
 * charged for it fails.
 *
 * GenerationRateLimitGuard increments atomically *before* the handler runs,
 * which is what makes the quota race-free. The side effect was that Gemini
 * errors, an empty question bank, and validation failures all consumed one of
 * the 20 daily generations. This refunds exactly those cases; a successful
 * response keeps the charge.
 */
@Injectable()
export class QuotaRefundInterceptor implements NestInterceptor {
  private readonly logger = new Logger(QuotaRefundInterceptor.name);

  constructor(private readonly redis: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithQuotaKey>();

    return next.handle().pipe(
      catchError((error: unknown) => {
        const quotaKey = request[QUOTA_KEY_REQUEST_PROPERTY];
        if (quotaKey) {
          void this.redis
            .decrNotBelowZero(quotaKey)
            .catch((refundError: unknown) =>
              this.logger.error(
                `Failed to refund generation quota for ${quotaKey}`,
                refundError,
              ),
            );
        }
        return throwError(() => error);
      }),
    );
  }
}
