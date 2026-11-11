import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { QUEUES_ENABLED } from '../common/queues';
import { ParentController } from './parent.controller';
import { ParentLinkingService } from './services/parent-linking.service';
import { ParentRealtimeService } from './services/parent-realtime.service';
import {
  ParentEventsListener,
  PARENT_NOTIFICATIONS_QUEUE,
} from './listeners/parent-events.listener';
import { ParentNotificationProcessor } from './processors/parent-notification.processor';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    ...(QUEUES_ENABLED
      ? [BullModule.registerQueue({ name: PARENT_NOTIFICATIONS_QUEUE })]
      : []),
  ],
  controllers: [ParentController],
  providers: [
    ParentLinkingService,
    ParentRealtimeService,
    ParentEventsListener,
    ...(QUEUES_ENABLED ? [ParentNotificationProcessor] : []),
  ],
  exports: [ParentLinkingService, ParentRealtimeService],
})
export class ParentModule {}
