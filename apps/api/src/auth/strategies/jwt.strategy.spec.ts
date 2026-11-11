import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { User } from '@prisma/client';
import { Role } from '@prisma/client';
import {
  ACCOUNT_SUSPENDED_MESSAGE,
  JwtStrategy,
  extractJwtFromRequest,
} from './jwt.strategy';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { TokenRevocationService } from '../services/token-revocation.service';

const mockPrismaService = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
};

const mockConfigService = {
  get: jest.fn(),
};

const mockTokenRevocation = {
  revoke: jest.fn(),
  isRevoked: jest.fn().mockResolvedValue(false),
  issuedBeforeCutoff: jest.fn().mockResolvedValue(false),
};

const mockRedisService = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue('OK'),
};

const mockUser: User & {
  staffRole: { id: string; name: string; permissions: string[] } | null;
} = {
  id: 'user-1',
  email: 'john@example.com',
  name: 'John Doe',
  passwordHash: 'hashed-password',
  role: Role.STUDENT,
  avatar: null,
  branchId: null,
  twoFactorEnabled: false,
  twoFactorSecret: null,
  twoFactorRecoveryCodes: [],
  emailVerified: true,
  oauthProvider: null,
  oauthProviderId: null,
  staffRoleId: null,
  suspendedAt: null,
  suspendedReason: null,
  lastActiveAt: null,
  dailyQuota: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  staffRole: null,
};

const {
  passwordHash: _,
  twoFactorSecret: __,
  twoFactorRecoveryCodes: ___,
  staffRole: ____,
  ...rest
} = mockUser;
const expectedSafeUser = { ...rest, staffRole: null, permissions: [] };

const payload = (overrides: Record<string, unknown> = {}) => ({
  sub: 'user-1',
  email: 'john@example.com',
  jti: 'jti-1',
  type: 'access',
  ...overrides,
});

