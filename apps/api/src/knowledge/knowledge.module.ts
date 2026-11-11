import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUES_ENABLED, RUNS_HEAVY_JOBS } from '../common/queues';
import { StorageModule } from '../storage/storage.module';
import { GeminiModule } from '../gemini/gemini.module';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './services/knowledge.service';
import { IngestionSettingsService } from './services/ingestion-settings.service';
import { IngestionPipelineService } from './services/ingestion-pipeline.service';
import { DocumentExtractorService } from './services/document-extractor.service';
import { KnowledgeRetrievalService } from './services/knowledge-retrieval.service';
import { IngestionProcessor } from './processors/ingestion.processor';
import { INGESTION_QUEUE } from './knowledge.types';

@Module({
  imports: [
    StorageModule,
    GeminiModule,
    ...(QUEUES_ENABLED
      ? [
          BullModule.registerQueue(
            { name: INGESTION_QUEUE },
            { name: 'question-embedding' },
          ),
        ]
      : []),
  ],
  controllers: [KnowledgeController],
  providers: [
    KnowledgeService,
    IngestionSettingsService,
    IngestionPipelineService,
    DocumentExtractorService,
    KnowledgeRetrievalService,
    // المعالجة نفسها بعملية الـ worker (انظر RUNS_HEAVY_JOBS)
    ...(RUNS_HEAVY_JOBS ? [IngestionProcessor] : []),
  ],
  exports: [KnowledgeService, KnowledgeRetrievalService],
})
export class KnowledgeModule {}
