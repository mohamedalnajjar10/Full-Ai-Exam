import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { MailModule } from './mail/mail.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BranchModule } from './branch/branch.module';
import { SubjectModule } from './subject/subject.module';
import { ExamBankModule } from './exam-bank/exam-bank.module';
import { QuestionsModule } from './questions/questions.module';
import { ChatModule } from './chat/chat.module';
import { TeachersModule } from './teachers/teachers.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { UsageModule } from './usage/usage.module';
import { PlatformModule } from './platform/platform.module';
import { AssessmentModule } from './assessments/assessments.module';
import { ParentModule } from './parent/parent.module';
import { SupportModule } from './support/support.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { validateEnv } from './config/env.validation';
import { QUEUES_ENABLED } from './common/queues';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    ...(QUEUES_ENABLED
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (config: ConfigService) => {
              const redisUrl = config.get<string>(
                'REDIS_URL',
                'redis://localhost:6379',
              );
              const url = new URL(redisUrl);
              // Redis مطلوب بس لمهام الخلفية (استخراج الامتحانات، التضمين،
              // تحليل النمط). بدونه التطبيق بيشتغل عادي — بس لازم يفشل بهدوء
              // ووضوح بدل ما يفضل يحاول الاتصال للأبد وقت الإقلاع.
              const isProduction =
                config.get<string>('NODE_ENV') === 'production';
              return {
                connection: {
                  host: url.hostname,
                  port: parseInt(url.port || '6379', 10),
                  // redis://host:6379/2 → قاعدة 2 (كانت تنتجاهل وكل النسخ تشارك قاعدة 0)
                  db: parseInt(url.pathname.slice(1), 10) || 0,
                  username: url.username || undefined,
                  password: url.password || undefined,
                  tls:
                    url.protocol === 'rediss:'
                      ? { rejectUnauthorized: false }
                      : undefined,
                  maxRetriesPerRequest: null,
                  // ما بيتصل لحد ما تنطلب أول مهمة
                  lazyConnect: true,
                  // بالإنتاج منضل نحاول؛ بالتطوير منوقف بعد محاولتين حتى ما
                  // يغرق الـ log بـ ECONNREFUSED لما ما يكون Redis شغّال
                  retryStrategy: (times: number) =>
                    isProduction || times <= 2
                      ? Math.min(times * 500, 3000)
                      : null,
                  // بدون هيك، .add() بتعلّق للأبد بدل ما ترمي خطأ واضح
                  enableOfflineQueue: isProduction,
                },
              };
            },
            inject: [ConfigService],
          }),
        ]
      : []),
    PrismaModule,
    RedisModule,
    UsageModule,
    MailModule,
    CommonModule,
    AuthModule,
    UsersModule,
    BranchModule,
    SubjectModule,
    ExamBankModule,
    QuestionsModule,
    ChatModule,
    TeachersModule,
    KnowledgeModule,
    PlatformModule,
    AssessmentModule,
    ParentModule,
    SupportModule,
    SubscriptionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
