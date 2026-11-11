import { HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './services/auth.service';
import { ParentAuthService } from './services/parent-auth.service';

const mockParentAuthService = {
  login: jest.fn(),
  deviceLogin: jest.fn(),
  logout: jest.fn(),
};

const mockAuthService = {
  register: jest.fn(),
  verifyEmail: jest.fn(),
  resendVerification: jest.fn(),
  login: jest.fn(),
  verifyTwoFactor: jest.fn(),
  verifyRecoveryCode: jest.fn(),
  refresh: jest.fn(),
  logout: jest.fn(),
  getProfile: jest.fn(),
  setupTwoFactor: jest.fn(),
  enableTwoFactor: jest.fn(),
  disableTwoFactor: jest.fn(),
  forgotPassword: jest.fn(),
  resetPassword: jest.fn(),
  getGoogleOAuthUrl: jest.fn(),
  generateGoogleOAuthUrl: jest.fn(),
  handleGoogleOAuthCallback: jest.fn(),
};

const requestWithToken = (token = 'access-token') =>
  ({
    headers: { authorization: `Bearer ${token}` },
  }) as unknown as Request;

const mockUser = {
  id: 'user-1',
  email: 'ahmed@example.com',
  name: 'Ahmed Ali',
  emailVerified: true,
  twoFactorEnabled: false,
  createdAt: new Date(),
};

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

const mockReq = (cookies: Record<string, string> = {}) =>
  ({
    cookies,
    headers: {},
  }) as unknown as Request;

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(
      mockAuthService as unknown as AuthService,
      mockParentAuthService as unknown as ParentAuthService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should delegate to AuthService.register', async () => {
      const dto = {
        name: 'Ahmed Ali',
        email: 'ahmed@example.com',
        password: 'StrongPass123',
      };
      const result = {
        message:
          'Account created successfully. Please verify your email before logging in.',
      };
      mockAuthService.register.mockResolvedValue(result);

      await expect(controller.register(dto)).resolves.toEqual(result);
      expect(mockAuthService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('verifyEmail', () => {
    it('should delegate to AuthService.verifyEmail', async () => {
      const dto = { email: 'ahmed@example.com', code: '483920' };
      const result = { message: 'Your email has been verified successfully' };
      mockAuthService.verifyEmail.mockResolvedValue(result);

      await expect(controller.verifyEmail(dto, mockRes())).resolves.toEqual(
        result,
      );
      expect(mockAuthService.verifyEmail).toHaveBeenCalledWith(
        dto.email,
        dto.code,
      );
    });

    it('propagates errors from AuthService.verifyEmail', async () => {
      const dto = { email: 'ahmed@example.com', code: '000000' };
      mockAuthService.verifyEmail.mockRejectedValue(
        new Error(
          'This verification link has expired. Please request a new one.',
        ),
      );

      await expect(controller.verifyEmail(dto, mockRes())).rejects.toThrow(
        'This verification link has expired',
      );
    });
  });

  describe('resendVerification', () => {
    it('should delegate to AuthService.resendVerification', async () => {
      const dto = { email: 'ahmed@example.com' };
      const result = { message: 'Verification link sent to your email' };
      mockAuthService.resendVerification.mockResolvedValue(result);

      await expect(controller.resendVerification(dto)).resolves.toEqual(result);
      expect(mockAuthService.resendVerification).toHaveBeenCalledWith(
        dto.email,
      );
    });
  });

  describe('login', () => {
    it('should delegate to AuthService.login and set cookies', async () => {
      const dto = {
        email: 'ahmed@example.com',
        password: 'StrongPass123',
      };
      const result = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };
      const res = mockRes();
      mockAuthService.login.mockResolvedValue(result);

      // tokens travel as httpOnly cookies only — never in the body
      await expect(controller.login(dto, res)).resolves.toEqual({});
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'access-token',
        expect.any(Object),
      );
    });

    it('never leaks tokens into the response body', async () => {
      const dto = { email: 'ahmed@example.com', password: 'StrongPass123' };
      const res = mockRes();
      mockAuthService.login.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'u1', email: 'ahmed@example.com' },
      });

      const body = await controller.login(dto, res);

      // httpOnly cookies are pointless if the same tokens are handed to JS
      expect(body).not.toHaveProperty('accessToken');
      expect(body).not.toHaveProperty('refreshToken');
      expect(body).not.toHaveProperty('loginToken');
      // non-sensitive fields still come through
      expect(body).toEqual({ user: { id: 'u1', email: 'ahmed@example.com' } });
    });
  });

  describe('verifyTwoFactor', () => {
    it('should delegate to AuthService.verifyTwoFactor and set cookies', async () => {
      const dto = { loginToken: 'login-token', code: '123456' };
      const result = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };
      const req = mockReq();
      const res = mockRes();
      mockAuthService.verifyTwoFactor.mockResolvedValue(result);

      await expect(controller.verifyTwoFactor(req, dto, res)).resolves.toEqual(
        {},
      );
      expect(mockAuthService.verifyTwoFactor).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'access-token',
        expect.any(Object),
      );
    });
  });

  describe('verifyRecoveryCode', () => {
    it('should delegate to AuthService.verifyRecoveryCode and set cookies', async () => {
      const dto = { loginToken: 'login-token', recoveryCode: 'a1b2c-d3e4f' };
      const result = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      };
      const req = mockReq();
      const res = mockRes();
      mockAuthService.verifyRecoveryCode.mockResolvedValue(result);

      await expect(
        controller.verifyRecoveryCode(req, dto, res),
      ).resolves.toEqual({});
      expect(mockAuthService.verifyRecoveryCode).toHaveBeenCalledWith(dto);
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'access-token',
        expect.any(Object),
      );
    });
  });

  describe('refresh', () => {
    it('should delegate to AuthService.refresh and rotate cookies', async () => {
      const dto = { refreshToken: 'refresh-token' };
      const result = {
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
      };
      const req = mockReq();
      const res = mockRes();
      mockAuthService.refresh.mockResolvedValue(result);

      await expect(controller.refresh(req, res, dto)).resolves.toEqual({});
      expect(mockAuthService.refresh).toHaveBeenCalledWith('refresh-token');
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'new-access-token',
        expect.any(Object),
      );
    });
  });

  describe('logout', () => {
    it('clears auth cookies and delegates to AuthService.logout', async () => {
      const result = { message: 'Logged out successfully' };
      const res = mockRes();
      mockAuthService.logout.mockResolvedValue(result);

      await expect(controller.logout('access-token', res)).resolves.toEqual(
        result,
      );
      expect(mockAuthService.logout).toHaveBeenCalledWith('access-token');
      expect(res.clearCookie).toHaveBeenCalledWith(
        'access_token',
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'refresh_token',
        expect.any(Object),
      );
    });
  });

  describe('parentLogout', () => {
    it('revokes server session using both parent_access_token and parent_refresh_token and clears parent cookies', async () => {
      const res = mockRes();
      const req = mockReq({
        parent_access_token: 'parent-access-jwt',
        parent_refresh_token: 'parent-refresh-jwt',
      });
      mockParentAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.parentLogout(req, res);

      expect(mockParentAuthService.logout).toHaveBeenCalledWith(
        'parent-access-jwt',
        'parent-refresh-jwt',
        undefined,
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'parent_access_token',
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'parent_refresh_token',
        expect.any(Object),
      );
      expect(result).toEqual({
        success: true,
        message: 'تم تسجيل خروج ولي الأمر بنجاح',
      });
    });

    it('revokes refresh token when only parent_refresh_token is present', async () => {
      const res = mockRes();
      const req = mockReq({ parent_refresh_token: 'parent-refresh-jwt' });
      mockParentAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.parentLogout(req, res);

      expect(mockParentAuthService.logout).toHaveBeenCalledWith(
        undefined,
        'parent-refresh-jwt',
        undefined,
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'parent_access_token',
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'parent_refresh_token',
        expect.any(Object),
      );
      expect(result).toEqual({
        success: true,
        message: 'تم تسجيل خروج ولي الأمر بنجاح',
      });
    });

    it('clears parent cookies and succeeds even if parentAuthService.logout rejects', async () => {
      const res = mockRes();
      const req = mockReq({ parent_access_token: 'failing-jwt' });
      mockParentAuthService.logout.mockRejectedValue(
        new Error('Redis or DB unavailable'),
      );

      const result = await controller.parentLogout(req, res);

      expect(mockParentAuthService.logout).toHaveBeenCalledWith(
        'failing-jwt',
        undefined,
        undefined,
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'parent_access_token',
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'parent_refresh_token',
        expect.any(Object),
      );
      expect(result).toEqual({
        success: true,
        message: 'تم تسجيل خروج ولي الأمر بنجاح',
      });
    });

    it('passes deviceTrustToken from body to parentAuthService.logout and revokes it', async () => {
      const res = mockRes();
      const req = mockReq({ parent_access_token: 'parent-access-jwt' });
      mockParentAuthService.logout.mockResolvedValue(undefined);

      const result = await controller.parentLogout(
        req,
        res,
        'trusted-device-token-123',
      );

      expect(mockParentAuthService.logout).toHaveBeenCalledWith(
        'parent-access-jwt',
        undefined,
        'trusted-device-token-123',
      );
      expect(result).toEqual({
        success: true,
        message: 'تم تسجيل خروج ولي الأمر بنجاح',
      });
    });

    it('clears cookies gracefully without calling logout if no cookies are present', async () => {
      const res = mockRes();
      const req = mockReq({});

      const result = await controller.parentLogout(req, res);

      expect(mockParentAuthService.logout).not.toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith(
        'parent_access_token',
        expect.any(Object),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(
        'parent_refresh_token',
        expect.any(Object),
      );
      expect(result).toEqual({
        success: true,
        message: 'تم تسجيل خروج ولي الأمر بنجاح',
      });
    });
  });

  describe('profile', () => {
    it('should delegate to AuthService.getProfile with the user id', async () => {
      mockAuthService.getProfile.mockResolvedValue(mockUser);

      await expect(controller.profile(mockUser as any)).resolves.toEqual(
        mockUser,
      );
      expect(mockAuthService.getProfile).toHaveBeenCalledWith('user-1');
    });
  });

  describe('setupTwoFactor', () => {
    it('should delegate to AuthService.setupTwoFactor', async () => {
      const result = {
        secret: 'secret',
        otpauthUrl: 'otpauth://totp/AI%20Exam:ahmed@example.com?...',
      };
      mockAuthService.setupTwoFactor.mockResolvedValue(result);

      await expect(controller.setupTwoFactor(mockUser as any)).resolves.toEqual(
        result,
      );
      expect(mockAuthService.setupTwoFactor).toHaveBeenCalledWith('user-1');
    });
  });

  describe('enableTwoFactor', () => {
    it('should delegate to AuthService.enableTwoFactor', async () => {
      const dto = { code: '123456' };
      const result = {
        message: 'Two-factor authentication enabled successfully',
        recoveryCodes: ['a1b2c-d3e4f'],
      };
      mockAuthService.enableTwoFactor.mockResolvedValue(result);

      await expect(
        controller.enableTwoFactor(mockUser as any, dto, mockRes()),
      ).resolves.toEqual(result);
      expect(mockAuthService.enableTwoFactor).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
    });
  });

  describe('disableTwoFactor', () => {
    it('should delegate to AuthService.disableTwoFactor', async () => {
      const dto = { code: '123456', password: 'StrongPass123' };
      const result = {
        message: 'Two-factor authentication disabled successfully',
      };
      mockAuthService.disableTwoFactor.mockResolvedValue(result);

      await expect(
        controller.disableTwoFactor(mockUser as any, dto, mockRes()),
      ).resolves.toEqual(result);
      expect(mockAuthService.disableTwoFactor).toHaveBeenCalledWith(
        'user-1',
        dto,
      );
    });
  });

  describe('forgotPassword', () => {
    it('should delegate to AuthService.forgotPassword', async () => {
      const dto = { email: 'ahmed@example.com' };
      const result = { message: 'Password reset link sent to your email' };
      mockAuthService.forgotPassword.mockResolvedValue(result);

      await expect(controller.forgotPassword(dto)).resolves.toEqual(result);
      expect(mockAuthService.forgotPassword).toHaveBeenCalledWith(dto);
    });
  });

  describe('resetPassword', () => {
    it('should delegate to AuthService.resetPassword', async () => {
      const dto = {
        token: 'reset-token',
        newPassword: 'NewStrongPass456',
      };
      const result = { message: 'Password has been reset successfully' };
      mockAuthService.resetPassword.mockResolvedValue(result);

      await expect(controller.resetPassword(dto)).resolves.toEqual(result);
      expect(mockAuthService.resetPassword).toHaveBeenCalledWith(dto);
    });
  });

  describe('getResetPasswordPage', () => {
    it('serves the reset password HTML page', () => {
      const res = mockRes();

      controller.getResetPasswordPage(res);

      expect(res.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
      expect(res.send).toHaveBeenCalledWith(
        expect.stringContaining('Reset your password'),
      );
    });
  });

  describe('oauthGoogle', () => {
    it('generates the Google consent URL, sets oauth_state cookie, and redirects', async () => {
      const res = mockRes();
      mockAuthService.generateGoogleOAuthUrl.mockResolvedValue({
        url: 'https://accounts.google.com/o/oauth2/v2/auth?...',
        state: 'random-state-123',
      });

      await controller.oauthGoogle('/custom-next', res);

      expect(mockAuthService.generateGoogleOAuthUrl).toHaveBeenCalledWith(
        '/custom-next',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'oauth_state',
        'random-state-123',
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
        }),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        'https://accounts.google.com/o/oauth2/v2/auth?...',
      );
    });

    it('redirects to the frontend with an error when Google OAuth URL generation fails', async () => {
      const res = mockRes();
      mockAuthService.generateGoogleOAuthUrl.mockRejectedValue(
        new Error('Google OAuth is not configured'),
      );

      await controller.oauthGoogle(undefined, res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(
          '/oauth/callback?error=Google+OAuth+is+not+configured',
        ),
      );
    });
  });

  describe('oauthGoogleCallback', () => {
    it('sets cookies, clears oauth_state, and redirects cleanly on success', async () => {
      const res = mockRes();
      const req = mockReq({ oauth_state: 'state-1' });
      mockAuthService.handleGoogleOAuthCallback.mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { id: 'user-1' },
        next: '/dashboard',
      });

      await controller.oauthGoogleCallback(req, 'code-1', 'state-1', '', res);

      expect(res.clearCookie).toHaveBeenCalledWith(
        'oauth_state',
        expect.any(Object),
      );
      expect(mockAuthService.handleGoogleOAuthCallback).toHaveBeenCalledWith(
        'code-1',
        'state-1',
      );
      expect(res.cookie).toHaveBeenCalledWith(
        'access_token',
        'access-token',
        expect.any(Object),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining(
          '/oauth/callback?success=true&next=%2Fdashboard',
        ),
      );
    });

    it('rejects when state cookie does not match incoming state (CSRF Protection)', async () => {
      const res = mockRes();
      const req = mockReq({ oauth_state: 'legitimate-state' });

      await controller.oauthGoogleCallback(
        req,
        'code-1',
        'forged-state',
        '',
        res,
      );

      expect(res.clearCookie).toHaveBeenCalledWith(
        'oauth_state',
        expect.any(Object),
      );
      expect(mockAuthService.handleGoogleOAuthCallback).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('OAuth+state+mismatch'),
      );
    });

    it('redirects with requires_two_factor=true when 2FA is required and sets cookie', async () => {
      const res = mockRes();
      const req = mockReq({ oauth_state: 'state-1' });
      mockAuthService.handleGoogleOAuthCallback.mockResolvedValue({
        requiresTwoFactor: true,
        loginToken: 'login-token',
      });

      await controller.oauthGoogleCallback(req, 'code-1', 'state-1', '', res);

      expect(res.cookie).toHaveBeenCalledWith(
        'login_token',
        'login-token',
        expect.any(Object),
      );
      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('requires_two_factor=true'),
      );
    });

    it('redirects to the frontend with an error when Google rejects the code', async () => {
      const res = mockRes();
      const req = mockReq({ oauth_state: 'state-1' });

      await controller.oauthGoogleCallback(req, '', 'state-1', '', res);

      expect(res.redirect).toHaveBeenCalledWith(
        expect.stringContaining('error='),
      );
    });

    it('preserves Arabic characters when sanitizing OAuth error messages', async () => {
      const res = mockRes();
      const req = mockReq({ oauth_state: 'state-1' });
      mockAuthService.handleGoogleOAuthCallback.mockRejectedValue(
        new Error('تم إيقاف هذا الحساب. تواصل مع إدارة المنصة.'),
      );

      await controller.oauthGoogleCallback(req, 'code-1', 'state-1', '', res);

      const redirectUrl = (res.redirect as unknown as jest.Mock).mock
        .calls[0][0] as string;
      const url = new URL(redirectUrl);
      const errorParam = url.searchParams.get('error');

      expect(errorParam).toContain('تم إيقاف هذا الحساب');
      expect(errorParam).toBe('تم إيقاف هذا الحساب. تواصل مع إدارة المنصة.');
    });
  });
});
