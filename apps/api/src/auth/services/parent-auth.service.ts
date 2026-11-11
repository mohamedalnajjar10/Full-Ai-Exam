import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenService } from './token.service';
import { Role } from '@prisma/client';
import { ParentLoginDto } from '../dto/parent-login.dto';
import { DeviceLoginDto } from '../dto/device-login.dto';
import {
  decryptDeviceTrustToken,
  encryptDeviceTrustToken,
  hashMagicToken,
  normalizePhoneNumber,
  safeCompareStrings,
  type DeviceTrustPayload,
} from '../utils/parent-crypto.util';
import { DEV_JWT_SECRET, DUMMY_PASSWORD_HASH } from '../constant/auth-messages';
import { ACCOUNT_SUSPENDED_MESSAGE } from '../strategies/jwt.strategy';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;
const DUMMY_TOKEN_HASH =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const PARENT_PIN_MAX_FAILED_ATTEMPTS = 5;
const PARENT_PIN_LOCK_SECONDS = 15 * 60; // 15 minutes lockout

export interface ParentAuthResult {
  accessToken: string;
  refreshToken: string;
  deviceTrustToken: string;
  user: {
    id: string;
    name: string | null;
    email: string;
    role: Role;
    phone: string;
  };
}

@Injectable()
export class ParentAuthService {
  private readonly logger = new Logger(ParentAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Authenticates a parent using either (phone + 6-digit PIN) or (32-byte Magic Token).
   * Enforces constant-time comparisons to defeat timing side-channel attacks.
   * Guarantees consistent error responses to defeat user enumeration.
   */
  async login(dto: ParentLoginDto): Promise<ParentAuthResult> {
    const hasMagicToken = !!dto.magicToken?.trim();
    const hasPhoneAndPin = !!dto.phone?.trim() && !!dto.pin?.trim();

    if (!hasMagicToken && !hasPhoneAndPin) {
      throw new BadRequestException(
        'Please provide either (phone and pin) or magicToken to sign in',
      );
    }

    let parentUser: {
      id: string;
      email: string;
      name: string | null;
      role: Role;
      emailVerified: boolean;
      suspendedAt: Date | null;
    } | null = null;
    let matchedPhone = '';

    if (hasMagicToken) {
      const rawToken = dto.magicToken!.trim();
      const tokenHash = hashMagicToken(rawToken);

      const link = await this.prisma.parentStudentLink.findFirst({
        where: {
          magicTokenHash: tokenHash,
          status: { in: ['ACTIVE', 'PENDING'] },
        },
        include: {
          parent: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              emailVerified: true,
              suspendedAt: true,
            },
          },
        },
      });

      if (!link || !link.magicTokenHash) {
        // Equalize response timing via constant-time compare & dummy hash to prevent enumeration
        safeCompareStrings(tokenHash, DUMMY_TOKEN_HASH);
        await bcrypt.compare('dummy', DUMMY_PASSWORD_HASH);
        throw new UnauthorizedException('Invalid or expired login credentials');
      }

      // Constant-time check on token hash
      const isTokenMatch = safeCompareStrings(link.magicTokenHash, tokenHash);
      if (!isTokenMatch) {
        throw new UnauthorizedException('Invalid or expired login credentials');
      }

      // Check token expiration
      if (link.magicTokenExpiresAt && link.magicTokenExpiresAt < new Date()) {
        throw new UnauthorizedException('Login link has expired');
      }

      // SEC-01: a PENDING invitation must never unlock an established parent account
      if (link.status === 'PENDING') {
        const activeCount = await this.prisma.parentStudentLink.count({
          where: { parentId: link.parentId, status: 'ACTIVE' },
        });
        if (activeCount > 0) {
          throw new UnauthorizedException(
            'Invalid or expired login credentials. To link a new student, please log in first and scan the QR code.',
          );
        }
      }

      // Atomically invalidate the single-use magic token and activate link if PENDING
      const updateResult = await this.prisma.parentStudentLink.updateMany({
        where: {
          id: link.id,
          magicTokenHash: tokenHash,
        },
        data: {
          magicTokenHash: null,
          magicTokenExpiresAt: null,
          status: 'ACTIVE',
        },
      });

      if (updateResult.count === 0) {
        throw new UnauthorizedException('Invalid or expired login credentials');
      }

      parentUser = link.parent;
      matchedPhone = link.parentPhone;
    } else {
      // Phone + PIN flow
      const normalizedPhone = normalizePhoneNumber(dto.phone!);
      const rawPin = dto.pin!.trim();

      // Check if this phone number is temporarily locked out due to repeated failed PIN attempts
      const isLocked = await this.redisService.get(
        `parent:pin:locked:${normalizedPhone}`,
      );
      if (isLocked) {
        // Equalize bcrypt timing even when locked to defeat timing side-channel attacks
        await bcrypt.compare('dummy', DUMMY_PASSWORD_HASH);
        throw new HttpException(
          'Too many failed PIN attempts. Please try again after 15 minutes.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      const allLinks = await this.prisma.parentStudentLink.findMany({
        where: {
          parentPhone: normalizedPhone,
          status: { in: ['ACTIVE', 'PENDING'] },
        },
        include: {
          parent: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
              emailVerified: true,
              suspendedAt: true,
            },
          },
        },
      });

      if (allLinks.length === 0) {
        // Equalize bcrypt timing when phone does not exist to prevent enumeration
        await bcrypt.compare(rawPin, DUMMY_PASSWORD_HASH);
        await this.recordPinFailure(normalizedPhone);
        throw new UnauthorizedException('Invalid or expired login credentials');
      }

      const activeLinks = allLinks.filter((l) => l.status === 'ACTIVE');
      const pendingLinks = allLinks.filter((l) => l.status === 'PENDING');

      let matchedLink: (typeof allLinks)[0] | null = null;

      if (activeLinks.length > 0) {
        // SEC-01 DEFENSE: This parent account already has ACTIVE child relationships.
        // A PIN from a new/unverified PENDING invitation MUST NEVER unlock an existing
        // parent account or expose other children's data.
        // The PIN must strictly match one of the parent's established ACTIVE links.
        for (const link of activeLinks) {
          const isMatch = await bcrypt.compare(rawPin, link.pinHash);
          if (isMatch && !matchedLink) {
            matchedLink = link;
          }
        }

        // Even if no active link matched, check pending links with dummy compare to equalize timing
        if (!matchedLink) {
          for (const link of pendingLinks) {
            await bcrypt.compare(rawPin, link.pinHash);
          }
          await this.recordPinFailure(normalizedPhone);
          throw new UnauthorizedException(
            'Invalid or expired login credentials. To link a new student, please log in with your established family PIN or use the direct WhatsApp link.',
          );
        }
      } else {
        // First-time parent onboarding: no ACTIVE links exist yet.
        // The pending invitation PIN will activate THAT specific link and onboard the parent.
        for (const link of pendingLinks) {
          const isMatch = await bcrypt.compare(rawPin, link.pinHash);
          if (isMatch && !matchedLink) {
            matchedLink = link;
          }
        }

        if (!matchedLink) {
          await this.recordPinFailure(normalizedPhone);
          throw new UnauthorizedException(
            'Invalid or expired login credentials',
          );
        }

        // Activate this pending link upon first successful login
        await this.prisma.parentStudentLink.update({
          where: { id: matchedLink.id },
          data: { status: 'ACTIVE' },
        });
        matchedLink.status = 'ACTIVE';
      }

      // Successful PIN authentication: clear failure counters and lockouts for this phone number
      await this.clearPinFailures(normalizedPhone);

      parentUser = matchedLink.parent;
      matchedPhone = matchedLink.parentPhone;
    }

    if (!parentUser) {
      throw new UnauthorizedException('Invalid or expired login credentials');
    }

    if (parentUser.suspendedAt) {
      throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE);
    }

    // 1. Issue standard session cookies (accessToken + refreshToken)
    const tokenResult = await this.tokenService.issueTokens(
      parentUser.id,
      parentUser.email,
      parentUser.emailVerified,
    );

    // 2. Issue encrypted 60-day Device Trust Token
    const jwtSecret = this.getJwtSecret();
    const jti = randomUUID();
    const deviceTrustPayload: DeviceTrustPayload = {
      sub: parentUser.id,
      phone: matchedPhone,
      role: Role.PARENT,
      iat: Date.now(),
      exp: Date.now() + SIXTY_DAYS_MS,
      jti,
    };
    const deviceTrustToken = encryptDeviceTrustToken(
      deviceTrustPayload,
      jwtSecret,
    );

    // SEC-02: Register active device trust token in Redis with 60-day TTL
    const ttlSeconds = Math.floor(SIXTY_DAYS_MS / 1000);
    await this.redisService.set(
      `parent:device_trust:${parentUser.id}:${jti}`,
      '1',
      ttlSeconds,
    );

    return {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      deviceTrustToken,
      user: {
        id: parentUser.id,
        name: parentUser.name,
        email: parentUser.email,
        role: parentUser.role,
        phone: matchedPhone,
      },
    };
  }

  /**
   * Re-issues session cookies when Safari/iOS purges client-side cookies,
   * validating the encrypted 60-day Device Trust Token from localStorage.
   */
  async deviceLogin(dto: DeviceLoginDto): Promise<ParentAuthResult> {
    const jwtSecret = this.getJwtSecret();

    // Decrypt and validate AES-256-GCM token & expiration
    const payload = decryptDeviceTrustToken(dto.deviceTrustToken, jwtSecret);

    // SEC-02: Validate that this device trust token jti is active and not revoked in Redis
    const isTrustValid = await this.redisService.get(
      `parent:device_trust:${payload.sub}:${payload.jti}`,
    );
    if (!isTrustValid) {
      throw new UnauthorizedException(
        'Device trust token has expired or been revoked. Please log in with your phone and PIN.',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        emailVerified: true,
        suspendedAt: true,
      },
    });

    if (!user || user.role !== Role.PARENT) {
      throw new UnauthorizedException('Parent account is no longer active');
    }

    if (user.suspendedAt) {
      throw new ForbiddenException(ACCOUNT_SUSPENDED_MESSAGE);
    }

    // Invalidate the old token jti
    await this.redisService.del(
      `parent:device_trust:${payload.sub}:${payload.jti}`,
    );

    // Issue fresh access and refresh token pair
    const tokenResult = await this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );

    // Re-issue a rolling 60-day Device Trust Token with fresh jti
    const freshJti = randomUUID();
    const freshPayload: DeviceTrustPayload = {
      sub: user.id,
      phone: payload.phone,
      role: Role.PARENT,
      iat: Date.now(),
      exp: Date.now() + SIXTY_DAYS_MS,
      jti: freshJti,
    };
    const refreshedTrustToken = encryptDeviceTrustToken(
      freshPayload,
      jwtSecret,
    );
    const ttlSeconds = Math.floor(SIXTY_DAYS_MS / 1000);
    await this.redisService.set(
      `parent:device_trust:${user.id}:${freshJti}`,
      '1',
      ttlSeconds,
    );

    return {
      accessToken: tokenResult.accessToken,
      refreshToken: tokenResult.refreshToken,
      deviceTrustToken: refreshedTrustToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: payload.phone,
      },
    };
  }

  private maskPhone(phone: string): string {
    return phone.length > 4 ? `***${phone.slice(-4)}` : '***';
  }

  private async recordPinFailure(phone: string): Promise<void> {
    try {
      const failures = await this.redisService.incrWithExpiry(
        `parent:pin:failed:${phone}`,
        PARENT_PIN_LOCK_SECONDS,
      );
      if (failures >= PARENT_PIN_MAX_FAILED_ATTEMPTS) {
        await this.redisService.set(
          `parent:pin:locked:${phone}`,
          '1',
          PARENT_PIN_LOCK_SECONDS,
        );
        this.logger.warn(
          `Parent phone "${this.maskPhone(phone)}" locked for ${PARENT_PIN_LOCK_SECONDS}s after ${failures} failed PIN attempts`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to record PIN failure for ${this.maskPhone(phone)}`,
        err,
      );
    }
  }

  private async clearPinFailures(phone: string): Promise<void> {
    try {
      await Promise.all([
        this.redisService.del(`parent:pin:failed:${phone}`),
        this.redisService.del(`parent:pin:locked:${phone}`),
      ]);
    } catch (err) {
      this.logger.error(
        `Failed to clear PIN failures for ${this.maskPhone(phone)}`,
        err,
      );
    }
  }

  /**
   * Logs out the parent session:
   * 1. Revokes the access token in Redis denylist so it cannot be reused.
   * 2. Revokes the refresh token row in PostgreSQL by matching its SHA-256 tokenHash,
   *    and adds it to the Redis denylist.
   * 3. Revokes the device trust token in Redis so it cannot be reused.
   */
  async logout(
    accessToken?: string,
    refreshToken?: string,
    deviceTrustToken?: string,
  ): Promise<void> {
    const tasks: Promise<unknown>[] = [];

    if (accessToken) {
      tasks.push(
        this.tokenService.revokeToken(accessToken).catch((err) => {
          this.logger.error(
            'Failed to revoke parent access token during logout',
            err,
          );
        }),
      );
    }

    if (refreshToken) {
      const tokenHash = this.tokenService.hashToken(refreshToken);
      tasks.push(
        this.prisma.refreshToken
          .updateMany({
            where: { tokenHash, revokedAt: null },
            data: { revokedAt: new Date() },
          })
          .catch((err) => {
            this.logger.error(
              'Failed to revoke parent refresh token during logout',
              err,
            );
          }),
      );
      tasks.push(
        this.tokenService.revokeToken(refreshToken).catch((err) => {
          this.logger.error(
            'Failed to denylist parent refresh token during logout',
            err,
          );
        }),
      );
    }

    // SEC-02: Invalidate device trust token in Redis during logout
    if (deviceTrustToken) {
      try {
        const jwtSecret = this.getJwtSecret();
        const payload = decryptDeviceTrustToken(deviceTrustToken, jwtSecret);
        tasks.push(
          this.redisService
            .del(`parent:device_trust:${payload.sub}:${payload.jti}`)
            .catch((err) => {
              this.logger.error(
                'Failed to revoke device trust token during logout',
                err,
              );
            }),
        );
      } catch {
        // Ignore malformed token during logout
      }
    }

    if (tasks.length > 0) {
      await Promise.allSettled(tasks);
    }
  }

  private getJwtSecret(): string {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const isProductionLike = nodeEnv === 'production' || nodeEnv === 'staging';
    const secret = this.configService.get<string>('JWT_SECRET');
    if (isProductionLike && (!secret || secret === DEV_JWT_SECRET)) {
      throw new Error(
        'JWT_SECRET must be set to a secure value in production and staging environments.',
      );
    }
    return secret ?? DEV_JWT_SECRET;
  }
}
