import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermissions,
} from '../common';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { UsageLimitsService } from '../usage/usage-limits.service';
import { AdminUsersService } from './admin-users.service';
import { RolesService } from './roles.service';
import { ConversationsService } from './conversations.service';
import { UsageStatsService } from './usage-stats.service';
import { AcademicsService } from './academics.service';
import { AdminOverviewService } from './admin-overview.service';
import {
  AdminSystemService,
  CatalogModel,
  PromptTemplate,
  TaskRoute,
} from './admin-system.service';
import {
  AuditLogsQueryDto,
  CreateRoleDto,
  FlagConversationDto,
  InviteUserDto,
  ListConversationsDto,
  ListUsersDto,
  RenameBranchDto,
  RoleQuotasDto,
  SaveAiGuardrailsDto,
  SaveAiPromptsDto,
  SaveAiRoutesDto,
  SaveMatrixDto,
  SavePlatformSettingsDto,
  SaveRoleDto,
  SaveUnitsDto,
  SuspendUserDto,
  UpdateUserDto,
  UsageLimitsDto,
} from './dto/platform.dto';

/* ───────── المستخدمون ───────── */

@ApiTags('Admin · Users')
@ApiBearerAuth('access-token')
@RequirePermissions('users.view')
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list(@Query() dto: ListUsersDto) {
    return this.users.list(dto);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="users.csv"')
  @ApiOperation({ summary: '[ADMIN] Users matching the filters as CSV' })
  exportCsv(@Query() dto: ListUsersDto) {
    return this.users.exportCsv(dto);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.users.detail(id);
  }

  @RequirePermissions('users.manage')
  @Post('invite')
  invite(@CurrentUser() actor: AuthenticatedUser, @Body() dto: InviteUserDto) {
    return this.users.invite(actor, dto);
  }

  @RequirePermissions('users.manage')
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }

  @RequirePermissions('users.manage')
  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  suspend(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.users.suspend(actor, id, dto.reason);
  }

  @RequirePermissions('users.manage')
  @Post(':id/unsuspend')
  @HttpCode(HttpStatus.OK)
  unsuspend(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.users.unsuspend(actor, id);
  }

  @RequirePermissions('users.manage')
  @Post(':id/verify-email')
  @HttpCode(HttpStatus.OK)
  verifyEmail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.users.verifyEmail(actor, id);
  }

  @RequirePermissions('users.manage')
  @Post(':id/disable-2fa')
  @HttpCode(HttpStatus.OK)
  disableTwoFactor(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.users.disableTwoFactor(actor, id);
  }

  @RequirePermissions('users.manage')
  @Post(':id/end-sessions')
  @HttpCode(HttpStatus.OK)
  endSessions(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.users.endSessions(actor, id);
  }

  @RequirePermissions('users.manage')
  @Post(':id/password-reset')
  @HttpCode(HttpStatus.OK)
  passwordReset(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.users.sendPasswordReset(actor, id);
  }

  @RequirePermissions('users.manage')
  @Post(':id/reset-quota')
  @HttpCode(HttpStatus.OK)
  resetQuota(@Param('id') id: string) {
    return this.users.resetQuota(id);
  }
}

/* ───────── الأدوار ───────── */

@ApiTags('Admin · Roles')
@ApiBearerAuth('access-token')
@Controller('admin/roles')
export class AdminRolesController {
  constructor(private readonly roles: RolesService) {}

  // صفحة المستخدمين بتحتاج قائمة الأدوار لتغيير الدور والدعوة
  @RequireAnyPermission('roles.manage', 'users.view')
  @Get()
  list() {
    return this.roles.list();
  }

  @RequirePermissions('roles.manage')
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateRoleDto) {
    return this.roles.create(actor, dto);
  }

  @RequirePermissions('roles.manage')
  @Put('matrix')
  saveMatrix(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveMatrixDto,
  ) {
    return this.roles.saveMatrix(actor, dto.roles);
  }

  @RequirePermissions('roles.manage')
  @Put(':id')
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SaveRoleDto,
  ) {
    return this.roles.update(actor, id, dto);
  }

  @RequirePermissions('roles.manage')
  @Delete(':id')
  remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.roles.remove(actor, id);
  }
}

/* ───────── المحادثات ───────── */

@ApiTags('Admin · Conversations')
@ApiBearerAuth('access-token')
@RequirePermissions('chats.view')
@Controller('admin/conversations')
export class AdminConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get('stats')
  stats() {
    return this.conversations.stats();
  }

  @Get()
  list(@Query() dto: ListConversationsDto) {
    return this.conversations.list(dto);
  }

  @Get(':id')
  transcript(@Param('id') id: string) {
    return this.conversations.transcript(id);
  }

  @Put(':id/flag')
  flag(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: FlagConversationDto,
  ) {
    return this.conversations.flag(id, actor.id, dto.flagged, dto.note);
  }
}

/* ───────── الاستهلاك ───────── */

@ApiTags('Admin · Usage')
@ApiBearerAuth('access-token')
@RequirePermissions('billing.view')
@Controller('admin/usage')
export class AdminUsageController {
  constructor(
    private readonly stats: UsageStatsService,
    private readonly limits: UsageLimitsService,
  ) {}