const requestWithToken = (token = 'some-access-token') =>
  ({
    headers: { authorization: `Bearer ${token}` },
    cookies: {},
  }) as unknown as Request;

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfigService.get.mockReturnValue('test-secret');
    mockTokenRevocation.isRevoked.mockResolvedValue(false);
    mockTokenRevocation.issuedBeforeCutoff.mockResolvedValue(false);
    mockRedisService.get.mockResolvedValue(null);
    strategy = new JwtStrategy(
      mockConfigService as unknown as ConfigService,
      mockPrismaService as unknown as PrismaService,
      mockTokenRevocation as unknown as TokenRevocationService,
      mockRedisService as unknown as RedisService,
    );
  });

  it('should be defined', () => {
    expect(strategy).toBeDefined();
  });

  it('should return the safe user for a valid access token', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

    await expect(
      strategy.validate(requestWithToken(), payload()),
    ).resolves.toEqual(expectedSafeUser);
    expect(mockTokenRevocation.isRevoked).toHaveBeenCalledWith(
      'some-access-token',
    );
  });

  it('should skip the revocation check when no token is present', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

    await expect(
      strategy.validate(
        { headers: {}, cookies: {} } as unknown as Request,
        payload(),
      ),
    ).resolves.toEqual(expectedSafeUser);
    expect(mockTokenRevocation.isRevoked).not.toHaveBeenCalled();
  });

  it('should reject a revoked (logged-out) token', async () => {
    mockTokenRevocation.isRevoked.mockResolvedValue(true);

    await expect(
      strategy.validate(requestWithToken(), payload()),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      strategy.validate(requestWithToken(), payload()),
    ).rejects.toThrow('Session has been terminated. Please log in again.');
  });

  it('should reject non-access token types (e.g. two-factor login)', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

    await expect(
      strategy.validate(
        requestWithToken(),
        payload({ type: 'two-factor-login' }),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockPrismaService.user.findUnique).not.toHaveBeenCalled();
  });

  it('should reject a payload whose user no longer exists', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(
      strategy.validate(requestWithToken(), payload()),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject tokens issued before "end all sessions"', async () => {
    mockTokenRevocation.issuedBeforeCutoff.mockResolvedValue(true);
    await expect(
      strategy.validate(requestWithToken(), payload({ iat: 1 })),
    ).rejects.toThrow('Session has been terminated');
    expect(mockTokenRevocation.issuedBeforeCutoff).toHaveBeenCalledWith(
      'user-1',
      1,
    );
  });

  it('should reject a suspended account, fresh or cached', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      ...mockUser,
      suspendedAt: new Date(),
    });
    await expect(
      strategy.validate(requestWithToken(), payload()),
    ).rejects.toThrow(ACCOUNT_SUSPENDED_MESSAGE);

    mockRedisService.get.mockResolvedValue(
      JSON.stringify({ ...expectedSafeUser, suspendedAt: new Date() }),
    );
    await expect(
      strategy.validate(requestWithToken(), payload()),
    ).rejects.toThrow(ACCOUNT_SUSPENDED_MESSAGE);
  });

  it("should attach the staff role's permissions to admins", async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      ...mockUser,
      role: Role.ADMIN,
      staffRoleId: 'reviewer',
      staffRole: {
        id: 'reviewer',
        name: 'مراجع',
        permissions: ['content.review', 'no.longer.exists'],
      },
    });
    const user = await strategy.validate(requestWithToken(), payload());
    expect(user.permissions).toEqual(['content.review']);
    expect(user.staffRole).toEqual({ id: 'reviewer', name: 'مراجع' });
  });

  it('should give super admins every permission', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      ...mockUser,
      role: Role.ADMIN,
      staffRole: { id: 'super_admin', name: 'مدير عام', permissions: [] },
    });
    const user = await strategy.validate(requestWithToken(), payload());
    expect(user.permissions).toContain('roles.manage');
    expect(user.permissions).toContain('billing.manage');
  });

  it('should not grant permissions to a student even with a stray role', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      ...mockUser,
      staffRole: { id: 'super_admin', name: 'مدير عام', permissions: [] },
    });
    const user = await strategy.validate(requestWithToken(), payload());
    expect(user.permissions).toEqual([]);
  });

  it('should record activity at most every few minutes', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue({
      ...mockUser,
      lastActiveAt: new Date(),
    });
    await strategy.validate(requestWithToken(), payload());
    expect(mockPrismaService.user.update).not.toHaveBeenCalled();

    mockPrismaService.user.findUnique.mockResolvedValue({
      ...mockUser,
      lastActiveAt: new Date(Date.now() - 60 * 60_000),
    });
    await strategy.validate(requestWithToken(), payload());
    expect(mockPrismaService.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } }),
    );
  });

  describe('extractJwtFromRequest', () => {
    it('should extract token from Authorization Bearer header', () => {
      const req = {
        headers: { authorization: 'Bearer header-jwt-token' },
      } as unknown as Request;
      expect(extractJwtFromRequest(req)).toBe('header-jwt-token');
    });

    it('should extract parent_access_token cookie when in parent context', () => {
      const req = {
        headers: { 'x-session-context': 'parent' },
        cookies: { parent_access_token: 'parent-cookie-token' },
      } as unknown as Request;
      expect(extractJwtFromRequest(req)).toBe('parent-cookie-token');
    });

    it('should extract access_token cookie for standard requests and SSE', () => {
      const req = {
        headers: {},
        cookies: { access_token: 'cookie-jwt-token' },
      } as unknown as Request;
      expect(extractJwtFromRequest(req)).toBe('cookie-jwt-token');
    });

    it('should fall back to parent_access_token if access_token is absent', () => {
      const req = {
        headers: {},
        cookies: { parent_access_token: 'parent-fallback-token' },
      } as unknown as Request;
      expect(extractJwtFromRequest(req)).toBe('parent-fallback-token');
    });

    it('should strictly reject session tokens in URL query parameters (RFC 6750 security)', () => {
      const reqWithQueryToken = {
        headers: {},
        cookies: {},
        query: { token: 'insecure-query-token' },
      } as unknown as Request;
      expect(extractJwtFromRequest(reqWithQueryToken)).toBeNull();

      const reqWithQueryAccessToken = {
        headers: {},
        cookies: {},
        query: { access_token: 'insecure-query-access-token' },
      } as unknown as Request;
      expect(extractJwtFromRequest(reqWithQueryAccessToken)).toBeNull();
    });
  });
});
