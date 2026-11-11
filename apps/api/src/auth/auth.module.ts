import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './services/auth.service';
import { TokenService } from './services/token.service';
import { TokenCleanupTask } from './tasks/token-cleanup.task';
import { TwoFactorService } from './services/two-factor.service';
import { OAuthService } from './services/oauth.service';
import { PasswordService } from './services/password.service';
import { AuthController } from './auth.controller';
import { TokenRevocationService } from './services/token-revocation.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { ThrottleGuard } from '../common/guards/throttle.guard';
import { DEV_JWT_SECRET } from './constant/auth-messages';

import { ParentAuthService } from './services/parent-auth.service';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        const nodeEnv = configService.get<string>('NODE_ENV');
        const isProductionLike =
          nodeEnv === 'production' || nodeEnv === 'staging';
        if (isProductionLike && (!secret || secret === DEV_JWT_SECRET)) {
          throw new Error(
            'JWT_SECRET must be set to a secure value in production and staging. ' +
              'The default dev secret is not allowed when NODE_ENV is production or staging.',
          );
        }
        return { secret: secret ?? DEV_JWT_SECRET };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    ParentAuthService,
    TokenService,
    TokenCleanupTask,
    TwoFactorService,
    OAuthService,
    PasswordService,
    TokenRevocationService,
    JwtStrategy,
    GoogleStrategy,
    ThrottleGuard,
  ],
  // TokenService و PasswordService لإدارة الحسابات من لوحة التحكم
  exports: [JwtModule, TokenService, PasswordService, ParentAuthService],
})
export class AuthModule {}