  @Get()
  overview() {
    return this.stats.overview();
  }

  @RequirePermissions('billing.manage')
  @Put('limits')
  saveLimits(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UsageLimitsDto,
  ) {
    return this.limits.save(dto, actor.id);
  }

  @RequirePermissions('billing.manage')
  @Put('role-quotas')
  async saveRoleQuotas(@Body() dto: RoleQuotasDto) {
    await this.stats.saveRoleQuotas(dto.roles);
    return this.stats.overview();
  }
}

/* ───────── الفروع والمواد ───────── */

@ApiTags('Admin · Academics')
@ApiBearerAuth('access-token')
@Controller('admin/academics')
export class AdminAcademicsController {
  constructor(private readonly academics: AcademicsService) {}

  // صفحات المحتوى بتحتاج المواد والوحدات كمان
  @RequireAnyPermission('academics.manage', 'content.upload', 'bank.edit')
  @Get()
  overview() {
    return this.academics.overview();
  }

  @RequirePermissions('academics.manage')
  @Put('subjects/:id/units')
  saveUnits(@Param('id') id: string, @Body() dto: SaveUnitsDto) {
    return this.academics.saveUnits(id, dto.units);
  }

  @RequirePermissions('academics.manage')
  @Patch('branches/:id')
  renameBranch(@Param('id') id: string, @Body() dto: RenameBranchDto) {
    return this.academics.renameBranch(id, dto.name);
  }

  @RequirePermissions('academics.manage')
  @Delete('branches/:id')
  deleteBranch(@Param('id') id: string) {
    return this.academics.deleteBranch(id);
  }
}

/* ───────── نظرة عامة على المنصة ───────── */

@ApiTags('Admin · Overview')
@ApiBearerAuth('access-token')
@RequireAnyPermission(
  'users.view',
  'content.upload',
  'content.review',
  'bank.edit',
  'academics.manage',
  'settings.edit',
)
@Controller('admin/overview')
export class AdminOverviewController {
  constructor(private readonly overviewService: AdminOverviewService) {}

  @Get()
  @ApiOperation({ summary: '[ADMIN] Real-time platform overview & KPIs' })
  getOverview(@Query('range') range?: string) {
    const rangeDays = range === '7' ? 7 : 30;
    return this.overviewService.getOverview(rangeDays);
  }
}

/* ───────── إعدادات النظام والذكاء الاصطناعي والصحة والتدقيق ───────── */

@ApiTags('Admin · System')
@ApiBearerAuth('access-token')
@Controller('admin/system')
export class AdminSystemController {
  constructor(private readonly systemService: AdminSystemService) {}

  @RequireAnyPermission('ai.models', 'settings.edit')
  @Get('ai-config')
  @ApiOperation({ summary: '[ADMIN] Get AI routing, prompts, guardrails, and catalog' })
  getAiConfig() {
    return this.systemService.getAiConfig();
  }

  @RequirePermissions('ai.models')
  @Put('ai-routes')
  @ApiOperation({ summary: '[ADMIN] Update AI task routes' })
  saveAiRoutes(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveAiRoutesDto,
  ) {
    return this.systemService.saveAiRoutes(dto.routes as any, actor.email || actor.id);
  }

  @RequirePermissions('ai.prompts')
  @Put('ai-prompts')
  @ApiOperation({ summary: '[ADMIN] Update AI prompt templates' })
  saveAiPrompts(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveAiPromptsDto,
  ) {
    return this.systemService.saveAiPrompts(dto.prompts as any, actor.email || actor.id);
  }

  @RequireAnyPermission('ai.prompts', 'settings.edit')
  @Put('ai-guardrails')
  @ApiOperation({ summary: '[ADMIN] Update AI guardrails configuration' })
  saveAiGuardrails(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveAiGuardrailsDto,
  ) {
    return this.systemService.saveAiGuardrails(dto as any, actor.email || actor.id);
  }

  @RequirePermissions('settings.edit')
  @Get('settings')
  @ApiOperation({ summary: '[ADMIN] Get platform settings' })
  getPlatformSettings() {
    return this.systemService.getPlatformSettings();
  }

  @RequirePermissions('settings.edit')
  @Put('settings')
  @ApiOperation({ summary: '[ADMIN] Update platform settings' })
  savePlatformSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SavePlatformSettingsDto,
  ) {
    return this.systemService.savePlatformSettings(dto as any, actor.email || actor.id);
  }

  @RequireAnyPermission('settings.edit', 'users.view', 'content.review', 'ai.models')
  @Get('health')
  @ApiOperation({ summary: '[ADMIN] System health diagnostics & queues' })
  getHealthDiagnostics() {
    return this.systemService.getHealthDiagnostics();
  }

  @RequireAnyPermission('audit.view', 'settings.edit', 'users.view')
  @Get('audit')
  @ApiOperation({ summary: '[ADMIN] System audit logs' })
  getAuditLogs(@Query() dto: AuditLogsQueryDto) {
    const rangeDays = dto.range ?? 7;
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 50;
    return this.systemService.getAuditLogs(dto.q, dto.area, rangeDays, page, limit);
  }
}

