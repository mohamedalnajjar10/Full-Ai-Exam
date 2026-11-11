import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { randomInt, createHash, timingSafeEqual } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenRevocationService } from './token-revocation.service';
import { RedisService } from '../../redis/redis.service';
import { MailService } from '../../mail/mail.service';
import { TokenService } from './token.service';
import { TwoFactorService } from './two-factor.service';
import { OAuthService } from './oauth.service';
import { PasswordService } from './password.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { VerifyTwoFactorDto } from '../dto/verify-two-factor.dto';
import { EnableTwoFactorDto } from '../dto/enable-two-factor.dto';
import { DisableTwoFactorDto } from '../dto/disable-two-factor.dto';
import { VerifyRecoveryCodeDto } from '../dto/verify-recovery-code.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { TwoFactorCodeDto } from '../dto/two-factor-code.dto';
import {
  BCRYPT_SALT_ROUNDS,
  EMAIL_VERIFICATION_CODE_TTL_SECONDS,
  EMAIL_VERIFICATION_MAX_ATTEMPTS,
  DUMMY_PASSWORD_HASH,
  LOGIN_CODE_TTL_SECONDS,
  LOGIN_CODE_MAX_ATTEMPTS,
  EMAIL_CODE_COOLDOWN_SECONDS,
} from '../constant/auth-messages';
import type { OAuthCallbackResult } from '../interfaces/auth.interfaces';
import { Logger } from '@nestjs/common';

import { Prisma } from '@prisma/client';

