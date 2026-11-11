import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES_ENABLED } from '../common/queues';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

// Controllers
import { QuestionsController } from './controllers/questions.controller';

// Services
import { QuestionGenerationService } from './services/question-generation.service';
import { StyleUploadService } from './services/style-upload.service';
import { StyleGenerationService } from './services/style-generation.service';

// Builders
import { GenerationPromptBuilder } from './builders/generation-prompt.builder';

// Guards
import { GenerationRateLimitGuard } from './guards/generation-rate-limit.guard';
import { QuotaRefundInterceptor } from './interceptors/quota-refund.interceptor';

// Processors
import { StyleExtractionProcessor } from './processors/style-extraction.processor';

// Infrastructure modules
import { StorageModule } from '../storage/storage.module';
import { GeminiModule } from '../gemini/gemini.module';
import { RedisModule } from '../redis/redis.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [
    StorageModule,
    GeminiModule,
    RedisModule,
    KnowledgeModule,
    ...(QUEUES_ENABLED
      ? [BullModule.registerQueue({ name: 'style-extraction-queue' })]
      : []),
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [QuestionsController],
  providers: [
    QuestionGenerationService,
    StyleUploadService,
    StyleGenerationService,
    GenerationPromptBuilder,
    GenerationRateLimitGuard,
    QuotaRefundInterceptor,
    ...(QUEUES_ENABLED ? [StyleExtractionProcessor] : []),
  ],
  exports: [
    QuestionGenerationService,
    StyleGenerationService,
    GenerationPromptBuilder,
    GenerationRateLimitGuard,
    QuotaRefundInterceptor,
  ],
})
export class QuestionsModule {}
