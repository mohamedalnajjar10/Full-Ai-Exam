import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import * as QRCode from 'qrcode';
import { MailService } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenService } from './token.service';
import { generateTotpSecret, matchTotpCounter } from '../utils/totp.util';
import { encrypt, decrypt } from '../../common/encryption.util';
import { VerifyTwoFactorDto } from '../dto/verify-two-factor.dto';
import { EnableTwoFactorDto } from '../dto/enable-two-factor.dto';
import { DisableTwoFactorDto } from '../dto/disable-two-factor.dto';
import { VerifyRecoveryCodeDto } from '../dto/verify-recovery-code.dto';
import { TwoFactorCodeDto } from '../dto/two-factor-code.dto';
import {
  TOTP_ISSUER,
  RECOVERY_CODE_COUNT,
  TWO_FACTOR_MAX_FAILED_ATTEMPTS,
  TWO_FACTOR_LOCK_SECONDS,
} from '../constant/auth-messages';
import type { TokenPayload } from '../interfaces/auth.interfaces';

/**
 * All two-factor authentication flows: TOTP setup, enabling/disabling,
 * login verification and single-use recovery codes.
 */
@Injectable()
export class TwoFactorService {
  private readonly logger = new Logger(TwoFactorService.name);
  private readonly encryptionKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly tokenService: TokenService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {
    this.encryptionKey = this.configService.get<string>('ENCRYPTION_KEY') ?? '';
    if (!this.encryptionKey) {
      this.logger.warn(
        'ENCRYPTION_KEY is not set. twoFactorSecret will be stored unencrypted.',
      );
    }
  }

  /** Issues a short-lived login token to complete the 2FA step. */
  async createLoginToken(userId: string, email: string) {
    const loginToken = await this.tokenService.signTwoFactorLoginToken(
      userId,
      email,
    );
    return { requiresTwoFactor: true, loginToken };
  }

  async verifyTwoFactor(verifyTwoFactorDto: VerifyTwoFactorDto) {
    if (!verifyTwoFactorDto.loginToken) {
      throw new UnauthorizedException('Login token not provided');
    }

    const payload = await this.resolveTwoFactorLoginToken(
      verifyTwoFactorDto.loginToken,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException(
        'Two-factor authentication is not enabled for this account',
      );
    }

    await this.acceptTotp(
      user.id,
      this.decryptSecret(user.twoFactorSecret),
      verifyTwoFactorDto.code,
    );

    // Revoke the 2FA login token upon first successful verification to prevent replay
    await this.tokenService.revokeToken(verifyTwoFactorDto.loginToken);

    this.logger.log(`2FA verified successfully for user: ${user.id}`);

    return this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
  }

