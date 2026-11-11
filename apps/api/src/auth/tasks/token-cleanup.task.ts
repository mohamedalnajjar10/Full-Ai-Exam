import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TokenService } from '../services/token.service';

/**
 * تنظيف دوري لجدول RefreshToken.
 *
 * TokenService.cleanupExpiredTokens كانت موجودة من البداية وموثّقة إنها
 * "safe to run periodically via cron" — بس ما كان في أي scheduler
 * بالمشروع، فما حدا كان يناديها. يعني صفوف التوكنات المنتهية بتتراكم
 * للأبد. منشغّلها كل يوم بدل ما نحذف الدالة ونخلّي التسريب دائم.
 */
@Injectable()
export class TokenCleanupTask {
  private readonly logger = new Logger(TokenCleanupTask.name);

  constructor(private readonly tokenService: TokenService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'refresh-token-cleanup' })
  async purgeExpiredRefreshTokens(): Promise<void> {
    try {
      const removed = await this.tokenService.cleanupExpiredTokens();
      if (removed > 0) {
        this.logger.log(`Purged ${removed} expired/revoked refresh tokens`);
      }
    } catch (error) {
      // تنظيف فاشل ما لازم يوقع التطبيق
      this.logger.error('Refresh token cleanup failed', error as Error);
    }
  }
}
