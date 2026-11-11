import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import { AuthService } from './services/auth.service';
import { ParentAuthService } from './services/parent-auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ParentLoginDto } from './dto/parent-login.dto';
import { DeviceLoginDto } from './dto/device-login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';
import { EnableTwoFactorDto } from './dto/enable-two-factor.dto';
import { DisableTwoFactorDto } from './dto/disable-two-factor.dto';
import { VerifyRecoveryCodeDto } from './dto/verify-recovery-code.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestLoginCodeDto, VerifyLoginCodeDto } from './dto/login-code.dto';
import { TwoFactorCodeDto } from './dto/two-factor-code.dto';
import { ThrottleGuard } from '../common/guards/throttle.guard';
import { Throttle } from '../common/decorators/throttle.decorator';
import { CurrentUser, Public, AccessToken } from '../common';
import { resetPasswordPage } from './utils/pages';
import { getFrontendUrl } from './utils/app-urls.util';

const isProduction = process.env.NODE_ENV === 'production';

function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 1000, // 1 hour
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

/**
 * Strips tokens out of a response body.
 *
 * The tokens travel as httpOnly cookies. Returning them in the body as well
 * handed them straight to any script on the page, which cancelled out the
 * httpOnly protection the cookies exist to provide.
 */
function withoutTokens<T extends Record<string, unknown>>(
  result: T,
): Omit<T, 'accessToken' | 'refreshToken' | 'loginToken'> {
  const {
    accessToken: _accessToken,
    refreshToken: _refreshToken,
    loginToken: _loginToken,
    ...safe
  } = result as T & {
    accessToken?: string;
    refreshToken?: string;
    loginToken?: string;
  };
  return safe;
}

/**
 * Applies whatever a sign-in step produced: a full session goes into the
 * auth cookies, a pending 2FA challenge into the short-lived login_token
 * cookie. Shared by every flow that can end in a session.
 */
