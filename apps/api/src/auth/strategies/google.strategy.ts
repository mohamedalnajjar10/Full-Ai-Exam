import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from '../services/oauth.service';
import { getBackendUrl } from '../utils/app-urls.util';
import { ACCOUNT_SUSPENDED_MESSAGE } from './jwt.strategy';

/**
 * استراتيجية Google OAuth 2.0 المعتمدة على Passport.
 * تُستخدم لمصادقة المستخدمين عبر حسابات Google واستخراج بيانات الملف الشخصي (Profile).
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly oauthService: OAuthService,
  ) {
    const clientId =
      configService.get<string>('GOOGLE_CLIENT_ID') || 'mock-google-client-id';
    const clientSecret =
      configService.get<string>('GOOGLE_CLIENT_SECRET') ||
      'mock-google-client-secret';
    const callbackURL =
      configService.get<string>('GOOGLE_REDIRECT_URI') ??
      `${getBackendUrl(configService)}/api/v1/auth/oauth/google/callback`;

    super({
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: callbackURL,
      scope: ['email', 'profile'],
    });
  }

  /**
   * دالة التحقق (Validation Callback) التي يستدعيها Passport بعد استلام التوكنات والملف الشخصي من Google.
   *
   * 🛡️ إجراءات الأمان المطبقة:
   * 1. استخراج البريد والاسم من كائن Profile.
   * 2. التحقق من وجود المستخدم أو إنشائه عبر OAuthService مع ضبط oauthProvider = 'GOOGLE' و passwordHash = null.
   * 3. الفحص الصارم للإيقاف: إذا كان الحساب موقوفاً (suspendedAt != null)، يتم رفض العملية فوراً برمي UnauthorizedException.
   */
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      const user = await this.oauthService.validateGoogleUser(profile);

      // 🚨 تحقق أمني إضافي: الحسابات الموقوفة تُمنع قطعياً من الدخول
      if (user.suspendedAt) {
        throw new UnauthorizedException(ACCOUNT_SUSPENDED_MESSAGE);
      }

      done(null, user);
      return user;
    } catch (error) {
      done(error as Error, undefined);
      throw error;
    }
  }
}
