import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { QuotaService } from '../../usage/quota.service';

interface AuthenticatedRequest extends Request {
  user?: { id?: string; sub?: string };
}

/**
 * Property stamped onto the request with the Redis key this request was
 * charged against, so QuotaRefundInterceptor can give it back on failure.
 */
export const QUOTA_KEY_REQUEST_PROPERTY = '__generationQuotaKey';

@Injectable()
export class GenerationRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(GenerationRateLimitGuard.name);

  constructor(private readonly quota: QuotaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();

    const studentId = request.user?.id ?? request.user?.sub;
    if (!studentId) {
      // Let JwtAuthGuard handle missing auth — this guard only enforces quota
      return true;
    }

    // تحديد الميزة بناءً على المسار (اختبار تقييم أم كويز أسئلة)
    const isAssessment = request.url?.includes('assessment');
    const feature: 'assessment' | 'quiz' = isAssessment ? 'assessment' : 'quiz';

    // حجز ذرّي من الحصة بناءً على باقة الاشتراك المفعلة للطالب
    const result = await this.quota.consumeFeature(studentId, feature);

    // Record what we charged so a failed request can be refunded.
    (request as unknown as Record<string, string>)[QUOTA_KEY_REQUEST_PROPERTY] =
      result.key;

    // ── Inject rate-limit headers into every response ─────────────
    if (result.limit !== null) {
      response.setHeader('X-RateLimit-Limit', result.limit);
      response.setHeader(
        'X-RateLimit-Remaining',
        Math.max(0, result.limit - result.used),
      );
    }
    response.setHeader('X-RateLimit-Reset', result.resetAt);

    if (!result.allowed) {
      this.logger.warn(
        `Student ${studentId} exceeded daily ${feature} quota (${result.used}/${result.limit})`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: 'QUOTA_EXCEEDED',
          feature,
          message:
            feature === 'assessment'
              ? 'لقد استنفدت حصتك اليومية من اختبارات التقييم. يتجدد الرصيد عند منتصف الليل أو يمكنك الترقية إلى باقة أعلى للمتابعة.'
              : 'لقد استنفدت حصتك اليومية من الكويزات. يتجدد الرصيد عند منتصف الليل أو يمكنك الترقية إلى باقة أعلى للمتابعة.',
          quotaLimit: result.limit,
          remaining: 0,
          resetAt: result.resetAt,
          upgradeUrl: '/subscriptions',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
