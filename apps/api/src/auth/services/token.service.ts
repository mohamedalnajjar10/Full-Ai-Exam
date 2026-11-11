import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenRevocationService } from './token-revocation.service';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  DEFAULT_REFRESH_TOKEN_EXPIRES_IN,
  PASSWORD_RESET_TOKEN_EXPIRES_IN,
  TWO_FACTOR_LOGIN_TOKEN_EXPIRES_IN,
} from '../constant/auth-messages';
import type { TokenPayload } from '../interfaces/auth.interfaces';
import { ACCOUNT_SUSPENDED_MESSAGE } from '../strategies/jwt.strategy';

/**
 * Central ownership of JWT signing, verification and session bookkeeping.
 * Every token issued by the auth flows goes through this service.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenRevocationService: TokenRevocationService,
  ) {}

  /**
   * Issues a fresh access/refresh token pair and persists the refresh token
   * (hashed) so it can be rotated and revoked server-side.
   */
  async issueTokens(userId: string, email?: string, emailVerified?: boolean) {
    // كل مسارات الدخول (كلمة مرور، رمز بالبريد، Google، المصادقة الثنائية)
    // بتمرّ من هون — فحص واحد بيسكّرها كلها على الحساب الموقوف
    const account = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { suspendedAt: true, email: true, emailVerified: true },
    });
    if (account?.suspendedAt) {
      throw new UnauthorizedException(ACCOUNT_SUSPENDED_MESSAGE);
    }

    const resolvedEmail = email ?? account?.email ?? '';
    const resolvedVerified = emailVerified ?? account?.emailVerified ?? false;

    const refreshExpiresInSeconds = this.getRefreshExpiresInSeconds();

    const accessToken = await this.jwtService.signAsync(
      this.buildPayload(userId, resolvedEmail, 'access'),
      { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
    );
    const refreshToken = await this.jwtService.signAsync(
      this.buildPayload(userId, resolvedEmail, 'refresh'),
      { expiresIn: refreshExpiresInSeconds },
    );

    const expiresAt = new Date(Date.now() + refreshExpiresInSeconds * 1000);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        email: resolvedEmail,
        emailVerified: resolvedVerified,
      },
    };
  }

  /** Short-lived token proving the first (password) step of a 2FA login. */
  signTwoFactorLoginToken(userId: string, email: string): Promise<string> {
    return this.jwtService.signAsync(
      this.buildPayload(userId, email, 'two-factor-login'),
      { expiresIn: TWO_FACTOR_LOGIN_TOKEN_EXPIRES_IN },
    );
  }

  /** One-time password reset link token bound to the latest nonce. */
  signPasswordResetToken(
    userId: string,
    email: string,
    nonce: string,
  ): Promise<string> {
    return this.jwtService.signAsync(
      this.buildPayload(userId, email, 'password-reset', nonce),
      { expiresIn: PASSWORD_RESET_TOKEN_EXPIRES_IN },
    );
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Revokes a JWT until its natural expiry so it cannot be replayed. */
  async revokeToken(token: string): Promise<void> {
    const decoded = this.jwtService.decode(token);
    const ttlSeconds = Math.max(
      0,
      (decoded?.exp ?? 0) - Math.floor(Date.now() / 1000),
    );
    await this.tokenRevocationService.revoke(token, ttlSeconds);
  }

  /**
   * «إنهاء كل الجلسات»: بيلغي الـ refresh tokens وبيرفض أي access token
   * صدر قبل هاللحظة (صلاحيته ساعة). المستدعي بيمسح كاش المستخدم.
   */
  async endAllSessions(userId: string): Promise<void> {
    await Promise.all([
      this.revokeAllRefreshTokens(userId),
      this.tokenRevocationService.revokeAllForUser(userId),
    ]);
  }

  /** Checks if a JWT has been revoked via Redis denylist. */
  async isRevoked(token: string): Promise<boolean> {
    return this.tokenRevocationService.isRevoked(token);
  }

  /** Revokes every active refresh token for a user (session invalidation). */
  async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Revokes a specific refresh token in PostgreSQL by matching its SHA-256 hash,
   * and denylists it in Redis with a TTL equal to its remaining lifetime until natural expiry.
   */
  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    const decoded = this.jwtService.decode(refreshToken);
    const exp = typeof decoded?.exp === 'number' ? decoded.exp : null;
    const ttlSeconds = exp
      ? Math.max(0, exp - Math.floor(Date.now() / 1000))
      : this.getRefreshExpiresInSeconds();

    if (ttlSeconds > 0) {
      await this.tokenRevocationService.revoke(refreshToken, ttlSeconds);
    }
  }

  /**
   * Purges expired or long-revoked refresh tokens from PostgreSQL.
   * Safe to run periodically via cron / background task.
   */
  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          {
            revokedAt: {
              lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
        ],
      },
    });
    return result.count;
  }

  /** Rotates a refresh token atomically and returns a new access/refresh pair. */
  async refresh(refreshToken: string) {
    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (await this.isRevoked(refreshToken)) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Ensure the user account still exists in the database
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }
    if (user.suspendedAt) {
      await this.revokeAllRefreshTokens(user.id);
      throw new UnauthorizedException(ACCOUNT_SUSPENDED_MESSAGE);
    }

    const tokenHash = this.hashToken(refreshToken);
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (record.revokedAt) {
      // Reuse of an already rotated token is a sign of theft: revoke the whole token family
      await this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Atomic rotation: execute atomic update ensuring exactly 1 active token was revoked
    const result = await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (updateResult.count !== 1) {
        throw new UnauthorizedException(
          'Refresh token was already used or revoked',
        );
      }

      const refreshExpiresInSeconds = this.getRefreshExpiresInSeconds();

      const accessToken = await this.jwtService.signAsync(
        this.buildPayload(user.id, user.email, 'access'),
        { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
      );
      const newRefreshToken = await this.jwtService.signAsync(
        this.buildPayload(user.id, user.email, 'refresh'),
        { expiresIn: refreshExpiresInSeconds },
      );

      const expiresAt = new Date(Date.now() + refreshExpiresInSeconds * 1000);
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(newRefreshToken),
          expiresAt,
        },
      });

      return {
        accessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          emailVerified: user.emailVerified,
        },
      };
    });

    return result;
  }

  private buildPayload(
    userId: string,
    email: string,
    type: TokenPayload['type'],
    prn?: string,
  ): TokenPayload {
    return { sub: userId, email, type, jti: randomUUID(), prn };
  }

  /**
   * Parses the JWT_REFRESH_EXPIRES_IN value (e.g. "7d", "12h", "30m") into
   * seconds. Falls back to 7 days when unset or malformed.
   */
  private getRefreshExpiresInSeconds(): number {
    const value =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      DEFAULT_REFRESH_TOKEN_EXPIRES_IN;

    const match = /^(\d+)([smhdw])$/.exec(value.trim());
    if (!match) {
      return 7 * 24 * 60 * 60;
    }

    const amount = Number(match[1]);
    const unitMultiplier: Record<string, number> = {
      s: 1,
      m: 60,
      h: 60 * 60,
      d: 24 * 60 * 60,
      w: 7 * 24 * 60 * 60,
    };
    return amount * unitMultiplier[match[2]];
  }
}