function applySignInResult<T extends Record<string, unknown>>(
  res: Response,
  result: T,
) {
  const r = result as T & {
    accessToken?: string;
    refreshToken?: string;
    loginToken?: string;
    requiresTwoFactor?: boolean;
  };
  if (r.accessToken && r.refreshToken) {
    setAuthCookies(res, r.accessToken, r.refreshToken);
    res.clearCookie('login_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });
  } else if (r.requiresTwoFactor && r.loginToken) {
    res.cookie('login_token', r.loginToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: 5 * 60 * 1000,
    });
  }
  return withoutTokens(result);
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('access_token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
  res.clearCookie('refresh_token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

function setParentAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie('parent_access_token', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 1000, // 1 hour
  });
  res.cookie('parent_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

function clearParentAuthCookies(res: Response): void {
  res.clearCookie('parent_access_token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
  res.clearCookie('parent_refresh_token', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}

/**
 * Controller for user account management and authentication
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly parentAuthService: ParentAuthService,
  ) {}

  /**
   * Creates a new user account with email and password
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({
    status: 201,
    description:
      'Account created successfully. Returns verification message, code, and verificationCode.',
  })
  @ApiResponse({ status: 400, description: 'Invalid or incomplete data' })
  @ApiResponse({ status: 409, description: 'Email is already registered' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.CREATED)
  register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  /**
   * Verifies the email address using the code from the email
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('verify-email')
  @ApiOperation({
    summary: 'Verify an email address using the emailed verification code',
  })
  @ApiResponse({ status: 200, description: 'Email verified' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid or expired code' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() verifyEmailDto: VerifyEmailDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.verifyEmail(
      verifyEmailDto.email,
      verifyEmailDto.code,
    );
    // A successful verification signs the student in
    return applySignInResult(res, result);
  }

  /**
   * Emails a one-time sign-in code (passwordless login)
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 10 * 60_000 })
  @Post('login/code')
  @ApiOperation({ summary: 'Email a one-time sign-in code' })
  @ApiResponse({ status: 200, description: 'Code sent if the account exists' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  requestLoginCode(@Body() dto: RequestLoginCodeDto) {
    return this.authService.requestLoginCode(dto.email);
  }

  /**
   * Signs in with an emailed one-time code
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 10 * 60_000 })
  @Post('login/code/verify')
  @ApiOperation({ summary: 'Sign in with an emailed one-time code' })
  @ApiResponse({ status: 200, description: 'Signed in, or 2FA required' })
  @ApiResponse({ status: 401, description: 'Invalid or expired code' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async verifyLoginCode(
    @Body() dto: VerifyLoginCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return applySignInResult(
      res,
      await this.authService.verifyLoginCode(dto.email, dto.code),
    );
  }

  /**
   * Changes (or, for Google accounts, sets) the password
   */
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 10 * 60_000 })
  @Post('password/change')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Change or set the account password; signs out other devices',
  })
  @ApiResponse({ status: 200, description: 'Password updated' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or unchanged password',
  })
  @ApiResponse({ status: 401, description: 'Wrong current password' })
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @CurrentUser() user: User,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return applySignInResult(
      res,
      await this.authService.changePassword(user.id, dto),
    );
  }

  /**
   * Sends a fresh verification code to the given email
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 3, windowMs: 10 * 60_000 })
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend the email verification code' })
  @ApiResponse({
    status: 200,
    description: 'Verification code sent (returns code and verificationCode)',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  resendVerification(@Body() resendVerificationDto: ResendVerificationDto) {
    return this.authService.resendVerification(resendVerificationDto.email);
  }

  /**
   * Logs a user in with email and password.
   * Sets secure HttpOnly cookies and returns token payload.
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 10 * 60_000 })
  @Post('login')
  @ApiOperation({ summary: 'Log in with email and password' })
  @ApiResponse({
    status: 200,
    description:
      'Login successful (JWT returned and set in cookies, or loginToken when 2FA is required)',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    if ('accessToken' in result && 'refreshToken' in result) {
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.clearCookie('login_token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
      });
    } else if (
      'requiresTwoFactor' in result &&
      result.requiresTwoFactor &&
      result.loginToken
    ) {
      res.cookie('login_token', result.loginToken, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 5 * 60 * 1000, // 5 minutes
      });
    }
    return withoutTokens(result);
  }

  /**
   * Completes a login by verifying the two-factor authentication code
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('verify-2fa')
  @ApiOperation({
    summary: 'Verify two-factor authentication code to complete login',
  })
  @ApiResponse({ status: 200, description: 'Code verified, JWT returned' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid code or login token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactor(
    @Req() req: Request,
    @Body() verifyTwoFactorDto: VerifyTwoFactorDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const loginToken =
      verifyTwoFactorDto.loginToken || req.cookies?.['login_token'];
    if (!loginToken) {
      throw new UnauthorizedException('Login token not provided');
    }
    const result = await this.authService.verifyTwoFactor({
      ...verifyTwoFactorDto,
      loginToken,
    });
    if ('accessToken' in result && 'refreshToken' in result) {
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.clearCookie('login_token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
      });
    }
    return withoutTokens(result);
  }

  /**
   * Completes a login using a one-time 2FA recovery code
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('2fa/recovery')
  @ApiOperation({
    summary: 'Complete a login using a one-time 2FA recovery code',
  })
  @ApiResponse({
    status: 200,
    description: 'Recovery code verified, JWT returned',
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid code or login token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async verifyRecoveryCode(
    @Req() req: Request,
    @Body() verifyRecoveryCodeDto: VerifyRecoveryCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const loginToken =
      verifyRecoveryCodeDto.loginToken || req.cookies?.['login_token'];
    if (!loginToken) {
      throw new UnauthorizedException('Login token not provided');
    }
    const result = await this.authService.verifyRecoveryCode({
      ...verifyRecoveryCodeDto,
      loginToken,
    });
    if ('accessToken' in result && 'refreshToken' in result) {
      setAuthCookies(res, result.accessToken, result.refreshToken);
      res.clearCookie('login_token', {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
      });
    }
    return withoutTokens(result);
  }

  /**
   * Exchanges a valid refresh token (from HttpOnly cookie or request body) for a new token pair
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, windowMs: 60_000 })
  @Post('refresh')
  @ApiOperation({
    summary:
      'Get a new access token using a valid refresh token (from cookie or body)',
  })
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() refreshTokenDto?: RefreshTokenDto,
  ) {
    const token =
      req.cookies?.['refresh_token'] || refreshTokenDto?.refreshToken;

    if (!token) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    const result = await this.authService.refresh(token);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return withoutTokens(result);
  }

  /**
   * Logs the user out, revokes the access token, and clears auth cookies
   */
  @Post('logout')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Log out and revoke the current session token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @HttpCode(HttpStatus.OK)
  async logout(
    @AccessToken() token: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    clearAuthCookies(res);
    return this.authService.logout(token ?? '');
  }

  /**
   * Returns the profile of the currently authenticated user
   */
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get the currently authenticated user profile' })
  @ApiResponse({ status: 200, description: 'Profile returned' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  profile(@CurrentUser() user: User) {
    return this.authService.getProfile(user.id);
  }

  /**
   * Generates a TOTP secret and otpauth URL for setting up 2FA
   */
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('2fa/setup')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Generate a TOTP secret and otpauth URL to set up 2FA',
  })
  @ApiResponse({ status: 200, description: 'Secret and otpauth URL returned' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @ApiResponse({ status: 409, description: '2FA is already enabled' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  setupTwoFactor(@CurrentUser() user: User) {
    return this.authService.setupTwoFactor(user.id);
  }

  /**
   * Verifies a TOTP code and enables 2FA on the account
   */
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('2fa/enable')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Verify a TOTP code and enable 2FA on the account',
  })
  @ApiResponse({
    status: 200,
    description: '2FA enabled, recovery codes returned',
  })
  @ApiResponse({ status: 400, description: 'Invalid input or no setup first' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or invalid code',
  })
  @ApiResponse({ status: 409, description: '2FA is already enabled' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async enableTwoFactor(
    @CurrentUser() user: User,
    @Body() enableTwoFactorDto: EnableTwoFactorDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Enabling revokes every session; the service issues a new one for this device
    return applySignInResult(
      res,
      await this.authService.enableTwoFactor(user.id, enableTwoFactorDto),
    );
  }

  /**
   * Verifies a TOTP code and the account password, then disables 2FA
   */
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('2fa/disable')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Verify a TOTP code and password, then disable 2FA',
  })
  @ApiResponse({ status: 200, description: '2FA disabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input or 2FA not enabled' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or invalid code/password',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async disableTwoFactor(
    @CurrentUser() user: User,
    @Body() disableTwoFactorDto: DisableTwoFactorDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return applySignInResult(
      res,
      await this.authService.disableTwoFactor(user.id, disableTwoFactorDto),
    );
  }

  /**
   * Replaces the recovery codes; requires a current authenticator code
   */
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('2fa/recovery-codes')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Regenerate 2FA recovery codes' })
  @ApiResponse({ status: 200, description: 'New recovery codes returned' })
  @ApiResponse({ status: 400, description: '2FA not enabled' })
  @ApiResponse({ status: 401, description: 'Invalid code' })
  @HttpCode(HttpStatus.OK)
  regenerateRecoveryCodes(
    @CurrentUser() user: User,
    @Body() dto: TwoFactorCodeDto,
  ) {
    return this.authService.regenerateRecoveryCodes(user.id, dto);
  }

  /**
   * Sends a password reset link to the given email
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 3, windowMs: 10 * 60_000 })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Send a password reset link to the user email' })
  @ApiResponse({ status: 200, description: 'Reset link sent' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  /**
   * Sets a new password using a valid reset token
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 10 * 60_000 })
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset the password using a reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired reset link',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  /**
   * Serves the password reset form page linked from reset emails
   */
  @Public()
  @Get('reset-password')
  @ApiOperation({
    summary: 'Serve the password reset form (HTML page, linked from emails)',
  })
  @ApiResponse({ status: 200, description: 'Reset password form (HTML page)' })
  getResetPasswordPage(@Res() res: Response): void {
    res
      .status(HttpStatus.OK)
      .setHeader('Content-Type', 'text/html')
      .send(resetPasswordPage());
  }

  /**
   * Redirects the user to Google's OAuth consent screen
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 15, windowMs: 60_000 })
  @Get('oauth/google')
  @ApiOperation({ summary: 'Start Google OAuth login (redirect to Google)' })
  @ApiResponse({
    status: 302,
    description: 'Redirect to Google consent screen',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async oauthGoogle(
    @Query('next') next: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    try {
      const { url, state } =
        await this.authService.generateGoogleOAuthUrl(next);
      // ربط رمز state بـ Cookie مشفرة/آمنة للتحقق من هوية العميل ومنع هجمات Login CSRF
      res.cookie('oauth_state', state, {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        path: '/',
        maxAge: 10 * 60 * 1000, // 10 minutes
      });
      res.redirect(url);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'OAuth login failed';
      res.redirect(this.oauthErrorRedirect(message));
    }
  }

  /**
   * Handles the Google OAuth callback and redirects the user back to the
   * frontend with the issued tokens (or an error).
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 15, windowMs: 60_000 })
  @Get(['oauth/google/callback', 'google/callback'])
  @ApiOperation({
    summary:
      'Google OAuth callback - completes login and redirects to frontend',
  })
  @ApiResponse({
    status: 302,
    description: 'Redirect to frontend with tokens or an error',
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  async oauthGoogleCallback(
    @Req() req: Request,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') oauthError: string,
    @Res() res: Response,
  ): Promise<void> {
    // استخراج ومسح الـ Cookie الخاصة بالـ state فوراً لمنع إعادة استخدامها
    const cookieState = req.cookies?.['oauth_state'];
    res.clearCookie('oauth_state', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });

    if (oauthError || !code || !state) {
      res.redirect(
        this.oauthErrorRedirect(
          oauthError ?? 'Google login was cancelled or incomplete',
        ),
      );
      return;
    }

    // 🛡️ حماية Login CSRF: التحقق الصارم من تطابق الـ state بين الـ Cookie والـ Query Parameter
    if (!cookieState || cookieState !== state) {
      res.redirect(
        this.oauthErrorRedirect(
          'فشل التحقق الأمني من الجلسة (OAuth state mismatch). يرجى إعادة المحاولة.',
        ),
      );
      return;
    }

    try {
      const result = await this.authService.handleGoogleOAuthCallback(
        code,
        state,
      );
      const frontendUrl = getFrontendUrl();
      const nextQuery = result.next
        ? `&next=${encodeURIComponent(result.next)}`
        : '';

      if (result.requiresTwoFactor) {
        // 2FA required — deliver loginToken via short-lived HttpOnly cookie to prevent URL history/referrer leakage
        res.cookie('login_token', result.loginToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'lax',
          path: '/',
          maxAge: 5 * 60 * 1000, // 5 minutes
        });
        const params = new URLSearchParams({ requires_two_factor: 'true' });
        res.redirect(
          `${frontendUrl}/oauth/callback?${params.toString()}${nextQuery}`,
        );
      } else {
        // حقن التوكنات مباشرة في ترويسات الاستجابة ككوكيز آمنة (httpOnly, Secure, SameSite=Lax)
        setAuthCookies(res, result.accessToken, result.refreshToken);
        res.redirect(`${frontendUrl}/oauth/callback?success=true${nextQuery}`);
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'OAuth login failed';
      res.redirect(this.oauthErrorRedirect(message));
    }
  }

  private oauthErrorRedirect(message: string): string {
    const sanitized = String(message ?? 'OAuth login failed')
      .replace(/[^\w\s.,!?\-\u0600-\u06FF]/g, '')
      .slice(0, 200);
    const params = new URLSearchParams({ error: sanitized });
    return `${getFrontendUrl()}/oauth/callback?${params.toString()}`;
  }

  /**
   * Signs in a parent using (phone + PIN) or (Magic Token).
   * Sets access_token and refresh_token in httpOnly cookies.
   * Returns encrypted deviceTrustToken (60-day validity) in the response body.
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 5, windowMs: 60_000 })
  @Post('parent/login')
  @ApiOperation({
    summary: 'Sign in a parent using phone + PIN or Magic Token',
    description:
      'Performs constant-time credential checks. Sets httpOnly cookies for session tokens and returns an encrypted deviceTrustToken in the response body for localStorage.',
  })
  @ApiResponse({
    status: 200,
    description: 'Parent authenticated successfully. Session cookies set.',
  })
  @ApiResponse({ status: 400, description: 'Invalid input credentials' })
  @ApiResponse({ status: 401, description: 'Invalid or expired credentials' })
  @ApiResponse({ status: 403, description: 'Account suspended' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async parentLogin(
    @Body() dto: ParentLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.parentAuthService.login(dto);
    setParentAuthCookies(res, result.accessToken, result.refreshToken);
    const { accessToken: _at, refreshToken: _rt, ...safeBody } = result;
    return safeBody;
  }

  /**
   * Re-issues session cookies using a valid encrypted Device Trust Token.
   * Solves Safari/iOS cookie loss by leveraging localStorage backup.
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('parent/device-login')
  @ApiOperation({
    summary: 'Restore parent session cookies using Device Trust Token',
    description:
      'Validates the encrypted 60-day Device Trust Token from localStorage and re-issues httpOnly session cookies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Cookies re-issued successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid, expired, or tampered token',
  })
  @ApiResponse({ status: 403, description: 'Account suspended' })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @HttpCode(HttpStatus.OK)
  async parentDeviceLogin(
    @Body() dto: DeviceLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.parentAuthService.deviceLogin(dto);
    setParentAuthCookies(res, result.accessToken, result.refreshToken);
    const { accessToken: _at, refreshToken: _rt, ...safeBody } = result;
    return safeBody;
  }

  /**
   * Logs out the parent by revoking server session tokens and clearing cookies.
   * Keeps any active student session in the same browser intact.
   */
  @Public()
  @Post('parent/logout')
  @ApiOperation({
    summary: 'Logs out the parent, revokes server tokens, and clears cookies',
  })
  @HttpCode(HttpStatus.OK)
  async parentLogout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('deviceTrustToken') bodyTrustToken?: string,
  ) {
    const accessToken = req.cookies?.['parent_access_token'];
    const refreshToken = req.cookies?.['parent_refresh_token'];
    const deviceTrustToken =
      bodyTrustToken || (req.headers?.['x-device-trust-token'] as string);

    if (accessToken || refreshToken || deviceTrustToken) {
      await this.parentAuthService
        .logout(accessToken, refreshToken, deviceTrustToken)
        .catch(() => undefined);
    }

    clearParentAuthCookies(res);
    return { success: true, message: 'تم تسجيل خروج ولي الأمر بنجاح' };
  }

  /**
   * Refreshes the parent access token using parent_refresh_token cookie.
   */
  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, windowMs: 60_000 })
  @Post('parent/refresh')
  @ApiOperation({
    summary: 'Refreshes parent session token using parent_refresh_token',
  })
  @HttpCode(HttpStatus.OK)
  async parentRefresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.['parent_refresh_token'];
    if (!token) {
      throw new UnauthorizedException('Parent refresh token not provided');
    }

    const result = await this.authService.refresh(token);
    setParentAuthCookies(res, result.accessToken, result.refreshToken);
    return withoutTokens(result);
  }
}
