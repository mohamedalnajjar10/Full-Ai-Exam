import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ParentLinkStatus, Prisma } from '@prisma/client';
import {
  STUDENT_EVENTS,
  StudentActivityEventPayload,
} from '../events/student-activity.events';
import { ParentRealtimeService } from '../services/parent-realtime.service';

export const PARENT_NOTIFICATIONS_QUEUE = 'parent-notifications-queue';

@Injectable()
export class ParentEventsListener {
  private readonly logger = new Logger(ParentEventsListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeService: ParentRealtimeService,
    @Optional()
    @InjectQueue(PARENT_NOTIFICATIONS_QUEUE)
    private readonly notificationQueue?: Queue,
  ) {}

  /**
   * Captures assessment submission events.
   * Runs asynchronously ({ async: true }) to prevent blocking student HTTP responses.
   * Persists to StudentActivityEvent and dispatches a BullMQ notification job.
   */
  @OnEvent(STUDENT_EVENTS.ASSESSMENT_COMPLETED, { async: true })
  async handleAssessmentCompleted(
    payload: StudentActivityEventPayload,
  ): Promise<void> {
    try {
      this.logger.log(
        `[Event-Driven] Recording Assessment Completed for student: ${payload.studentId}`,
      );

      // 1. Persist the event to StudentActivityEvent table
      const savedEvent = await this.prisma.studentActivityEvent.create({
        data: {
          studentId: payload.studentId,
          eventType: payload.type,
          title: payload.title,
          metadata: (payload.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });

      // 2. Live SSE Broadcast to parent dashboard instantly
      this.realtimeService.emitStudentEvent(
        payload.studentId,
        payload.type,
        payload.title,
        payload.metadata ?? {},
      );

      // 3. High-priority milestone: Enqueue Web Push notification job for linked parents
      await this.dispatchParentNotificationJob({
        eventId: savedEvent.id,
        studentId: payload.studentId,
        eventType: payload.type,
        title: 'إنجاز جديد: أتم ابنكم اختبار تقييم القدرات',
        body: `أنهى الطالب اختباراً في مادة ${payload.metadata?.subjectName ?? 'دراسية'} بنسبة ${payload.metadata?.score ?? 0}%`,
        data: {
          attemptId: payload.metadata?.attemptId,
          score: payload.metadata?.score,
          subjectId: payload.subjectId,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to handle assessment.completed event: ${msg}`);
    }
  }

  /**
   * Captures interactive quiz submission and retake events.
   * Broadcasts to live SSE stream for instant parent dashboard update,
   * and optionally dispatches web push notification.
   */
  @OnEvent(STUDENT_EVENTS.QUIZ_COMPLETED, { async: true })
  async handleQuizCompleted(
    payload: StudentActivityEventPayload,
  ): Promise<void> {
    try {
      this.logger.log(
        `[Event-Driven] Broadcasting live Quiz Completed for student: ${payload.studentId}`,
      );

      // 1. Broadcast immediately via SSE to connected parents
      this.realtimeService.emitStudentEvent(
        payload.studentId,
        payload.type,
        payload.title,
        payload.metadata ?? {},
      );

      // 2. High-priority milestone: Enqueue notification for linked parents
      const meta = payload.metadata as Record<string, any> | undefined;
      const score = Number(meta?.score ?? 0);
      const isRetake = Boolean(meta?.isRetake);
      const isImprovement = Boolean(meta?.isImprovement);

      let pushTitle = 'نشاط جديد: أتم ابنكم كويزاً تفاعلياً';
      let pushBody = `أنهى الطالب كويزاً في مادة ${meta?.subjectName ?? 'دراسية'} بنسبة ${score}%`;

      if (isRetake && isImprovement) {
        pushTitle = '🎉 إنجاز متميز: تحسن ملحوظ في إعادة الكويز!';
        pushBody = `أعاد ابنكم كويز ${meta?.subjectName ?? 'المادة'} وحقق نتيجة أعلى بنسبة ${score}% (أعلى من ${meta?.previousScore ?? 0}%)`;
      } else if (score >= 85) {
        pushTitle = '🌟 تفوق جديد: أداء ممتاز في كويز تفاعلي';
        pushBody = `أنهى ابنكم كويز ${meta?.subjectName ?? 'المادة'} بتفوق بنسبة ${score}%`;
      }

      await this.dispatchParentNotificationJob({
        eventId: String(meta?.eventId ?? ''),
        studentId: payload.studentId,
        eventType: payload.type,
        title: pushTitle,
        body: pushBody,
        data: {
          score,
          subjectId: payload.subjectId,
          isRetake,
          isImprovement,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to handle quiz.completed event: ${msg}`);
    }
  }

  /**
   * Captures practice question generation events.
   */
  @OnEvent(STUDENT_EVENTS.QUESTIONS_GENERATED, { async: true })
  async handleQuestionsGenerated(
    payload: StudentActivityEventPayload,
  ): Promise<void> {
    try {
      this.logger.log(
        `[Event-Driven] Recording Questions Generated for student: ${payload.studentId}`,
      );

      await this.prisma.studentActivityEvent.create({
        data: {
          studentId: payload.studentId,
          eventType: payload.type,
          title: payload.title,
          metadata: (payload.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to handle questions.generated event: ${msg}`);
    }
  }

  /**
   * Captures simulation exam file uploads in the chat.
   */
  @OnEvent(STUDENT_EVENTS.CHAT_FILE_UPLOADED, { async: true })
  async handleChatFileUploaded(
    payload: StudentActivityEventPayload,
  ): Promise<void> {
    try {
      this.logger.log(
        `[Event-Driven] Recording Chat File Uploaded for student: ${payload.studentId}`,
      );

      await this.prisma.studentActivityEvent.create({
        data: {
          studentId: payload.studentId,
          eventType: payload.type,
          title: payload.title,
          metadata: (payload.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to handle chat.file.uploaded event: ${msg}`);
    }
  }

  /**
   * Captures closed chat study sessions.
   */
  @OnEvent(STUDENT_EVENTS.CHAT_SESSION_CLOSED, { async: true })
  async handleChatSessionClosed(
    payload: StudentActivityEventPayload,
  ): Promise<void> {
    try {
      this.logger.log(
        `[Event-Driven] Recording Chat Session Closed for student: ${payload.studentId}`,
      );

      await this.prisma.studentActivityEvent.create({
        data: {
          studentId: payload.studentId,
          eventType: payload.type,
          title: payload.title,
          metadata: (payload.metadata ?? {}) as Prisma.InputJsonValue,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to handle chat.session.closed event: ${msg}`);
    }
  }

  /**
   * Helper: Dispatches a background notification job to BullMQ for active linked parents.
   */
  private async dispatchParentNotificationJob(notification: {
    eventId: string;
    studentId: string;
    eventType: string;
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.notificationQueue) {
      this.logger.debug(
        `BullMQ is inactive (REDIS_URL not configured). Notification job skipped for event ${notification.eventId}.`,
      );
      return;
    }

    // Verify linked active parents exist before queuing
    const linkedParents = await this.prisma.parentStudentLink.findMany({
      where: {
        studentId: notification.studentId,
        status: ParentLinkStatus.ACTIVE,
      },
      select: { parentId: true },
    });

    if (!linkedParents.length) {
      return;
    }

    for (const link of linkedParents) {
      if (link.parentId) {
        await this.notificationQueue.add(
          'send-parent-push-notification',
          {
            ...notification,
            parentId: link.parentId,
          },
          {
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            removeOnComplete: 100,
            removeOnFail: 100,
          },
        );
      }
    }

    this.logger.log(
      `Enqueued notification jobs for ${linkedParents.length} parent(s) for event ${notification.eventId}`,
    );
  }
}
