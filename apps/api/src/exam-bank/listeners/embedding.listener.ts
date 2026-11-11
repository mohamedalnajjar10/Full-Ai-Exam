import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QuestionApprovedEvent } from '../events/question-approved.event';
import { QuestionUpdatedEvent } from '../events/question-updated.event';

/**
 * Bridges domain events to BullMQ embedding queue.
 * Listens for question.approved and question.updated events and
 * enqueues lightweight embedding jobs (ID only).
 */
@Injectable()
export class EmbeddingListener {
  private readonly logger = new Logger(EmbeddingListener.name);

  constructor(
    // اختياري: الطابور مش مسجّل بدون REDIS_URL
    @Optional()
    @InjectQueue('question-embedding')
    private readonly embeddingQueue?: Queue,
  ) {}

  /**
   * هاد مستمع أحداث، مش مسار طلب — لو ما في طابور منسجّل ومنكمّل بدل
   * ما نرمي خطأ يوقع عملية ما حدا طالبها مباشرة.
   *
   * تنبيه: السؤال بيضل embeddingStatus = PENDING، وما في حالياً أي مهمة
   * بترجع تلمّ الأسئلة المعلّقة لما يشتغل Redis. والبحث بيقرا INDEXED بس
   * (question-generation.service.ts)، يعني السؤال بيضل خارج الاسترجاع
   * لحدا ما يتعمله إعادة حفظ أو ينكتب backfill.
   */
  private enqueue(bankQuestionId: string, reason: string): boolean {
    if (!this.embeddingQueue) {
      this.logger.warn(
        `Skipped embedding for ${reason} question ${bankQuestionId}: no REDIS_URL, background processing is disabled`,
      );
      return false;
    }
    return true;
  }

  @OnEvent('question.approved', { async: true })
  async handleApproved(event: QuestionApprovedEvent): Promise<void> {
    if (!this.enqueue(event.bankQuestionId, 'approved')) return;

    await this.embeddingQueue!.add(
      'embed',
      { bankQuestionId: event.bankQuestionId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
    this.logger.log(
      `Enqueued embedding job for approved question ${event.bankQuestionId}`,
    );
  }

  @OnEvent('question.updated', { async: true })
  async handleUpdated(event: QuestionUpdatedEvent): Promise<void> {
    if (!this.enqueue(event.bankQuestionId, 'updated')) return;

    await this.embeddingQueue!.add(
      'embed',
      { bankQuestionId: event.bankQuestionId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );
    this.logger.log(
      `Enqueued re-embedding job for updated question ${event.bankQuestionId}`,
    );
  }
}
