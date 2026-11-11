import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Profile } from 'passport-google-oauth20';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenService } from './token.service';
import {
  OAUTH_STATE_TTL_SECONDS,
  GOOGLE_OAUTH_AUTH_URL,
  GOOGLE_OAUTH_TOKEN_URL,
  GOOGLE_OAUTH_USERINFO_URL,
  GOOGLE_OAUTH_SCOPE,
} from '../constant/auth-messages';
import { getBackendUrl } from '../utils/app-urls.util';
import { ACCOUNT_SUSPENDED_MESSAGE } from '../strategies/jwt.strategy';
import type {
  GoogleOAuthProfile,
  OAuthCallbackResult,
} from '../interfaces/auth.interfaces';
import type { User } from '@prisma/client';

/**
 * خدمة إدارة عمليات تسجيل الدخول والتسجيل عبر Google OAuth 2.0.
 * تتولى:
 * 1. توليد رابط المصادقة مع حماية CSRF عبر معيار state مشفر في Redis ومرتبط بـ TTL.
 * 2. حفظ مسار العودة (next) الآمن للوصول المباشر للصفحة المطلوبة بعد الدخول.
 * 3. حماية الحسابات من الاستيلاء المسبق (Pre-Hijacking Protection) عند ربط الحسابات غير المؤكدة.
 * 4. التحقق الصارم من حالة الحساب ومنع الحسابات الموقوفة (suspendedAt != null) من الدخول.
 * 5. ضبط مهلة زمنية قسرية لطلبات Google الخارجية لمنع استنزاف المقابس (Socket Exhaustion).
 * 6. إصدار جلسة آمنة (JWT) بالاعتماد على TokenService.
 */
