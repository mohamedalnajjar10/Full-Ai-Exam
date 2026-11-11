import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { RedisService } from '../../redis/redis.service';

/** أطول عمر لـ access token (ACCESS_TOKEN_EXPIRES_IN = 1h) + هامش */
const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 + 60;

/**
 * Server-side JWT revocation using a Redis denylist.
 * Revoked tokens stay blocked until their original expiry time.
 */
@Injectable()
export class TokenRevocationService {
  constructor(private readonly redisService: RedisService) {}

  async revoke(token: string, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return;
    if (!this.redisService?.set) return;
    await this.redisService.set(this.key(token), '1', Math.ceil(ttlSeconds));
  }

  async isRevoked(token: string): Promise<boolean> {
    if (!this.redisService?.get) return false;
    const value = await this.redisService.get(this.key(token));
    return value !== null && value !== undefined;
  }

  /**
   * «إنهاء كل الجلسات»: أي access token صدر قبل هاللحظة بينرفض. الـ
   * refresh tokens بتنلغى بقاعدة البيانات؛ هاد بيغطي ساعة صلاحية الـ
   * access token يلي ما إلها سجل.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    if (!this.redisService?.set) return;
    await this.redisService.set(
      this.cutoffKey(userId),
      String(Date.now()),
      ACCESS_TOKEN_MAX_AGE_SECONDS,
    );
  }

  /** iat بالثواني (JWT) */
  async issuedBeforeCutoff(userId: string, iat?: number): Promise<boolean> {
    if (!iat || !this.redisService?.get) return false;
    const cutoff = await this.redisService.get(this.cutoffKey(userId));
    // ثواني iat مقرّبة لتحت — توكن صدر بنفس ثانية الإنهاء بينرفض كمان
    return cutoff !== null && iat * 1000 <= Number(cutoff);
  }

  private cutoffKey(userId: string): string {
    return `sessions-cutoff:${userId}`;
  }

  private key(token: string): string {
    const hash = createHash('sha256').update(token).digest('hex');
    return `revoked-token:${hash}`;
  }
}