/**
 * Core authentication flows: account registration, email verification,
 * credential login, logout and profile. Token, 2FA, OAuth and password
 * recovery concerns live in their own focused services.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tokenRevocationService: TokenRevocationService,
    private readonly redisService: RedisService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly tokenService: TokenService,
    private readonly twoFactorService: TwoFactorService,
    private readonly oauthService: OAuthService,
    private readonly passwordService: PasswordService,
  ) {}

  async register(registerDto: RegisterDto) {
    const passwordHash = await bcrypt.hash(
      registerDto.password,
      BCRYPT_SALT_ROUNDS,
    );

    // The code used to be returned in this response too, which let anyone
    // "verify" an address they don't own. It only ever travels by email now.
    const created = {
      message:
        'Account created successfully. A verification code has been sent to your email.',
    };

    try {
      const user = await this.prisma.user.create({
        data: {
          name: registerDto.name,
          email: registerDto.email,
          passwordHash,
        },
      });
      await this.sendEmailVerification(user.id, user.email);
      return created;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // An unverified account proves nothing about who owns the address.
        // Without this, anyone could squat an email and lock its real owner
        // out of registering. Whoever completes verification owns it.
        const existing = await this.prisma.user.findUnique({
          where: { email: registerDto.email },
        });
        if (existing && !existing.emailVerified && !existing.oauthProvider) {
          await this.prisma.user.update({
            where: { id: existing.id },
            data: { name: registerDto.name, passwordHash },
          });
          await this.sendEmailVerification(existing.id, existing.email);
          return created;
        }
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  /**
   * Marks a user's email as verified using the code from the email.
   */
  async verifyEmail(email: string, code: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException(
        'Invalid verification code. Please request a new one.',
      );
    }

    if (user.emailVerified) {
      return { message: 'Email is already verified' };
    }

    const attempts = await this.redisService.incrWithExpiry(
      this.emailVerificationAttemptsKey(user.id),
      EMAIL_VERIFICATION_CODE_TTL_SECONDS,
    );
    if (attempts > EMAIL_VERIFICATION_MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        'You have exhausted verification attempts. Please request a new code.',
      );
    }

    const storedCode = await this.redisService.get(
      this.emailVerificationKey(user.id),
    );
    if (!storedCode) {
      throw new UnauthorizedException(
        'Verification code has expired. Please request a new one.',
      );
    }
    if (!codesMatch(storedCode, code)) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    await this.redisService.del(this.emailVerificationKey(user.id));
    await this.redisService.del(this.emailVerificationAttemptsKey(user.id));

    // The code just proved the student owns this inbox, which is the same
    // proof a sign-in code gives — so sign them in instead of sending them
    // back to type the password they chose a minute ago.
    this.logger.log(`Email verified, signing in user: ${user.id}`);
    const tokens = await this.tokenService.issueTokens(
      user.id,
      user.email,
      true,
    );
    return { message: 'Email verified successfully', ...tokens };
  }

  /**
   * Sends a fresh verification code to the user's email. Always returns the
   * same message so the response does not reveal whether the email exists.
   */
  async resendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (user && !user.emailVerified) {
      await this.sendEmailVerification(user.id, user.email);
    } else if (!user) {
      // Equalize timing so response doesn't reveal whether email exists
      await dummyComparison();
    }

    return { message: 'Verification code sent to your email' };
  }

  /**
   * Passwordless sign-in, step 1: email a one-time code. Same response
   * whether or not the account exists, so it can't be used to probe emails.
   */
  async requestLoginCode(email: string) {
    const message =
      'If an account exists for this email, a sign-in code has been sent';
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await dummyComparison();
      return { message };
    }

    // One email per minute per account, on top of the per-IP throttle
    const cooldownKey = `login-code:cooldown:${user.id}`;
    if (await this.redisService.get(cooldownKey)) return { message };
    await this.redisService.set(cooldownKey, '1', EMAIL_CODE_COOLDOWN_SECONDS);

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redisService.set(
      this.loginCodeKey(user.id),
      code,
      LOGIN_CODE_TTL_SECONDS,
    );
    await this.redisService.del(this.loginCodeAttemptsKey(user.id));
    await this.mailService.sendLoginCodeEmail(user.email, code);
    this.logger.log(`Sign-in code emailed to user: ${user.id}`);
    return { message };
  }

  /**
   * Passwordless sign-in, step 2. A correct code proves inbox ownership, so
   * it also verifies an unverified email. 2FA still applies on top.
   */
  async verifyLoginCode(email: string, code: string) {
    const invalid = () =>
      new UnauthorizedException('Invalid or expired sign-in code');
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await dummyComparison();
      throw invalid();
    }

    const attempts = await this.redisService.incrWithExpiry(
      this.loginCodeAttemptsKey(user.id),
      LOGIN_CODE_TTL_SECONDS,
    );
    if (attempts > LOGIN_CODE_MAX_ATTEMPTS) {
      // Burn the code: five wrong guesses means a fresh one is needed
      await this.redisService.del(this.loginCodeKey(user.id));
      throw new UnauthorizedException(
        'Too many wrong codes. Please request a new sign-in code.',
      );
    }

    const stored = await this.redisService.get(this.loginCodeKey(user.id));
    if (!stored || !codesMatch(stored, code)) throw invalid();

    // Single use
    await this.redisService.del(this.loginCodeKey(user.id));
    await this.redisService.del(this.loginCodeAttemptsKey(user.id));

    if (!user.emailVerified) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });
    }

    if (user.twoFactorEnabled) {
      this.logger.log(
        `Sign-in code accepted, 2FA required for user: ${user.id}`,
      );
      return this.twoFactorService.createLoginToken(user.id, user.email);
    }
    this.logger.log(`Signed in with emailed code: ${user.id}`);
    return this.tokenService.issueTokens(user.id, user.email, true);
  }

  /**
   * Changes the password of a signed-in user — or sets one for an account
   * created with Google, which has none. Every other session is signed out.
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    if (user.passwordHash) {
      const ok =
        !!dto.currentPassword &&
        (await bcrypt.compare(dto.currentPassword, user.passwordHash));
      if (!ok) throw new UnauthorizedException('Current password is incorrect');
      if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
        throw new BadRequestException(
          'The new password must be different from the current one',
        );
      }
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_SALT_ROUNDS);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    await this.tokenService.revokeAllRefreshTokens(userId);
    await this.redisService.invalidateUserCache(userId);
    await this.mailService.sendSecurityNotice(
      user.email,
      user.passwordHash ? 'تم تغيير كلمة المرور' : 'تم تعيين كلمة مرور لحسابك',
      'تم تحديث كلمة المرور لحسابك في مسار التميز، وسُجّل خروجك من كل الأجهزة الأخرى.',
    );
    this.logger.log(
      `Password ${user.passwordHash ? 'changed' : 'set'} for user: ${userId}`,
    );

    // Keep this device signed in with a fresh session
    const tokens = await this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
    return { message: 'Password updated successfully', ...tokens };
  }

  async login(loginDto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
    });
    if (!user) {
      // Perform a dummy bcrypt comparison so response time does not reveal
      // whether the email is registered.
      await dummyComparison();
      this.logger.warn(
        `Failed login attempt for non-existent email from unknown IP`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash) {
      await dummyComparison();
      this.logger.warn(`Failed login attempt for OAuth-only user: ${user.id}`);
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );
    if (!passwordValid) {
      this.logger.warn(
        `Failed login attempt (wrong password) for user: ${user.id}`,
      );
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerified) {
      throw new ForbiddenException(
        'Please verify your email before logging in',
      );
    }

    if (user.twoFactorEnabled) {
      this.logger.log(`2FA challenge required for user: ${user.id}`);
      return this.twoFactorService.createLoginToken(user.id, user.email);
    }

    this.logger.log(`Successful login for user: ${user.id}`);

    return this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
  }

  async logout(token: string) {
    const decoded = this.jwtService.decode(token);
    if (decoded?.exp) {
      const ttlSeconds = Math.max(
        0,
        decoded.exp - Math.floor(Date.now() / 1000),
      );
      await this.tokenRevocationService.revoke(token, ttlSeconds);
    }
    if (decoded?.type === 'refresh') {
      await this.tokenService.revokeRefreshToken(token);
    }
    if (decoded?.sub) {
      await this.tokenService.revokeAllRefreshTokens(decoded.sub);
      await this.redisService.invalidateUserCache(decoded.sub);
    }
    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      // Select only the fields we expose — sensitive columns (passwordHash,
      // twoFactorSecret, twoFactorRecoveryCodes) never enter application memory.
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  verifyTwoFactor(verifyTwoFactorDto: VerifyTwoFactorDto) {
    return this.twoFactorService.verifyTwoFactor(verifyTwoFactorDto);
  }

  verifyRecoveryCode(verifyRecoveryCodeDto: VerifyRecoveryCodeDto) {
    return this.twoFactorService.verifyRecoveryCode(verifyRecoveryCodeDto);
  }

  setupTwoFactor(userId: string) {
    return this.twoFactorService.setupTwoFactor(userId);
  }

  enableTwoFactor(userId: string, enableTwoFactorDto: EnableTwoFactorDto) {
    return this.twoFactorService.enableTwoFactor(userId, enableTwoFactorDto);
  }

  disableTwoFactor(userId: string, disableTwoFactorDto: DisableTwoFactorDto) {
    return this.twoFactorService.disableTwoFactor(userId, disableTwoFactorDto);
  }

  regenerateRecoveryCodes(userId: string, dto: TwoFactorCodeDto) {
    return this.twoFactorService.regenerateRecoveryCodes(userId, dto);
  }

  refresh(refreshToken: string) {
    return this.tokenService.refresh(refreshToken);
  }

  forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    return this.passwordService.forgotPassword(forgotPasswordDto);
  }

  resetPassword(resetPasswordDto: ResetPasswordDto) {
    return this.passwordService.resetPassword(resetPasswordDto);
  }

  getGoogleOAuthUrl(next?: string): Promise<string> {
    return this.oauthService.getGoogleOAuthUrl(next);
  }

  generateGoogleOAuthUrl(
    next?: string,
  ): Promise<{ url: string; state: string }> {
    return this.oauthService.generateGoogleOAuthUrl(next);
  }

  handleGoogleOAuthCallback(
    code: string,
    state: string,
  ): Promise<OAuthCallbackResult> {
    return this.oauthService.handleGoogleOAuthCallback(code, state);
  }

  /**
   * Issues a fresh verification code (invalidating any previously sent ones)
   * and emails it to the user.
   */
  private async sendEmailVerification(
    userId: string,
    email: string,
  ): Promise<void> {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redisService.set(
      this.emailVerificationKey(userId),
      code,
      EMAIL_VERIFICATION_CODE_TTL_SECONDS,
    );
    await this.redisService.del(this.emailVerificationAttemptsKey(userId));

    await this.mailService.sendVerificationEmail(email, code);
  }

  private loginCodeKey(userId: string): string {
    return `login-code:${userId}`;
  }

  private loginCodeAttemptsKey(userId: string): string {
    return `login-code:attempts:${userId}`;
  }

  private emailVerificationKey(userId: string): string {
    return `email-verification:${userId}`;
  }

  private emailVerificationAttemptsKey(userId: string): string {
    return `email-verification:attempts:${userId}`;
  }
}

/** Constant-time comparison of two verification codes */
function codesMatch(a: string, b: string): boolean {
  const aHash = createHash('sha256').update(String(a)).digest();
  const bHash = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(aHash, bHash);
}

/**
 * Performs a dummy bcrypt comparison to equalize response timing,
 * preventing timing-based user enumeration attacks.
 */
async function dummyComparison(): Promise<void> {
  await bcrypt.compare('dummy', DUMMY_PASSWORD_HASH);
}
