import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import {
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { TwoFactorService } from './services/two-factor.service';
import { OAuthService } from './services/oauth.service';
import { PasswordService } from './services/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenRevocationService } from './services/token-revocation.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { generateTotpCode, generateTotpSecret } from './utils/totp.util';

/** Minimal in-memory Redis stand-in used for unit tests */
class FakeRedis {
  private store = new Map<string, { value: string; expiresAt: number }>();
  private counters = new Map<string, { count: number; expiresAt: number }>();

  async set(
    key: string,
    value: string,
    _mode?: 'EX',
    ttlSeconds?: number,
  ): Promise<string> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : 0,
    });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  async incrWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const now = Date.now();
    const entry = this.counters.get(key);
    if (!entry || (entry.expiresAt !== 0 && now > entry.expiresAt)) {
      this.counters.set(key, { count: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    entry.count++;
    return entry.count;
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    $transaction: jest.Mock;
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let tokenRevocation: { revoke: jest.Mock; isRevoked: jest.Mock };
  let mailService: {
    sendPasswordResetEmail: jest.Mock;
    sendVerificationEmail: jest.Mock;
    sendLoginCodeEmail: jest.Mock;
    sendSecurityNotice: jest.Mock;
  };
  let configService: { get: jest.Mock };
  let fakeRedis: FakeRedis;
  let redisService: any;

  const validDto = {
    name: 'Ahmed Ali',
    email: 'ahmed@example.com',
    password: 'StrongPass123',
  };

  let hashedPassword: string;

  const makeUser = (overrides: any = {}) => ({
    id: 'user-1',
    name: validDto.name,
    email: validDto.email,
    passwordHash: hashedPassword,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorRecoveryCodes: [],
    emailVerified: false,
    oauthProvider: null,
    oauthProviderId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeAll(async () => {
    hashedPassword = await bcrypt.hash(validDto.password, 10);
  });

  afterAll(() => {
    if ((global as any).fetch && (global as any).fetch.mockRestore) {
      (global as any).fetch.mockRestore();
    }
  });

  /** Mocks the two Google API calls used by OAuth (token exchange + userinfo) */
  const mockGoogleApis = (profile: any = {}) => {
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: jest
          .fn()
          .mockResolvedValue({ access_token: 'google-access-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'google-id-1',
          email: validDto.email,
          name: validDto.name,
          verified_email: true,
          ...profile,
        }),
      });
  };

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(async (callback: any) => {
        if (typeof callback === 'function') {
          return callback(prisma);
        }
        return callback;
      }),
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    tokenRevocation = {
      revoke: jest.fn(),
      isRevoked: jest.fn().mockResolvedValue(false),
    };
    mailService = {
      sendPasswordResetEmail: jest.fn(),
      sendVerificationEmail: jest.fn(),
      sendLoginCodeEmail: jest.fn(),
      sendSecurityNotice: jest.fn(),
    };
    fakeRedis = new FakeRedis();
    redisService = {
      set: jest.fn((key: string, value: string, ttlSeconds?: number) =>
        fakeRedis.set(key, value, 'EX', ttlSeconds),
      ),
      get: jest.fn((key: string) => fakeRedis.get(key)),
      del: jest.fn((key: string) => fakeRedis.del(key)),
      incrWithExpiry: jest.fn((key: string, ttlSeconds: number) =>
        fakeRedis.incrWithExpiry(key, ttlSeconds),
      ),
      invalidateUserCache: jest.fn().mockResolvedValue(undefined),
      getClient: jest.fn(() => fakeRedis),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'FRONTEND_URL') return 'http://localhost:3000';
        if (key === 'BACKEND_URL') return 'http://localhost:8087';
        if (key === 'GOOGLE_CLIENT_ID') return 'google-client-id';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'google-client-secret';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [JwtModule.register({ secret: 'test-secret' })],
      providers: [
        AuthService,
        TokenService,
        TwoFactorService,
        OAuthService,
        PasswordService,
        { provide: PrismaService, useValue: prisma },
        { provide: TokenRevocationService, useValue: tokenRevocation },
        { provide: RedisService, useValue: redisService },
        { provide: MailService, useValue: mailService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('creates an account without issuing tokens until the email is verified', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const created = makeUser({ createdAt: new Date() });
      prisma.user.create.mockResolvedValue(created);

      const result: any = await service.register(validDto);

      expect(result.message).toContain('verification');
      expect(result.accessToken).toBeUndefined();
      expect(result.refreshToken).toBeUndefined();
      expect(result.user).toBeUndefined();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('emails a verification code after creating the account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({
        id: 'user-1',
        ...data,
        emailVerified: false,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await service.register(validDto);

      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        validDto.email,
        expect.any(String),
      );
      const code = mailService.sendVerificationEmail.mock.calls[0][1];
      expect(code).toMatch(/^\d{6}$/);
      expect(await fakeRedis.get('email-verification:user-1')).toBe(code);
    });

    it('stores the password hashed (never plaintext)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({
        id: 'user-1',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await service.register(validDto);

      const stored = prisma.user.create.mock.calls[0][0].data;
      expect(stored.passwordHash).toBeDefined();
      expect(stored.passwordHash).not.toBe(validDto.password);
      expect(await bcrypt.compare(validDto.password, stored.passwordHash)).toBe(
        true,
      );
    });

    it('rejects registration when the email is already registered', async () => {
      const p2002Error = new Prisma.PrismaClientKnownRequestError(
        'Duplicate email',
        {
          code: 'P2002',
          clientVersion: '1.0.0',
        },
      );
      prisma.user.create.mockRejectedValue(p2002Error);

      await expect(service.register(validDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('login', () => {
    it('issues a valid access JWT for correct credentials', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      const result: any = await service.login(validDto);

      expect(result.accessToken).toBeDefined();
      expect(result).not.toHaveProperty('requiresTwoFactor');

      const decoded: any = service['jwtService'].decode(result.accessToken);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.email).toBe(validDto.email);
      expect(decoded.type).toBe('access');
    });

    it('rejects login until the email is verified', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(service.login(validDto)).rejects.toThrow(ForbiddenException);
    });

    it('rejects an unknown email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(validDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      await expect(
        service.login({ ...validDto, password: 'WrongPass123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an OAuth-only account without a password', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ passwordHash: null, emailVerified: true }),
      );

      await expect(service.login(validDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('requests a verification code instead of issuing a JWT when 2FA is enabled', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          twoFactorSecret: secret,
          emailVerified: true,
        }),
      );

      const result: any = await service.login(validDto);

      expect(result.requiresTwoFactor).toBe(true);
      expect(result.loginToken).toBeDefined();
      expect(result.accessToken).toBeUndefined();

      const decoded: any = service['jwtService'].decode(result.loginToken);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.type).toBe('two-factor-login');
    });
  });

  describe('verifyTwoFactor', () => {
    it('issues an access JWT when the code is correct', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique
        .mockResolvedValueOnce(
          makeUser({
            twoFactorEnabled: true,
            twoFactorSecret: secret,
            emailVerified: true,
          }),
        )
        .mockResolvedValue(
          makeUser({
            twoFactorEnabled: true,
            twoFactorSecret: secret,
            emailVerified: true,
          }),
        );

      const loginResult: any = await service.login(validDto);
      const code = generateTotpCode(secret);

      const result = await service.verifyTwoFactor({
        loginToken: loginResult.loginToken,
        code,
      });

      expect(result.accessToken).toBeDefined();
      const decoded: any = service['jwtService'].decode(result.accessToken);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.type).toBe('access');
    });

    it('rejects an incorrect verification code', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique
        .mockResolvedValueOnce(
          makeUser({
            twoFactorEnabled: true,
            twoFactorSecret: secret,
            emailVerified: true,
          }),
        )
        .mockResolvedValue(
          makeUser({
            twoFactorEnabled: true,
            twoFactorSecret: secret,
            emailVerified: true,
          }),
        );

      const loginResult: any = await service.login(validDto);

      await expect(
        service.verifyTwoFactor({
          loginToken: loginResult.loginToken,
          code: '000000',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when 2FA is not enabled on the account', async () => {
      const loginToken = await service['jwtService'].signAsync(
        { sub: 'user-1', email: validDto.email, type: 'two-factor-login' },
        { expiresIn: '5m' },
      );
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: false }),
      );

      await expect(
        service.verifyTwoFactor({ loginToken, code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an invalid or tampered login token', async () => {
      await expect(
        service.verifyTwoFactor({ loginToken: 'not-a-jwt', code: '123456' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the access token so it becomes invalid', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      const loginResult: any = await service.login(validDto);

      const result = await service.logout(loginResult.accessToken);

      expect(result.message).toBe('Logged out successfully');
      expect(tokenRevocation.revoke).toHaveBeenCalledWith(
        loginResult.accessToken,
        expect.any(Number),
      );
    });

    it('revokes with a TTL that expires at the token expiry time', async () => {
      const token = await service['jwtService'].signAsync(
        { sub: 'user-1', email: validDto.email, type: 'access' },
        { expiresIn: 60 },
      );

      await service.logout(token);

      const ttl = tokenRevocation.revoke.mock.calls[0][1];
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });
  });

  describe('refresh', () => {
    it('issues a new token pair for a valid refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      const loginResult: any = await service.login(validDto);

      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'token-1',
        tokenHash: 'some-hash',
        userId: 'user-1',
        family: 'family-1',
        expiresAt: new Date(Date.now() + 1000000),
        revokedAt: null,
        createdAt: new Date(),
      });

      const result: any = await service.refresh(loginResult.refreshToken);

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(loginResult.refreshToken);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('rejects a token that is not a JWT', async () => {
      await expect(service.refresh('not-a-jwt')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects an access token used as a refresh token', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      const loginResult: any = await service.login(validDto);

      await expect(service.refresh(loginResult.accessToken)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a revoked refresh token and revokes the whole token family', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      const loginResult: any = await service.login(validDto);
      prisma.refreshToken.findUnique.mockResolvedValue({
        id: 'rt-1',
        userId: 'user-1',
        tokenHash: 'hash',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        revokedAt: new Date(),
        createdAt: new Date(),
      });

      await expect(service.refresh(loginResult.refreshToken)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('getProfile', () => {
    it('returns the user profile without sensitive fields', async () => {
      const user = makeUser({ createdAt: new Date() });
      // Return only the fields that Prisma's select clause projects —
      // sensitive columns (passwordHash, twoFactorSecret, etc.) are excluded
      // at the query level and should never appear in the result.
      prisma.user.findUnique.mockResolvedValue({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        twoFactorEnabled: user.twoFactorEnabled,
        createdAt: user.createdAt,
      });

      const result = await service.getProfile('user-1');

      expect(result).toEqual({
        id: 'user-1',
        name: validDto.name,
        email: validDto.email,
        emailVerified: false,
        twoFactorEnabled: false,
        createdAt: user.createdAt,
      });
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('twoFactorSecret');
    });

    it('throws NotFound when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setupTwoFactor', () => {
    it('generates a secret and otpauth URL, and stores the secret', async () => {
      const user = makeUser();
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.user.update.mockResolvedValue(user);

      const result = await service.setupTwoFactor('user-1');

      expect(result.secret).toBeDefined();
      expect(result.otpauthUrl).toContain('otpauth://totp/');
      expect(result.otpauthUrl).toContain(validDto.email.replace('@', '%40'));
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorSecret: result.secret },
      });
    });

    it('rejects setup when 2FA is already enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true }),
      );

      await expect(service.setupTwoFactor('user-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFound when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.setupTwoFactor('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('enableTwoFactor', () => {
    it('enables 2FA, returns recovery codes and revokes existing sessions', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorSecret: secret }),
      );
      prisma.user.update.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      const code = generateTotpCode(secret);
      const result = await service.enableTwoFactor('user-1', { code });

      expect(result.message).toBe(
        'Two-factor authentication enabled successfully',
      );
      expect(Array.isArray(result.recoveryCodes)).toBe(true);
      expect(result.recoveryCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            twoFactorEnabled: true,
            twoFactorRecoveryCodes: expect.any(Array),
          }),
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('stores hashed (never plaintext) recovery codes in PostgreSQL', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorSecret: secret }),
      );
      prisma.user.update.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      const code = generateTotpCode(secret);
      const result = await service.enableTwoFactor('user-1', { code });

      expect(result.recoveryCodes).toBeDefined();
      expect(result.recoveryCodes).toHaveLength(10);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            twoFactorEnabled: true,
            twoFactorRecoveryCodes: expect.any(Array),
          }),
        }),
      );
    });

    it('rejects an incorrect verification code', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorSecret: secret }),
      );

      await expect(
        service.enableTwoFactor('user-1', { code: '000000' }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects enabling when 2FA is already enabled', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      await expect(
        service.enableTwoFactor('user-1', { code: '123456' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects enabling without a prior setup', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.enableTwoFactor('user-1', { code: '123456' }),
      ).rejects.toThrow('Please request a 2FA setup first');
    });
  });

  describe('disableTwoFactor', () => {
    it('disables 2FA when code and password match, and revokes sessions', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );
      prisma.user.update.mockResolvedValue(makeUser());
      await fakeRedis.set(
        '2fa-recovery:user-1',
        JSON.stringify(['hash1', 'hash2']),
      );

      const code = generateTotpCode(secret);
      const result = await service.disableTwoFactor('user-1', {
        code,
        password: validDto.password,
      });

      expect(result.message).toBe(
        'Two-factor authentication disabled successfully',
      );
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'user-1' },
          data: expect.objectContaining({
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorRecoveryCodes: [],
          }),
        }),
      );
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('rejects a wrong password even with a valid code', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      const code = generateTotpCode(secret);
      await expect(
        service.disableTwoFactor('user-1', {
          code,
          password: 'WrongPass123',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an incorrect verification code', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );

      await expect(
        service.disableTwoFactor('user-1', {
          code: '000000',
          password: validDto.password,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects disabling when 2FA is not enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.disableTwoFactor('user-1', {
          code: '123456',
          password: validDto.password,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyRecoveryCode', () => {
    const getLoginToken = () =>
      service['jwtService'].signAsync(
        {
          sub: 'user-1',
          email: validDto.email,
          type: 'two-factor-login',
          jti: 'recovery-login-1',
        },
        { expiresIn: '5m' },
      );

    it('issues tokens when a valid unused recovery code is presented', async () => {
      const secret = generateTotpSecret();
      const plainCode = 'a1b2c-d3e4f';
      const hash = createHash('sha256')
        .update(plainCode.replace('-', '').toUpperCase())
        .digest('hex');

      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          twoFactorSecret: secret,
          twoFactorRecoveryCodes: [hash, 'other-hash'],
        }),
      );

      const loginToken = await getLoginToken();
      const result: any = await service.verifyRecoveryCode({
        loginToken,
        recoveryCode: plainCode,
      });

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { twoFactorRecoveryCodes: ['other-hash'] },
      });
    });

    it('rejects an unknown or already-used recovery code', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          twoFactorSecret: secret,
          twoFactorRecoveryCodes: ['some-hash'],
        }),
      );

      const loginToken = await getLoginToken();
      await expect(
        service.verifyRecoveryCode({
          loginToken,
          recoveryCode: 'zzzzz-zzzzz',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when 2FA is not enabled', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      const loginToken = await getLoginToken();

      await expect(
        service.verifyRecoveryCode({
          loginToken,
          recoveryCode: 'a1b2c-d3e4f',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an invalid login token', async () => {
      await expect(
        service.verifyRecoveryCode({
          loginToken: 'not-a-jwt',
          recoveryCode: 'a1b2c-d3e4f',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('forgotPassword', () => {
    it('sends a reset link to the registered email', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.forgotPassword({ email: validDto.email });

      expect(result.message).toBe(
        'A password reset link has been sent to your email',
      );
      expect(mailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        validDto.email,
        expect.stringContaining('token='),
      );

      const resetLink: string =
        mailService.sendPasswordResetEmail.mock.calls[0][1];
      expect(
        resetLink.startsWith('http://localhost:3000/reset-password?token='),
      ).toBe(true);

      const token = new URL(resetLink).searchParams.get('token') as string;
      const decoded: any = service['jwtService'].decode(token);
      expect(decoded.sub).toBe('user-1');
      expect(decoded.type).toBe('password-reset');
      expect(decoded.jti).toBeDefined();
      expect(decoded.prn).toBeDefined();
    });

    it('stores the reset nonce so only the latest link stays valid', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await service.forgotPassword({ email: validDto.email });

      const storedNonce = await fakeRedis.get('password-reset:user-1');
      expect(storedNonce).toBeDefined();
    });

    it('does not reveal whether an email is registered', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'nobody@example.com',
      });

      expect(result.message).toBe(
        'A password reset link has been sent to your email',
      );
      expect(mailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const newPassword = 'NewStrongPass456';

    const getValidToken = () =>
      service['jwtService'].signAsync(
        {
          sub: 'user-1',
          email: validDto.email,
          type: 'password-reset',
          jti: 'reset-1',
          prn: 'current-nonce',
        },
        { expiresIn: '15m' },
      );

    const seedValidNonce = () =>
      fakeRedis.set('password-reset:user-1', 'current-nonce');

    it('updates the password with a new hash and revokes the token', async () => {
      const token = await getValidToken();
      await seedValidNonce();
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser());

      const result = await service.resetPassword({ token, newPassword });

      expect(result.message).toBe('Password reset successfully');

      const updateData = prisma.user.update.mock.calls[0][0].data;
      expect(updateData.passwordHash).not.toBe(newPassword);
      expect(await bcrypt.compare(newPassword, updateData.passwordHash)).toBe(
        true,
      );
      expect(
        await bcrypt.compare(validDto.password, updateData.passwordHash),
      ).toBe(false);

      expect(tokenRevocation.revoke).toHaveBeenCalledWith(
        token,
        expect.any(Number),
      );
    });

    it('invalidates all existing sessions after a password reset', async () => {
      const token = await getValidToken();
      await seedValidNonce();
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser());

      await service.resetPassword({ token, newPassword });

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(await fakeRedis.get('password-reset:user-1')).toBeNull();
    });

    it('rejects resetting to the current password', async () => {
      const token = await getValidToken();
      await seedValidNonce();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          passwordHash: await bcrypt.hash(newPassword, 10),
        }),
      );

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects a reset link that is not the latest one issued', async () => {
      const token = await getValidToken();
      prisma.user.findUnique.mockResolvedValue(makeUser());
      // Store a different nonce than the one embedded in the token
      await fakeRedis.set('password-reset:user-1', 'stale-nonce');

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow(
        'This reset link is no longer valid. Please request a new one.',
      );
    });

    it('rejects an expired reset link', async () => {
      const token = await service['jwtService'].signAsync(
        {
          sub: 'user-1',
          email: validDto.email,
          type: 'password-reset',
          jti: 'reset-1',
        },
        { expiresIn: 0 },
      );

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow('Reset link has expired');
    });

    it('rejects a token that is not a reset token', async () => {
      const token = await service['jwtService'].signAsync(
        { sub: 'user-1', email: validDto.email, type: 'access', jti: 'x' },
        { expiresIn: '15m' },
      );

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow('Invalid reset link. Please request a new one.');
    });

    it('rejects a reset link that was already used', async () => {
      const token = await getValidToken();
      tokenRevocation.isRevoked.mockResolvedValue(true);

      await expect(
        service.resetPassword({ token, newPassword }),
      ).rejects.toThrow(
        'This reset link has already been used. Please request a new one.',
      );
    });
  });

  describe('verifyEmail', () => {
    it('marks the email as verified with valid code', async () => {
      const code = '123456';
      prisma.user.findUnique.mockResolvedValue(makeUser());
      prisma.user.update.mockResolvedValue(makeUser({ emailVerified: true }));
      await fakeRedis.set('email-verification:user-1', code);

      const result = await service.verifyEmail(validDto.email, code);

      expect(result.message).toBe('Email verified successfully');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerified: true },
      });
      expect(await fakeRedis.get('email-verification:user-1')).toBeNull();
    });

    it('reports success when the email is already verified', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      const result = await service.verifyEmail(validDto.email, '123456');

      expect(result.message).toBe('Email is already verified');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects an expired verification code', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      await expect(
        service.verifyEmail(validDto.email, '123456'),
      ).rejects.toThrow(
        'Verification code has expired. Please request a new one.',
      );
    });

    it('rejects an invalid verification code', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      await fakeRedis.set('email-verification:user-1', '654321');

      await expect(
        service.verifyEmail(validDto.email, '123456'),
      ).rejects.toThrow('Invalid verification code');
    });

    it('rejects when non-existent user email is passed', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.verifyEmail('nonexistent@example.com', '123456'),
      ).rejects.toThrow('Invalid verification code. Please request a new one.');
    });
  });

  describe('resendVerification', () => {
    it('sends a fresh verification code for an unverified account', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());

      const result = await service.resendVerification(validDto.email);

      expect(result.message).toBe('Verification code sent to your email');
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        validDto.email,
        expect.any(String),
      );
    });

    it('does not send a code for an already verified account', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );

      await service.resendVerification(validDto.email);

      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('does not reveal whether an email is registered', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.resendVerification('nobody@example.com');

      expect(result.message).toBe('Verification code sent to your email');
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });
  });

  describe('getGoogleOAuthUrl', () => {
    it('returns a valid Google authorization URL', async () => {
      const url = await service.getGoogleOAuthUrl();

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=google-client-id');
      expect(url).toContain('redirect_uri=');
      expect(url).toContain('scope=');
      expect(url).toContain('state=');
    });

    it('stores the state so the callback can be validated', async () => {
      const url = await service.getGoogleOAuthUrl();
      const state = new URL(url).searchParams.get('state') as string;

      expect(await fakeRedis.get(`oauth-state:${state}`)).toBe('google');
    });

    it('throws when Google OAuth is not configured', async () => {
      configService.get.mockImplementation((key: string) =>
        key === 'FRONTEND_URL' ? 'http://localhost:3000' : undefined,
      );

      await expect(service.getGoogleOAuthUrl()).rejects.toThrow(
        'Google OAuth settings are incomplete',
      );
    });
  });

  describe('handleGoogleOAuthCallback', () => {
    it('exchanges the code and creates an account for a new Google user', async () => {
      mockGoogleApis();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(async ({ data }) => ({
        id: 'user-2',
        ...data,
        twoFactorEnabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const state = (await service
        .getGoogleOAuthUrl()
        .then((url) => new URL(url).searchParams.get('state')))!;

      const result: any = await service.handleGoogleOAuthCallback(
        'code-1',
        state,
      );

      expect(result.accessToken).toBeDefined();
      expect(result.user.id).toBe('user-2');
      expect(result.user.emailVerified).toBe(true);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            oauthProvider: 'GOOGLE',
            oauthProviderId: 'google-id-1',
            email: validDto.email,
          }),
        }),
      );
    });

    it('links Google to an existing account with the same email', async () => {
      mockGoogleApis();
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makeUser());
      prisma.user.update.mockResolvedValue(
        makeUser({ oauthProvider: 'GOOGLE', oauthProviderId: 'google-id-1' }),
      );

      const state = (await service
        .getGoogleOAuthUrl()
        .then((url) => new URL(url).searchParams.get('state')))!;

      const result: any = await service.handleGoogleOAuthCallback(
        'code-1',
        state,
      );

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({ oauthProvider: 'GOOGLE' }),
      });
      expect(result.user.id).toBe('user-1');
    });

    it('resets passwordHash to null when linking an unverified existing account to prevent pre-hijacking', async () => {
      mockGoogleApis();
      const unverifiedUser = makeUser({
        emailVerified: false,
        passwordHash: 'attacker-chosen-hash',
      });
      prisma.user.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(unverifiedUser);
      prisma.user.update.mockResolvedValue(
        makeUser({
          oauthProvider: 'GOOGLE',
          oauthProviderId: 'google-id-1',
          emailVerified: true,
          passwordHash: null,
        }),
      );

      const state = (await service
        .getGoogleOAuthUrl()
        .then((url) => new URL(url).searchParams.get('state')))!;

      const result: any = await service.handleGoogleOAuthCallback(
        'code-1',
        state,
      );

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          oauthProvider: 'GOOGLE',
          oauthProviderId: 'google-id-1',
          emailVerified: true,
          passwordHash: null,
        }),
      });
      expect(result.user.id).toBe('user-1');
    });

    it('requires a 2FA step when the account has 2FA enabled', async () => {
      mockGoogleApis();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          emailVerified: true,
          twoFactorEnabled: true,
          oauthProvider: 'GOOGLE',
          oauthProviderId: 'google-id-1',
        }),
      );

      const state = (await service
        .getGoogleOAuthUrl()
        .then((url) => new URL(url).searchParams.get('state')))!;

      const result: any = await service.handleGoogleOAuthCallback(
        'code-1',
        state,
      );

      expect(result.requiresTwoFactor).toBe(true);
      expect(result.loginToken).toBeDefined();
      expect(result.accessToken).toBeUndefined();
    });

    it('rejects a callback with an unknown or used state', async () => {
      mockGoogleApis();

      await expect(
        service.handleGoogleOAuthCallback('code-1', 'forged-state'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when Google cannot exchange the authorization code', async () => {
      (global as any).fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: jest.fn().mockResolvedValue({ error: 'invalid_grant' }),
      });
      prisma.user.findFirst.mockResolvedValue(null);
      await fakeRedis.set('oauth-state:valid-state', 'google');

      await expect(
        service.handleGoogleOAuthCallback('bad-code', 'valid-state'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when Google returns no profile', async () => {
      (global as any).fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: jest
            .fn()
            .mockResolvedValue({ access_token: 'google-access-token' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: jest.fn().mockResolvedValue({ error: 'invalid_token' }),
        });
      await fakeRedis.set('oauth-state:valid-state', 'google');

      await expect(
        service.handleGoogleOAuthCallback('code-1', 'valid-state'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('registration hardening', () => {
    it('never returns the verification code in the response', async () => {
      prisma.user.create.mockResolvedValue(makeUser());
      const result: any = await service.register(validDto);
      expect(result.code).toBeUndefined();
      expect(result.verificationCode).toBeUndefined();
      expect(JSON.stringify(result)).not.toMatch(/\d{6}/);
    });

    it('does not return the code from resendVerification either', async () => {
      prisma.user.findUnique.mockResolvedValue(makeUser());
      const result: any = await service.resendVerification(validDto.email);
      expect(result).toEqual({
        message: 'Verification code sent to your email',
      });
      expect(mailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('lets the real owner reclaim an address squatted by an unverified account', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '1',
        }),
      );
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: false, passwordHash: 'squatter-hash' }),
      );

      const result: any = await service.register({
        ...validDto,
        name: 'Real Owner',
      });

      expect(result.message).toContain('verification');
      const data = prisma.user.update.mock.calls[0][0].data;
      expect(data.name).toBe('Real Owner');
      expect(await bcrypt.compare(validDto.password, data.passwordHash)).toBe(
        true,
      );
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        validDto.email,
        expect.stringMatching(/^\d{6}$/),
      );
    });

    it('still rejects registration for a verified account', async () => {
      prisma.user.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '1',
        }),
      );
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      await expect(service.register(validDto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('signs the student in once the email is verified', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: false }),
      );
      await fakeRedis.set('email-verification:user-1', '123456', 'EX', 900);

      const result: any = await service.verifyEmail(validDto.email, '123456');

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerified: true },
      });
    });
  });

  describe('sign-in with an emailed code', () => {
    const sentCode = () =>
      mailService.sendLoginCodeEmail.mock.calls.at(-1)[1] as string;

    it('emails a 6-digit code to an existing account', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      await service.requestLoginCode(validDto.email);
      expect(sentCode()).toMatch(/^\d{6}$/);
    });

    it('answers identically for unknown emails and sends nothing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknown = await service.requestLoginCode('nobody@example.com');
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      const known = await service.requestLoginCode(validDto.email);
      expect(unknown).toEqual(known);
      expect(mailService.sendLoginCodeEmail).toHaveBeenCalledTimes(1);
    });

    it('sends at most one code per minute per account', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      await service.requestLoginCode(validDto.email);
      await service.requestLoginCode(validDto.email);
      expect(mailService.sendLoginCodeEmail).toHaveBeenCalledTimes(1);
    });

    it('signs in with the right code, once', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      await service.requestLoginCode(validDto.email);
      const code = sentCode();

      const result: any = await service.verifyLoginCode(validDto.email, code);
      expect(result.accessToken).toEqual(expect.any(String));

      await expect(
        service.verifyLoginCode(validDto.email, code),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a wrong code', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      await service.requestLoginCode(validDto.email);
      const wrong = sentCode() === '000000' ? '111111' : '000000';
      await expect(
        service.verifyLoginCode(validDto.email, wrong),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('burns the code after five wrong guesses', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      await service.requestLoginCode(validDto.email);
      const code = sentCode();
      const wrong = code === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await expect(
          service.verifyLoginCode(validDto.email, wrong),
        ).rejects.toThrow(UnauthorizedException);
      }
      // The sixth attempt fails even with the right code
      await expect(
        service.verifyLoginCode(validDto.email, code),
      ).rejects.toThrow(/Too many wrong codes/);
    });

    it('verifies an unverified email, since the code proves inbox ownership', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: false }),
      );
      await service.requestLoginCode(validDto.email);
      await service.verifyLoginCode(validDto.email, sentCode());
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { emailVerified: true },
      });
    });

    it('still requires the authenticator code when 2FA is on', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true, twoFactorEnabled: true }),
      );
      await service.requestLoginCode(validDto.email);
      const result: any = await service.verifyLoginCode(
        validDto.email,
        sentCode(),
      );
      expect(result.requiresTwoFactor).toBe(true);
      expect(result.accessToken).toBeUndefined();
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      await expect(
        service.changePassword('user-1', {
          currentPassword: 'WrongPass999',
          newPassword: 'NewPass4567',
        }),
      ).rejects.toThrow(UnauthorizedException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      await expect(
        service.changePassword('user-1', {
          currentPassword: validDto.password,
          newPassword: validDto.password,
        }),
      ).rejects.toThrow(/different/);
    });

    it('changes the password, signs out other devices and keeps this one signed in', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      const result: any = await service.changePassword('user-1', {
        currentPassword: validDto.password,
        newPassword: 'NewPass4567',
      });
      const stored = prisma.user.update.mock.calls[0][0].data.passwordHash;
      expect(await bcrypt.compare('NewPass4567', stored)).toBe(true);
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
      expect(result.accessToken).toEqual(expect.any(String));
      expect(mailService.sendSecurityNotice).toHaveBeenCalled();
    });

    it('lets a Google account set its first password without a current one', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          emailVerified: true,
          passwordHash: null,
          oauthProvider: 'google',
        }),
      );
      await service.changePassword('user-1', { newPassword: 'NewPass4567' });
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('two-factor hardening', () => {
    const loginWith2fa = async (secret: string) => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          emailVerified: true,
          twoFactorEnabled: true,
          twoFactorSecret: secret,
        }),
      );
      const { loginToken } = (await service.login(validDto)) as any;
      return loginToken as string;
    };

    it('rejects a code that was already used', async () => {
      const secret = generateTotpSecret();
      const code = generateTotpCode(secret);
      await service.verifyTwoFactor({
        loginToken: await loginWith2fa(secret),
        code,
      });
      await expect(
        service.verifyTwoFactor({
          loginToken: await loginWith2fa(secret),
          code,
        }),
      ).rejects.toThrow(/already used/);
    });

    it('locks the account after five wrong codes, even from fresh login tokens', async () => {
      const secret = generateTotpSecret();
      const right = generateTotpCode(secret);
      const wrong = right === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i++) {
        await expect(
          service.verifyTwoFactor({
            loginToken: await loginWith2fa(secret),
            code: wrong,
          }),
        ).rejects.toThrow(UnauthorizedException);
      }
      await expect(
        service.verifyTwoFactor({
          loginToken: await loginWith2fa(secret),
          code: right,
        }),
      ).rejects.toThrow(/Too many wrong codes/);
    });

    it('returns a QR code image with the setup secret', async () => {
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ emailVerified: true }),
      );
      const result: any = await service.setupTwoFactor('user-1');
      expect(result.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
      expect(
        Buffer.from(result.qrCode.split(',')[1], 'base64').toString(),
      ).toContain('<svg');
    });

    it('lets a Google account (no password) turn 2FA off with a valid code', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          passwordHash: null,
          twoFactorEnabled: true,
          twoFactorSecret: secret,
        }),
      );
      const result = await service.disableTwoFactor('user-1', {
        code: generateTotpCode(secret),
      });
      expect(result.message).toBe(
        'Two-factor authentication disabled successfully',
      );
    });

    it('still demands the password to disable 2FA when the account has one', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({ twoFactorEnabled: true, twoFactorSecret: secret }),
      );
      await expect(
        service.disableTwoFactor('user-1', { code: generateTotpCode(secret) }),
      ).rejects.toThrow('Invalid password');
    });

    it('regenerates recovery codes and invalidates the old ones', async () => {
      const secret = generateTotpSecret();
      prisma.user.findUnique.mockResolvedValue(
        makeUser({
          twoFactorEnabled: true,
          twoFactorSecret: secret,
          twoFactorRecoveryCodes: ['old-hash'],
        }),
      );
      const result = await service.regenerateRecoveryCodes('user-1', {
        code: generateTotpCode(secret),
      });
      expect(result.recoveryCodes).toHaveLength(10);
      const stored: string[] =
        prisma.user.update.mock.calls[0][0].data.twoFactorRecoveryCodes;
      expect(stored).not.toContain('old-hash');
      expect(stored).toHaveLength(10);
    });
  });
});
