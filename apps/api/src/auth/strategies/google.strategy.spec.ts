import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleStrategy } from './google.strategy';
import { OAuthService } from '../services/oauth.service';
import { ACCOUNT_SUSPENDED_MESSAGE } from './jwt.strategy';

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;
  let mockConfigService: jest.Mocked<Partial<ConfigService>>;
  let mockOAuthService: jest.Mocked<Partial<OAuthService>>;

  beforeEach(() => {
    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'GOOGLE_CLIENT_ID') return 'test-client-id';
        if (key === 'GOOGLE_CLIENT_SECRET') return 'test-client-secret';
        if (key === 'GOOGLE_REDIRECT_URI')
          return 'http://localhost:3002/api/v1/auth/oauth/google/callback';
        return undefined;
      }),
    };

    mockOAuthService = {
      validateGoogleUser: jest.fn(),
    };

    strategy = new GoogleStrategy(
      mockConfigService as ConfigService,
      mockOAuthService as OAuthService,
    );
  });

  it('validates a google profile and returns the user', async () => {
    const mockProfile: any = {
      id: 'google-id-123',
      displayName: 'Test User',
      emails: [{ value: 'test@example.com', verified: true }],
      photos: [{ value: 'https://example.com/photo.jpg' }],
    };

    const mockUser: any = {
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      oauthProvider: 'GOOGLE',
      oauthProviderId: 'google-id-123',
      suspendedAt: null,
    };

    (mockOAuthService.validateGoogleUser as jest.Mock).mockResolvedValue(
      mockUser,
    );

    const done = jest.fn();
    const result = await strategy.validate(
      'access-tok',
      'refresh-tok',
      mockProfile,
      done,
    );

    expect(mockOAuthService.validateGoogleUser).toHaveBeenCalledWith(
      mockProfile,
    );
    expect(done).toHaveBeenCalledWith(null, mockUser);
    expect(result).toEqual(mockUser);
  });

  it('throws UnauthorizedException and calls done(err) when user is suspended', async () => {
    const mockProfile: any = {
      id: 'google-id-suspended',
      displayName: 'Suspended User',
      emails: [{ value: 'suspended@example.com', verified: true }],
    };

    const suspendedUser: any = {
      id: 'user-suspended',
      email: 'suspended@example.com',
      name: 'Suspended User',
      oauthProvider: 'GOOGLE',
      oauthProviderId: 'google-id-suspended',
      suspendedAt: new Date(),
    };

    (mockOAuthService.validateGoogleUser as jest.Mock).mockResolvedValue(
      suspendedUser,
    );

    const done = jest.fn();

    await expect(
      strategy.validate('access-tok', 'refresh-tok', mockProfile, done),
    ).rejects.toThrow(new UnauthorizedException(ACCOUNT_SUSPENDED_MESSAGE));

    expect(done).toHaveBeenCalledWith(
      expect.any(UnauthorizedException),
      undefined,
    );
  });
});
