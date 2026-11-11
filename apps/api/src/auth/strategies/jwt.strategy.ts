import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenRevocationService } from '../services/token-revocation.service';
import { DEV_JWT_SECRET } from '../constant/auth-messages';
import type { JwtPayload } from '../interfaces/auth.interfaces';
import { effectivePermissions } from '../../common/permissions';

const USER_CACHE_TTL_SECONDS = 60;
/** lastActiveAt بيتحدّث مرة كل هالمدة بالأكتر — مش بكل طلب */
const LAST_ACTIVE_RESOLUTION_MS = 5 * 60_000;

export const ACCOUNT_SUSPENDED_MESSAGE =
  'تم إيقاف هذا الحساب. تواصل مع إدارة المنصة.';

/** request.user: الحساب بدون الأسرار + صلاحيات لوحة التحكم المحسوبة */
export type AuthenticatedUser = Omit<
  User,
  'passwordHash' | 'twoFactorSecret' | 'twoFactorRecoveryCodes'
> & {
  staffRole: { id: string; name: string } | null;
  permissions: string[];
};

export function extractJwtFromRequest(req: Request): string | null {
  if (!req) return null;

  // 1. Authorization Bearer header
  const bearer = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (bearer) return bearer;

  // 2. Parent context cookie check
  const isParentContext =
    req.headers?.['x-session-context'] === 'parent' ||
    req.originalUrl?.includes('/parent') ||
    req.url?.includes('/parent');

  if (isParentContext && req.cookies?.['parent_access_token']) {
    return req.cookies['parent_access_token'];
  }

  // 3. Main user / student cookie (also used by SSE streams with withCredentials: true)
  if (req.cookies?.['access_token']) {
    return req.cookies['access_token'];
  }

  // 4. Fallback to parent cookie if only parent session is active
  if (req.cookies?.['parent_access_token']) {
    return req.cookies['parent_access_token'];
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private tokenRevocationService: TokenRevocationService,
    private redisService: RedisService,
  ) {
    const nodeEnv = config.get<string>('NODE_ENV');
    const isProductionLike = nodeEnv === 'production' || nodeEnv === 'staging';
    const secret = config.get<string>('JWT_SECRET');
    if (isProductionLike && (!secret || secret === DEV_JWT_SECRET)) {
      throw new Error(
        'JWT_SECRET must be set to a secure value in production and staging environments.',
      );
    }
    super({
      jwtFromRequest: (req: Request) => extractJwtFromRequest(req),
      ignoreExpiration: false,
      secretOrKey: secret ?? DEV_JWT_SECRET,
      passReqToCallback: true,
    });
  }

  async validate(
    request: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException('Invalid session. Please log in again.');
    }

    const token = extractJwtFromRequest(request);

    // Check revocation and cache in parallel
    const [isRevoked, beforeCutoff, cached] = await Promise.all([
      token
        ? this.tokenRevocationService.isRevoked(token)
        : Promise.resolve(false),
      this.tokenRevocationService.issuedBeforeCutoff(payload.sub, payload.iat),
      this.redisService.get(`jwt-user:${payload.sub}`),
    ]);

    if (isRevoked || beforeCutoff) {
      throw new UnauthorizedException(
        'Session has been terminated. Please log in again.',
      );
    }

    if (cached) {
      const user = JSON.parse(cached) as AuthenticatedUser;
      // الإيقاف بيمسح الكاش، بس منفحص هون كمان احتياطاً
      if (user.suspendedAt) {
        throw new UnauthorizedException(ACCOUNT_SUSPENDED_MESSAGE);
      }
      return user;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        staffRole: { select: { id: true, name: true, permissions: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid session. Please log in again.');
    }
    if (user.suspendedAt) {
      throw new UnauthorizedException(ACCOUNT_SUSPENDED_MESSAGE);
    }

    // Cache a safe subset — strip passwordHash, twoFactorSecret, and recoveryCodes
    const {
      passwordHash: _,
      twoFactorSecret: __,
      twoFactorRecoveryCodes: ___,
      staffRole,
      ...rest
    } = user;
    const safeUser: AuthenticatedUser = {
      ...rest,
      staffRole: staffRole ? { id: staffRole.id, name: staffRole.name } : null,
      permissions: effectivePermissions(user),
    };

    await this.redisService.set(
      `jwt-user:${payload.sub}`,
      JSON.stringify(safeUser),
      USER_CACHE_TTL_SECONDS,
    );
    this.touchLastActive(user.id, user.lastActiveAt);

    return safeUser;
  }

  /**
   * «آخر نشاط» بصفحة المستخدمين. بيصير هون لأن الكاش بيفضى كل دقيقة، فهاد
   * أرخص مكان بيشوف كل مستخدم نشط — وما منستنّاه حتى ما يبطّئ الطلب.
   */
  private touchLastActive(userId: string, last: Date | null) {
    if (last && Date.now() - last.getTime() < LAST_ACTIVE_RESOLUTION_MS) {
      return;
    }
    this.prisma.user
      .update({ where: { id: userId }, data: { lastActiveAt: new Date() } })
      .catch(() => undefined);
  }
}
