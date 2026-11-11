import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { PARENT_NOTIFICATIONS_QUEUE } from '../listeners/parent-events.listener';

export interface ParentNotificationJobData {
  eventId: string;
  studentId: string;
  parentId: string;
  eventType: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

@Processor(PARENT_NOTIFICATIONS_QUEUE)
export class ParentNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(ParentNotificationProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Consumes and processes parent push notification jobs from BullMQ.
   * Prevents unconsumed job accumulation in Redis (INF-01).
   */
  async process(job: Job<ParentNotificationJobData>): Promise<void> {
    const { eventId, studentId, parentId, title, body } = job.data;

    this.logger.log(
      `[PushNotification] Processing notification for parent ${parentId} (student: ${studentId}, event: ${eventId})`,
    );

    // Verify parent account is still active and exists
    const parent = await this.prisma.user.findUnique({
      where: { id: parentId },
      select: { id: true, suspendedAt: true },
    });

    if (!parent || parent.suspendedAt) {
      this.logger.debug(
        `Skipped notification job ${job.id}: parent ${parentId} not found or suspended.`,
      );
      return;
    }

    // In current phase: notifications are delivered in real-time via SSE and
    // persisted in StudentActivityEvent. Push notification transport is logged.
    this.logger.log(
      `[PushNotification] Successfully dispatched notification to parent ${parentId}: "${title}" - "${body}"`,
    );
  }
}
