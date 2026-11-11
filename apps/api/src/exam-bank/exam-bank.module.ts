import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES_ENABLED, RUNS_HEAVY_JOBS } from '../common/queues';

// Controllers
import { ExamBankController } from './controllers/exam-bank.controller';
import { StagingController } from './controllers/staging.controller';

// Services
import { ExamBankService } from './services/exam-bank.service';
import { StagingService } from './services/staging.service';
import { HybridSearchService } from './services/hybrid-search.service';

// Processors (BullMQ workers)
import { EmbeddingProcessor } from './processors/embedding.processor';

// Event listeners
import { EmbeddingListener } from './listeners/embedding.listener';

// Infrastructure modules
import { GeminiModule } from '../gemini/gemini.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';

@Module({
  imports: [
    GeminiModule,
    // رفع الامتحانات واستخراجها صار بخط المعالجة تبع قاعدة المعرفة
    KnowledgeModule,
    // بدون Redis ما منسجّل الطوابير ولا الـ workers — وإلا بيضلوا
    // يحاولوا الاتصال ويغرقوا الـ log وقت الإقلاع
    ...(QUEUES_ENABLED
      ? [BullModule.registerQueue({ name: 'question-embedding' })]
      : []),
  ],
  controllers: [ExamBankController, StagingController],
  providers: [
    ExamBankService,
    StagingService,
    HybridSearchService,
    EmbeddingListener,
    // التضمين المحلي بياكل المعالج — بعملية الـ worker
    ...(RUNS_HEAVY_JOBS ? [EmbeddingProcessor] : []),
  ],
})
export class ExamBankModule {}
