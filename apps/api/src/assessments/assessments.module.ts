import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { GeminiModule } from '../gemini/gemini.module';
import { UsageModule } from '../usage/usage.module';
import { QuestionsModule } from '../questions/questions.module';
import { RedisModule } from '../redis/redis.module';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';

@Module({
  imports: [
    PrismaModule,
    GeminiModule,
    UsageModule,
    QuestionsModule,
    RedisModule,
  ],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
  exports: [AssessmentsService],
})
export class AssessmentModule {}
