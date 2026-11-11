import { Module } from '@nestjs/common';
import { SubjectController } from './subject.controller';
import { SubjectService } from './subject.service';
import { StorageModule } from '../storage/storage.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ThrottleGuard } from '../common';

@Module({
  imports: [StorageModule, KnowledgeModule],
  controllers: [SubjectController],
  providers: [SubjectService, ThrottleGuard],
  exports: [SubjectService],
})
export class SubjectModule {}