@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * توليد رابط شاشة موافقة Google وإرجاع الرابط مع رمز state لربطه بجلسة العميل.
   */
  async generateGoogleOAuthUrl(
    next?: string,
  ): Promise<{ url: string; state: string }> {
    const config = this.getGoogleConfig();
    const state = randomUUID();

    // التحقق من أمان مسار العودة (Open Redirect Prevention): يجب أن يبدأ بـ / ولا يحتوي على //
    const safeNext =
      next &&
      next.startsWith('/') &&
      !next.startsWith('//') &&
      !next.startsWith('/\\')
        ? next
        : null;

    // تخزين الـ state مع مسار العودة في Redis بـ TTL محدد (10 دقائق)
    const redisValue = safeNext ? `google:${safeNext}` : 'google';
    await this.redisService.set(
      `oauth-state:${state}`,
      redisValue,
      OAUTH_STATE_TTL_SECONDS,
    );

    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: GOOGLE_OAUTH_SCOPE,
      access_type: 'online',
      state,
    });

    return {
      url: `${GOOGLE_OAUTH_AUTH_URL}?${params.toString()}`,
      state,
    };
  }

  /**
   * توليد رابط Google OAuth (للتوافق العكسي مع المستدعين الحاليين).
   */
  async getGoogleOAuthUrl(next?: string): Promise<string> {
    const { url } = await this.generateGoogleOAuthUrl(next);
    return url;
  }

  /**
   * استهلاك والتحقق من صلاحية معامل state المخزن في Redis لمرة واحدة فقط لمنع هجمات الإعادة (Replay Attacks).
   */
  async consumeOAuthState(state: string): Promise<{ next?: string | null }> {
    const stored = await this.redisService.get(`oauth-state:${state}`);
    if (!stored) {
      throw new UnauthorizedException(
        'رمز التحقق من الطلب (OAuth state) غير صالح أو منتهي الصلاحية. يرجى إعادة المحاولة.',
      );
    }
    // إتلاف الـ state فور استهلاكه لمنع تكرار استخدام نفس رمز التفويض
    await this.redisService.del(`oauth-state:${state}`);

    const next = stored.startsWith('google:') ? stored.slice(7) : null;
    return { next };
  }

  /**
   * معالجة استجابة Google بعد إعادة التوجيه:
   * التحقق من state، ومبادلة code، واستخراج بيانات المستخدم، وتوليد توكنات الجلسة.
   */
  async handleGoogleOAuthCallback(
    code: string,
    state: string,
  ): Promise<OAuthCallbackResult> {
    const config = this.getGoogleConfig();
    const { next } = await this.consumeOAuthState(state);

    const tokens = await this.exchangeGoogleCode(code, config);
    const profile = await this.fetchGoogleProfile(tokens.access_token);

    const user = await this.findOrCreateOAuthUser(profile);

    // التحقق من تفعيل المصادقة الثنائية (2FA) للحساب
    if (user.twoFactorEnabled) {
      const loginToken = await this.tokenService.signTwoFactorLoginToken(
        user.id,
        user.email,
      );
      return { requiresTwoFactor: true, loginToken, next };
    }

    // إصدار توكنات الدخول الرسمية عبر TokenService
    const issued = await this.tokenService.issueTokens(
      user.id,
      user.email,
      user.emailVerified,
    );
    return {
      requiresTwoFactor: false,
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      user: issued.user,
      next,
    };
  }

  /**
   * دالة مخصصة لـ GoogleStrategy (Passport):
   * تقبل كائن Profile المستخرج من Passport وتتحقق من المستخدم أو تنشئه مع فحص حالة الإيقاف.
   */
  async validateGoogleUser(profile: Profile): Promise<User> {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      throw new UnauthorizedException(
        'تعذر الحصول على البريد الإلكتروني من حساب Google.',
      );
    }

    const name =
      profile.displayName ||
      (profile.name
        ? `${profile.name.givenName || ''} ${profile.name.familyName || ''}`.trim()
        : '') ||
      email.split('@')[0];

    const avatarUrl = profile.photos?.[0]?.value;
    const providerId = profile.id;

    return this.resolveUser({
      providerId,
      email,
      name,
      avatarUrl,
      emailVerified: true,
    });
  }

  /**
   * دالة داخلية لحل حساب المستخدم من كائن GoogleOAuthProfile.
   */
  private async findOrCreateOAuthUser(
    profile: GoogleOAuthProfile,
  ): Promise<User> {
    const email = profile.email;
    const name = profile.name || email.split('@')[0];
    const avatarUrl = profile.picture;
    const providerId = profile.id;

    return this.resolveUser({
      providerId,
      email,
      name,
      avatarUrl,
      emailVerified: profile.verified_email === true,
    });
  }

  /**
   * منطق البحث والإنشاء والربط:
   * 1. البحث بمعرف مزود OAuth أولاً (oauthProviderId).
   * 2. إن لم يوجد، البحث بالبريد الإلكتروني لربط الحساب في حال كان مسجلاً مسبقاً بكلمة مرور.
   * 3. إذا كان الحساب موقوفاً (suspendedAt != null) يتم رفض العملية فوراً برمي UnauthorizedException.
   * 4. حماية Pre-Hijacking: إذا رُبط حساب محلي كان بريده غير مؤكد (emailVerified: false)،
   *    يتم تصفير passwordHash فوراً لمنع المهاجم الذي أنشأ الحساب من الدخول بكلمة مروره.
   * 5. إذا لم يوجد: إنشاء حساب جديد مع oauthProvider = 'GOOGLE' و passwordHash = null.
   */
  private async resolveUser(data: {
    providerId: string;
    email: string;
    name: string;
    avatarUrl?: string;
    emailVerified: boolean;
  }): Promise<User> {
    // 1. البحث بالمعرف الفرعي للمزود باستخدام الفهرس الفريد المركب
    let user = await this.prisma.user.findUnique({
      where: {
        oauthProvider_oauthProviderId: {
          oauthProvider: 'GOOGLE',
          oauthProviderId: data.providerId,
        },
      },
    });

    // 2. إذا لم يُعثر عليه بالمعرف، يتم البحث بواسطة البريد الإلكتروني لربط الحساب الحالي
    if (!user && data.emailVerified) {
      user = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
    }

    // 🚨 3. الفحص الأمني الإلزامي: إذا كان الحساب موقوفاً يُمنع الدخول فوراً برمي UnauthorizedException
    if (user?.suspendedAt) {
      throw new UnauthorizedException(ACCOUNT_SUSPENDED_MESSAGE);
    }

    // 4. في حال وجود الحساب مسبقاً: ربطه بحساب Google
    if (user) {
      const wasUnverified = !user.emailVerified;
      const needsUpdate =
        user.oauthProviderId !== data.providerId ||
        user.oauthProvider !== 'GOOGLE' ||
        wasUnverified;

      if (needsUpdate) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            oauthProvider: 'GOOGLE',
            oauthProviderId: data.providerId,
            emailVerified: true,
            avatar: user.avatar || data.avatarUrl || undefined,
            // 🛡️ حماية ضد Pre-Hijacking: إذا كان البريد غير مؤكد سابقاً، فإن كلمة المرور وضعت
            // من قِبل شخص لم يثبت ملكيته للبريد؛ لذا يتم تصفيرها لحرمان المهاجم من الدخول بها.
            ...(wasUnverified && { passwordHash: null }),
          },
        });
      }
      return user;
    }

    // 5. في حال عدم وجود الحساب: إنشاء حساب جديد كلياً
    // ملاحظة أمنية: passwordHash يكون null للمستخدمين المسجلين عبر Google لمنع الدخول عبر مسار كلمة المرور القياسي
    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: null,
        emailVerified: data.emailVerified,
        oauthProvider: 'GOOGLE',
        oauthProviderId: data.providerId,
        avatar: data.avatarUrl || null,
      },
    });
  }

  private async exchangeGoogleCode(
    code: string,
    config: { clientId: string; clientSecret: string; redirectUri: string },
  ): Promise<{ access_token: string; refresh_token?: string }> {
    const response = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
      // ⏱️ مهلة زمنية قسرية (10 ثوانٍ) لمنع تعليق المقابس والاتصالات
      signal: AbortSignal.timeout(10_000),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new UnauthorizedException('فشل تبادل رمز التفويض مع خوادم Google.');
    }
    return data;
  }

  private async fetchGoogleProfile(
    accessToken: string,
  ): Promise<GoogleOAuthProfile> {
    const response = await fetch(GOOGLE_OAUTH_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      // ⏱️ مهلة زمنية قسرية (10 ثوانٍ)
      signal: AbortSignal.timeout(10_000),
    });

    const profile = await response.json().catch(() => null);
    if (!response.ok || !profile?.id || !profile?.email) {
      throw new UnauthorizedException(
        'فشل جلب بيانات الملف الشخصي من حساب Google.',
      );
    }
    return profile as GoogleOAuthProfile;
  }

  private getGoogleConfig(): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');

    // دعم كلا المتغيرين دفاعياً لمنع أخطاء التكوين
    const redirectUri =
      this.configService.get<string>('GOOGLE_REDIRECT_URI') ??
      this.configService.get<string>('GOOGLE_CALLBACK_URL') ??
      `${getBackendUrl(this.configService)}/api/v1/auth/oauth/google/callback`;

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'Google OAuth settings are incomplete. إعدادات Google OAuth غير مكتملة في الخادم. يرجى التواصل مع مسؤول النظام.',
      );
    }
    return { clientId, clientSecret, redirectUri };
  }
}
