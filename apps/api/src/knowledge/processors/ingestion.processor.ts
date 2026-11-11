import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { IngestionPipelineService } from '../services/ingestion-pipeline.service';
import {
  INGESTION_QUEUE,
  IngestionJobData,
  IngestionJobName,
} from '../knowledge.types';

/**
 * عامل طابور المعالجة. مهمة وحدة بالمرة (concurrency 1): التفريغ الضوئي
 * والتضمين بيستهلكوا حدود المزوّد، وملفين بالتوازي بيطيّحوا الاتنين.
 */
// القفل بيتجدد تلقائياً كل نص مدة وهو شغّال، فمهمة ساعة ما بتنقطع. المدة
// القصيرة بتخلّي مهمة انقطعت (السيرفر رجع قام) ترجع للطابور خلال دقيقتين
// وبتكمّل من نقطة الحفظ.
// maxStalledCount: كل إعادة تشغيل (نشر، بناء بالتطوير) بتعلّق المهمة مرة؛ الافتراضي
// واحدة بس، والاستكمال من نقطة الحفظ بيخلّي التكرار رخيص.
@Processor(INGESTION_QUEUE, {
  concurrency: 1,
  lockDuration: 2 * 60_000,
  maxStalledCount: 5,
})
export class IngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(IngestionProcessor.name);

  constructor(private readonly pipeline: IngestionPipelineService) {
    super();
  }

  async process(
    job: Job<IngestionJobData, void, IngestionJobName>,
  ): Promise<void> {
    const { documentId } = job.data;
    this.logger.log(
      `${job.name} ${documentId} (attempt ${job.attemptsMade + 1})`,
    );
    switch (job.name) {
      case 'process':
        return this.pipeline.process(documentId);
      case 'rechunk':
        return this.pipeline.rechunk(documentId);
      case 'embed':
        return this.pipeline.embed(documentId);
    }
  }

  /** آخر محاولة فشلت (أو المهمة علقت) — لازم الملف يبيّن فاشل حتى ينعاد */
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<IngestionJobData, void, IngestionJobName> | undefined,
    err: Error,
  ) {
    if (!job) return;
    // التعليق ما بيمرّ على إعادة المحاولات، فـ attemptsMade ممكن يكون أقل
    const final =
      job.attemptsMade >= (job.opts.attempts ?? 1) ||
      /stalled/i.test(err.message);
    if (!final) return;
    await this.pipeline
      .failIfRunning(job.data.documentId, err)
      .catch((e: unknown) => this.logger.error(`mark failed: ${String(e)}`));
  }
}
