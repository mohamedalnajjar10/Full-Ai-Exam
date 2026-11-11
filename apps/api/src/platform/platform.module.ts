import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminUsersService } from './admin-users.service';
import { RolesService } from './roles.service';
import { ConversationsService } from './conversations.service';
import { UsageStatsService } from './usage-stats.service';
import { AcademicsService } from './academics.service';
import { AdminOverviewService } from './admin-overview.service';
import { AdminSystemService } from './admin-system.service';
import {
  AdminAcademicsController,
  AdminConversationsController,
  AdminOverviewController,
  AdminRolesController,
  AdminSystemController,
  AdminUsageController,
  AdminUsersController,
} from './platform.controller';

/** قسم «المنصة» بلوحة التحكم: المستخدمون، الأدوار، المحادثات، الاستهلاك، المنهاج، النظرة العامة، إعدادات النظام */
@Module({
  imports: [AuthModule],
  controllers: [
    AdminOverviewController,
    AdminSystemController,
    AdminUsersController,
    AdminRolesController,
    AdminConversationsController,
    AdminUsageController,
    AdminAcademicsController,
  ],
  providers: [
    AdminOverviewService,
    AdminSystemService,
    AdminUsersService,
    RolesService,
    ConversationsService,
    UsageStatsService,
    AcademicsService,
  ],
})
export class PlatformModule {}
