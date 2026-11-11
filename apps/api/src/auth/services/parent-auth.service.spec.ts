import { ParentAuthService } from './parent-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TokenService } from './token.service';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import {
  encryptDeviceTrustToken,
  hashMagicToken,
} from '../utils/parent-crypto.util';

describe('ParentAuthService', () => {
  let service: ParentAuthService;
  let mockPrisma: any;
  let mockTokenService: any;
  let mockConfig: any;
  let mockRedis: any;
  const testSecret = 'parent-auth-test-secret-key-masar';

  beforeEach(() => {
    mockPrisma = {
      parentStudentLink: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      user: {
        findUnique: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      incrWithExpiry: jest.fn().mockResolvedValue(1),
    };

    mockTokenService = {
      issueTokens: jest.fn().mockResolvedValue({
        accessToken: 'access-jwt-sample',
        refreshToken: 'refresh-jwt-sample',
        user: {
          id: 'parent-1',
          email: 'parent.970591234567@family.masar.local',
        },
      }),
      revokeToken: jest.fn().mockResolvedValue(undefined),
      hashToken: jest.fn().mockImplementation((t: string) => `sha256-${t}`),
    };

    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return testSecret;
        return null;
      }),
    };

    service = new ParentAuthService(
      mockPrisma,
      mockTokenService,
      mockConfig,
      mockRedis,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login with phone and PIN', () => {
    it('successfully logs in with valid phone and PIN', async () => {
      const pin = '123456';
      const pinHash = await bcrypt.hash(pin, 10);
      const parentUser = {
        id: 'parent-user-1',
        name: 'سالم أحمد',
        email: 'parent.970591234567@family.masar.local',
        role: Role.PARENT,
        emailVerified: true,
        suspendedAt: null,
      };

      mockPrisma.parentStudentLink.findMany.mockResolvedValue([
        {
          id: 'link-1',
          parentPhone: '+970591234567',
          pinHash,
          status: 'ACTIVE',
          parent: parentUser,
        },
      ]);

      const result = await service.login({
        phone: '0591234567',
        pin: '123456',
      });

      expect(result.accessToken).toBe('access-jwt-sample');
      expect(result.refreshToken).toBe('refresh-jwt-sample');
      expect(result.deviceTrustToken).toBeDefined();
      expect(result.user.id).toBe('parent-user-1');
      expect(result.user.phone).toBe('+970591234567');
      expect(mockTokenService.issueTokens).toHaveBeenCalledWith(
        parentUser.id,
        parentUser.email,
        true,
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        'parent:pin:failed:+970591234567',
      );
      expect(mockRedis.del).toHaveBeenCalledWith(
        'parent:pin:locked:+970591234567',
      );
    });

    it('SEC-01: prevents a pending link PIN from unlocking an established parent account with active links', async () => {
      const activePin = '111111';
      const activePinHash = await bcrypt.hash(activePin, 10);
      const pendingPin = '222222';
      const pendingPinHash = await bcrypt.hash(pendingPin, 10);

      const parentUser = {
        id: 'parent-user-1',
        name: 'سالم أحمد',
        email: 'parent.970591234567@family.masar.local',
        role: Role.PARENT,
        emailVerified: true,
        suspendedAt: null,
      };

      mockPrisma.parentStudentLink.findMany.mockResolvedValue([
        {
          id: 'link-active-child',
          studentId: 'student-b',
          parentPhone: '+970591234567',
          pinHash: activePinHash,
          status: 'ACTIVE',
          parent: parentUser,
        },
        {
          id: 'link-pending-attacker',
          studentId: 'student-a',
          parentPhone: '+970591234567',
          pinHash: pendingPinHash,
          status: 'PENDING',
          parent: parentUser,
        },
      ]);

      await expect(
        service.login({
          phone: '0591234567',
          pin: pendingPin,
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockTokenService.issueTokens).not.toHaveBeenCalled();
      expect(mockRedis.incrWithExpiry).toHaveBeenCalledWith(
        'parent:pin:failed:+970591234567',
        900,
      );
    });

    it('rejects incorrect PIN with generic UnauthorizedException to prevent enumeration and increments failures', async () => {
      const correctPinHash = await bcrypt.hash('999999', 10);
      mockPrisma.parentStudentLink.findMany.mockResolvedValue([
        {
          id: 'link-1',
          parentPhone: '+970591234567',
          pinHash: correctPinHash,
          status: 'ACTIVE',
          parent: {
            id: 'parent-user-1',
            email: 'parent.970591234567@family.masar.local',
            role: Role.PARENT,
            suspendedAt: null,
          },
        },
      ]);

      await expect(
        service.login({
          phone: '0591234567',
          pin: '000000', // wrong PIN
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockRedis.incrWithExpiry).toHaveBeenCalledWith(
        'parent:pin:failed:+970591234567',
        900,
      );
    });

    it('locks phone number for 15 minutes upon reaching 5 failed PIN attempts', async () => {
      mockPrisma.parentStudentLink.findMany.mockResolvedValue([]);
      mockRedis.incrWithExpiry.mockResolvedValueOnce(5); // reached 5 failures

      await expect(
        service.login({
          phone: '0591234567',
          pin: '123456',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'parent:pin:locked:+970591234567',
        '1',
        900,
      );
    });

    it('rejects with HTTP 429 when phone number is currently locked out', async () => {
      mockRedis.get.mockResolvedValueOnce('1'); // locked out

      await expect(
        service.login({
          phone: '0591234567',
          pin: '123456',
        }),
      ).rejects.toThrow(HttpException);

      expect(mockPrisma.parentStudentLink.findMany).not.toHaveBeenCalled();
    });

    it('rejects unregistered phone number with identical UnauthorizedException', async () => {
      mockPrisma.parentStudentLink.findMany.mockResolvedValue([]);

      await expect(
        service.login({
          phone: '0599999999',
          pin: '123456',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('blocks suspended parent accounts', async () => {
      const pin = '123456';
      const pinHash = await bcrypt.hash(pin, 10);
      mockPrisma.parentStudentLink.findMany.mockResolvedValue([
        {
          id: 'link-1',
          parentPhone: '+970591234567',
          pinHash,
          status: 'ACTIVE',
          parent: {
            id: 'parent-user-1',
            email: 'parent.970591234567@family.masar.local',
            role: Role.PARENT,
            suspendedAt: new Date(),
          },
        },
      ]);

      await expect(
        service.login({
          phone: '0591234567',
          pin: '123456',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('login with Magic Token', () => {
    it('successfully logs in with valid unexpired Magic Token', async () => {
      const rawMagicToken =
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const tokenHash = hashMagicToken(rawMagicToken);
      const parentUser = {
        id: 'parent-user-2',
        name: 'فاطمة محمد',
        email: 'parent.970569876543@family.masar.local',
        role: Role.PARENT,
        emailVerified: true,
        suspendedAt: null,
      };

      mockPrisma.parentStudentLink.findFirst.mockResolvedValue({
        id: 'link-2',
        parentPhone: '+970569876543',
        magicTokenHash: tokenHash,
        magicTokenExpiresAt: new Date(Date.now() + 100000), // unexpired
        status: 'PENDING',
        parent: parentUser,
      });

      const result = await service.login({
        magicToken: rawMagicToken,
      });

      expect(result.accessToken).toBe('access-jwt-sample');
      expect(result.refreshToken).toBe('refresh-jwt-sample');
      expect(result.deviceTrustToken).toBeDefined();
      expect(result.user.id).toBe('parent-user-2');
      expect(mockPrisma.parentStudentLink.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'link-2',
          magicTokenHash: tokenHash,
        },
        data: {
          magicTokenHash: null,
          magicTokenExpiresAt: null,
          status: 'ACTIVE',
        },
      });
    });

    it('rejects if magic token was consumed concurrently (updateMany returns count 0)', async () => {
      const rawMagicToken =
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const tokenHash = hashMagicToken(rawMagicToken);
      const parentUser = {
        id: 'parent-user-2',
        name: 'فاطمة محمد',
        email: 'parent.970569876543@family.masar.local',
        role: Role.PARENT,
        emailVerified: true,
        suspendedAt: null,
      };

      mockPrisma.parentStudentLink.findFirst.mockResolvedValue({
        id: 'link-2',
        parentPhone: '+970569876543',
        magicTokenHash: tokenHash,
        magicTokenExpiresAt: new Date(Date.now() + 100000),
        parent: parentUser,
      });

      mockPrisma.parentStudentLink.updateMany.mockResolvedValueOnce({
        count: 0,
      });

      await expect(
        service.login({
          magicToken: rawMagicToken,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects expired Magic Token', async () => {
      const rawMagicToken = 'expired-token-sample';
      const tokenHash = hashMagicToken(rawMagicToken);

      mockPrisma.parentStudentLink.findFirst.mockResolvedValue({
        id: 'link-2',
        parentPhone: '+970569876543',
        magicTokenHash: tokenHash,
        magicTokenExpiresAt: new Date(Date.now() - 100000), // expired
        parent: {
          id: 'parent-user-2',
          email: 'parent.970569876543@family.masar.local',
          role: Role.PARENT,
          suspendedAt: null,
        },
      });

      await expect(
        service.login({
          magicToken: rawMagicToken,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects unknown Magic Token', async () => {
      mockPrisma.parentStudentLink.findFirst.mockResolvedValue(null);

      await expect(
        service.login({
          magicToken: 'non-existent-token',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects PENDING-link magic token when parent has ACTIVE links and does not call issueTokens (SEC-01)', async () => {
      const rawMagicToken =
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
      const tokenHash = hashMagicToken(rawMagicToken);
      const parentUser = {
        id: 'parent-established-1',
        name: 'أبو أحمد',
        email: 'parent.970591111111@family.masar.local',
        role: Role.PARENT,
        emailVerified: true,
        suspendedAt: null,
      };

      mockPrisma.parentStudentLink.findFirst.mockResolvedValue({
        id: 'link-pending-1',
        parentId: 'parent-established-1',
        parentPhone: '+970591111111',
        magicTokenHash: tokenHash,
        magicTokenExpiresAt: new Date(Date.now() + 100000),
        status: 'PENDING',
        parent: parentUser,
      });

      mockPrisma.parentStudentLink.count.mockResolvedValueOnce(1); // Parent has 1 ACTIVE link

      await expect(
        service.login({
          magicToken: rawMagicToken,
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockTokenService.issueTokens).not.toHaveBeenCalled();
      expect(mockPrisma.parentStudentLink.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('deviceLogin (Safari cookie re-issuance flow)', () => {
    it('validates deviceTrustToken and re-issues cookies with rolling token', async () => {
      const parentUser = {
        id: 'parent-user-trust',
        name: 'عبدالله',
        email: 'parent.970591234567@family.masar.local',
        role: Role.PARENT,
        emailVerified: true,
        suspendedAt: null,
      };

      const validToken = encryptDeviceTrustToken(
        {
          sub: parentUser.id,
          phone: '+970591234567',
          role: Role.PARENT,
          iat: Date.now(),
          exp: Date.now() + 60 * 24 * 60 * 60 * 1000,
          jti: 'test-jti',
        },
        testSecret,
      );

      mockRedis.get.mockResolvedValue('1');
      mockPrisma.user.findUnique.mockResolvedValue(parentUser);

      const result = await service.deviceLogin({
        deviceTrustToken: validToken,
      });

      expect(result.accessToken).toBe('access-jwt-sample');
      expect(result.refreshToken).toBe('refresh-jwt-sample');
      expect(result.deviceTrustToken).toBeDefined();
      expect(result.user.id).toBe(parentUser.id);
      expect(mockRedis.del).toHaveBeenCalledWith(
        'parent:device_trust:parent-user-trust:test-jti',
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('parent:device_trust:parent-user-trust:'),
        '1',
        expect.any(Number),
      );
      expect(mockTokenService.issueTokens).toHaveBeenCalledWith(
        parentUser.id,
        parentUser.email,
        true,
      );
    });

    it('SEC-02: rejects deviceLogin if device trust token has been revoked in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      const revokedToken = encryptDeviceTrustToken(
        {
          sub: 'parent-user-revoked',
          phone: '+970591234567',
          role: Role.PARENT,
          iat: Date.now(),
          exp: Date.now() + 60 * 24 * 60 * 60 * 1000,
          jti: 'revoked-jti',
        },
        testSecret,
      );

      await expect(
        service.deviceLogin({
          deviceTrustToken: revokedToken,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects invalid or tampered deviceTrustToken', async () => {
      await expect(
        service.deviceLogin({
          deviceTrustToken: 'invalid.token.payload',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validation on missing arguments', () => {
    it('throws BadRequestException if neither phone+pin nor magicToken are provided', async () => {
      await expect(service.login({})).rejects.toThrow(BadRequestException);
    });
  });

  describe('logout', () => {
    it('revokes access token in denylist and sets revokedAt on refreshToken row in database', async () => {
      const accessToken = 'sample-access-token';
      const refreshToken = 'sample-refresh-token';

      await service.logout(accessToken, refreshToken);

      expect(mockTokenService.revokeToken).toHaveBeenCalledWith(accessToken);
      expect(mockTokenService.hashToken).toHaveBeenCalledWith(refreshToken);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'sha256-sample-refresh-token', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockTokenService.revokeToken).toHaveBeenCalledWith(refreshToken);
    });

    it('handles logout with only refreshToken and updates database row', async () => {
      mockTokenService.revokeToken.mockClear();
      mockPrisma.refreshToken.updateMany.mockClear();

      const refreshToken = 'only-refresh-token';

      await service.logout(undefined, refreshToken);

      expect(mockTokenService.revokeToken).not.toHaveBeenCalledWith(undefined);
      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { tokenHash: 'sha256-only-refresh-token', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockTokenService.revokeToken).toHaveBeenCalledWith(refreshToken);
    });

    it('SEC-02: revokes deviceTrustToken in Redis during logout', async () => {
      mockRedis.del.mockClear();
      const deviceToken = encryptDeviceTrustToken(
        {
          sub: 'parent-user-logout',
          phone: '+970591234567',
          role: Role.PARENT,
          iat: Date.now(),
          exp: Date.now() + 60 * 24 * 60 * 60 * 1000,
          jti: 'logout-jti-123',
        },
        testSecret,
      );

      await service.logout(undefined, undefined, deviceToken);

      expect(mockRedis.del).toHaveBeenCalledWith(
        'parent:device_trust:parent-user-logout:logout-jti-123',
      );
    });

    it('does not throw if token revocation or database update fails', async () => {
      mockPrisma.refreshToken.updateMany.mockRejectedValueOnce(
        new Error('DB failure'),
      );

      await expect(
        service.logout('sample-access-token', 'sample-refresh-token'),
      ).resolves.not.toThrow();
    });
  });
});