  async verifyRecoveryCode(verifyRecoveryCodeDto: VerifyRecoveryCodeDto) {
    if (!verifyRecoveryCodeDto.loginToken) {
      throw new UnauthorizedException('Login token not provided');
    }

    const payload = await this.resolveTwoFactorLoginToken(
      verifyRecoveryCodeDto.loginToken,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user || !user.twoFactorEnabled) {
      throw new UnauthorizedException(
        'Two-factor authentication is not enabled for this account',
      );
    }

    await this.assertNotLocked(user.id);
    const storedHashes = user.twoFactorRecoveryCodes ?? [];
    const normalized = verifyRecoveryCodeDto.recoveryCode
      .replace('-', '')
      .toUpperCase();
    const presentedHash = this.tokenService.hashToken(normalized);
    const index = storedHashes.indexOf(presentedHash);

    if (index === -1) {
      await this.recordFailure(user.id);
      throw new UnauthorizedException('Invalid recovery code');
    }
    await this.redisService.del(this.failuresKey(user.id));

    // Recovery codes are single-use: remove the used code and update PostgreSQL
    const updatedCodes = [...storedHashes];
    updatedCodes.splice(index, 1);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorRecoveryCodes: updatedCodes },
    });

    // Revoke the login token upon first use to prevent replay
    await this.tokenService.revokeToken(verifyRecoveryCodeDto.loginToken);

    this.logger.log(
      `2FA recovery code verified successfully for user: ${user.id}`,
    );
    await this.mailService.sendSecurityNotice(
      user.email,
      'تم استخدام رمز استرداد',
      `سُجّل الدخول إلى حسابك باستخدام أحد رموز الاسترداد. تبقّى لديك ${updatedCodes.length} من رموز الاسترداد.`,
    );

    return this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
  }

  async setupTwoFactor(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.twoFactorEnabled) {
      throw new ConflictException(
        'Two-factor authentication is already enabled',
      );
    }

    const secret = generateTotpSecret();
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(
      TOTP_ISSUER,
    )}:${encodeURIComponent(user.email)}?secret=${secret}&issuer=${encodeURIComponent(
      TOTP_ISSUER,
    )}`;

    const encryptedSecret = this.encryptSecret(secret);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: encryptedSecret },
    });

    // Rendered here so the web app doesn't ship a QR library to every visitor
    const svg = await QRCode.toString(otpauthUrl, {
      type: 'svg',
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    const qrCode = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

    return { secret, otpauthUrl, qrCode };
  }

  async enableTwoFactor(userId: string, dto: EnableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.twoFactorEnabled) {
      throw new ConflictException(
        'Two-factor authentication is already enabled',
      );
    }
    if (!user.twoFactorSecret) {
      throw new BadRequestException('Please request a 2FA setup first');
    }

    await this.acceptTotp(
      user.id,
      this.decryptSecret(user.twoFactorSecret),
      dto.code,
    );

    const { rawRecoveryCodes, hashedCodes } = this.newRecoveryCodes();

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: true,
        twoFactorRecoveryCodes: hashedCodes,
      },
    });

    // Invalidate all existing sessions and user cache now that 2FA is required
    await this.tokenService.revokeAllRefreshTokens(user.id);
    await this.redisService.invalidateUserCache(user.id);
    await this.mailService.sendSecurityNotice(
      user.email,
      'تم تفعيل المصادقة الثنائية',
      'أصبح الدخول إلى حسابك يتطلب رمزاً من تطبيق المصادقة (مثل Google Authenticator) إضافة إلى كلمة المرور.',
    );

    // Every session was just revoked — keep this device signed in
    const tokens = await this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
    return {
      message: 'Two-factor authentication enabled successfully',
      recoveryCodes: rawRecoveryCodes,
      ...tokens,
    };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    // Re-authenticate with the password so 2FA cannot be removed by
    // someone holding only a transient TOTP code. Accounts created with
    // Google have no password — they could enable 2FA but never turn it
    // off. For them the signed-in session plus a valid code is the proof.
    if (user.passwordHash) {
      const passwordValid =
        !!dto.password &&
        (await bcrypt.compare(dto.password, user.passwordHash));
      if (!passwordValid) {
        throw new UnauthorizedException('Invalid password');
      }
    }

    await this.acceptTotp(
      user.id,
      this.decryptSecret(user.twoFactorSecret),
      dto.code,
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
      },
    });

    // Invalidate existing sessions and user cache
    await this.tokenService.revokeAllRefreshTokens(user.id);
    await this.redisService.invalidateUserCache(user.id);
    await this.mailService.sendSecurityNotice(
      user.email,
      'تم إيقاف المصادقة الثنائية',
      'لم يعد الدخول إلى حسابك يتطلب رمزاً من تطبيق المصادقة.',
    );

    const tokens = await this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
    return {
      message: 'Two-factor authentication disabled successfully',
      ...tokens,
    };
  }

  /**
   * Replaces all recovery codes (e.g. after using some, or if the old list
   * was exposed). Requires a current authenticator code.
   */
  async regenerateRecoveryCodes(userId: string, dto: TwoFactorCodeDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    await this.acceptTotp(
      user.id,
      this.decryptSecret(user.twoFactorSecret),
      dto.code,
    );

    const { rawRecoveryCodes, hashedCodes } = this.newRecoveryCodes();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { twoFactorRecoveryCodes: hashedCodes },
    });
    await this.mailService.sendSecurityNotice(
      user.email,
      'تم إنشاء رموز استرداد جديدة',
      'أُنشئت رموز استرداد جديدة لحسابك، ولم تعد الرموز القديمة صالحة.',
    );
    return {
      message: 'Recovery codes regenerated',
      recoveryCodes: rawRecoveryCodes,
    };
  }

  /**
   * Checks a TOTP code with two protections the plain check lacked:
   * a per-account cap on wrong codes, and refusal to accept a code (or an
   * older one) that was already used — otherwise a code seen over someone's
   * shoulder stays valid for ~90 seconds.
   */
  private async acceptTotp(
    userId: string,
    secret: string,
    code: string,
  ): Promise<void> {
    await this.assertNotLocked(userId);

    const counter = matchTotpCounter(secret, code);
    if (counter === null) {
      await this.recordFailure(userId);
      throw new UnauthorizedException('Invalid verification code');
    }

    const lastKey = `2fa:last-step:${userId}`;
    const last = Number((await this.redisService.get(lastKey)) ?? -1);
    if (counter <= last) {
      throw new UnauthorizedException(
        'This code was already used. Wait for the next code in your authenticator app.',
      );
    }

    // The accepted window is ±1 step, so 120 s covers every counter that
    // could still be presented
    await this.redisService.set(lastKey, String(counter), 120);
    await this.redisService.del(this.failuresKey(userId));
  }

  private async assertNotLocked(userId: string): Promise<void> {
    if (await this.redisService.get(`2fa:locked:${userId}`)) {
      throw new HttpException(
        'Too many wrong codes. Try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordFailure(userId: string): Promise<void> {
    const failures = await this.redisService.incrWithExpiry(
      this.failuresKey(userId),
      TWO_FACTOR_LOCK_SECONDS,
    );
    // A separate lock key, so the check doesn't depend on reading a counter
    // back with GET (the in-memory fallback keeps counters apart)
    if (failures >= TWO_FACTOR_MAX_FAILED_ATTEMPTS) {
      await this.redisService.set(
        `2fa:locked:${userId}`,
        '1',
        TWO_FACTOR_LOCK_SECONDS,
      );
      this.logger.warn(
        `2FA locked for ${TWO_FACTOR_LOCK_SECONDS}s after repeated wrong codes: ${userId}`,
      );
    }
  }

  private failuresKey(userId: string): string {
    return `2fa:failed:${userId}`;
  }

  private newRecoveryCodes() {
    const rawRecoveryCodes = this.generateRecoveryCodes(RECOVERY_CODE_COUNT);
    const hashedCodes = rawRecoveryCodes.map((code) =>
      this.tokenService.hashToken(code.replace('-', '').toUpperCase()),
    );
    return { rawRecoveryCodes, hashedCodes };
  }

  private encryptSecret(secret: string): string {
    if (!this.encryptionKey) return secret;
    return encrypt(secret, this.encryptionKey);
  }

  private decryptSecret(encryptedSecret: string): string {
    if (!this.encryptionKey) return encryptedSecret;
    try {
      return decrypt(encryptedSecret, this.encryptionKey);
    } catch (error: any) {
      this.logger.error(
        `Failed to decrypt 2FA secret: ${error?.message ?? error}`,
      );
      throw new UnauthorizedException(
        'Failed to authenticate two-factor credentials due to a cryptographic error',
      );
    }
  }

  private async resolveTwoFactorLoginToken(
    loginToken: string,
  ): Promise<TokenPayload> {
    if (!loginToken) {
      throw new UnauthorizedException('Login token not provided');
    }

    if (await this.tokenService.isRevoked(loginToken)) {
      throw new UnauthorizedException(
        'Login token has already been used. Please log in again.',
      );
    }

    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(loginToken);
    } catch (error: unknown) {
      const errName = error instanceof Error ? error.name : 'UnknownTokenError';
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `2FA login token verification failed: ${errName} - ${errMsg}`,
      );
      throw new UnauthorizedException('Invalid or expired login token');
    }
    if (payload.type !== 'two-factor-login') {
      throw new UnauthorizedException('Invalid login token');
    }
    return payload;
  }

  private generateRecoveryCodes(count: number): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const hex = randomBytes(5).toString('hex');
      codes.push(`${hex.slice(0, 5)}-${hex.slice(5)}`);
    }
    return codes;
  }
}
