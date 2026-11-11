import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
  MessageEvent,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, Roles, Throttle, ThrottleGuard } from '../common';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { CreateParentLinkDto } from './dto/create-parent-link.dto';
import {
  ParentLinkingService,
  ParentLinkResponse,
} from './services/parent-linking.service';
import { ParentRealtimeService } from './services/parent-realtime.service';

@ApiTags('Parent Dashboard')
@ApiBearerAuth('access-token')
@Controller('parent')
export class ParentController {
  constructor(
    private readonly parentLinkingService: ParentLinkingService,
    private readonly parentRealtimeService: ParentRealtimeService,
  ) {}

  @Roles(Role.STUDENT)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('links')
  @ApiOperation({
    summary:
      'Generate a new parent linkage invitation with PIN, Magic Link, and QR code',
    description:
      'Creates or links a parent account to the authenticated student, issuing a 6-digit family PIN, 32-byte magic token, and ready-to-use WhatsApp sharing link.',
  })
  @ApiResponse({
    status: 201,
    description: 'Parent link credentials generated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or student attempting to link themselves',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only students can create parent links',
  })
  @ApiResponse({
    status: 409,
    description:
      'Phone number already associated with another non-parent account',
  })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  @HttpCode(HttpStatus.CREATED)
  async createLink(
    @CurrentUser() student: AuthenticatedUser,
    @Body() dto: CreateParentLinkDto,
  ): Promise<ParentLinkResponse> {
    return this.parentLinkingService.createLink(student.id, dto);
  }

  @Roles(Role.PARENT)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('link/pin')
  @ApiOperation({
    summary: 'Link a student to the authenticated parent using a 6-digit PIN',
    description:
      'Activates a pending link using the 6-digit PIN generated from the student account.',
  })
  @ApiResponse({ status: 200, description: 'Student linked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired PIN' })
  async linkByPin(
    @CurrentUser() parent: AuthenticatedUser,
    @Body('pin') pin: string,
  ) {
    return this.parentLinkingService.linkStudentByPin(parent.id, pin);
  }

  @Roles(Role.PARENT)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post('link/qr')
  @ApiOperation({
    summary: 'Link a student to the authenticated parent by scanning QR token',
    description:
      'Activates a pending link by scanning the QR code payload generated from the student account.',
  })
  @ApiResponse({ status: 200, description: 'Student linked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired QR token' })
  async linkByQr(
    @CurrentUser() parent: AuthenticatedUser,
    @Body('token') token: string,
  ) {
    return this.parentLinkingService.linkStudentByQr(parent.id, token);
  }

  @Roles(Role.PARENT)
  @Get('me')
  @ApiOperation({
    summary: 'Get authenticated parent profile',
    description:
      'Returns profile of the authenticated parent from parent session cookies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Parent profile retrieved successfully',
  })
  async getProfile(@CurrentUser() parent: AuthenticatedUser) {
    return {
      id: parent.id,
      name: parent.name,
      email: parent.email,
      role: parent.role,
      avatar: parent.avatar,
    };
  }

  @Roles(Role.PARENT)
  @Get('children')
  @ApiOperation({
    summary: 'Get all active linked children for the authenticated parent',
    description:
      'Returns a list of students actively linked to this parent, including live overview metrics (completed assessments, average score, branch, last activity).',
  })
  @ApiResponse({
    status: 200,
    description: 'Linked children retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only parents can access this endpoint',
  })
  async getLinkedChildren(@CurrentUser() parent: AuthenticatedUser) {
    return this.parentLinkingService.getLinkedChildren(parent.id);
  }

  @Roles(Role.PARENT)
  @Get('children/:studentId/overview')
  @ApiOperation({
    summary:
      'Get AI recommendation, subject capabilities map, and notifications for child',
    description:
      'Returns student capabilities across Bloom taxonomy levels, real-time AI pedagogical recommendation, and instant alerts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Child insights retrieved successfully',
  })
  async getChildOverview(
    @CurrentUser() parent: AuthenticatedUser,
    @Param('studentId') studentId: string,
  ) {
    return this.parentLinkingService.getChildOverview(parent.id, studentId);
  }

  @Roles(Role.PARENT)
  @Get('children/:studentId/timeline')
  @ApiOperation({
    summary: 'Get paginated activity timeline for a linked student',
    description:
      'Returns student activity events (assessments, question generation, chat activity) ordered by date descending. Requires an ACTIVE parent-student link.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiQuery({ name: 'eventType', required: false, type: String })
  @ApiResponse({
    status: 200,
    description: 'Student activity timeline retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description:
      'Forbidden - not authorized or parent-student link is inactive',
  })
  async getChildTimeline(
    @CurrentUser() parent: AuthenticatedUser,
    @Param('studentId') studentId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('eventType') eventType?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    return this.parentLinkingService.getChildTimeline(parent.id, studentId, {
      page: isNaN(pageNum) ? 1 : pageNum,
      limit: isNaN(limitNum) ? 20 : limitNum,
      eventType,
    });
  }

  @Roles(Role.PARENT)
  @Sse('stream')
  @ApiOperation({
    summary: 'Real-time Server-Sent Events (SSE) stream for parent dashboard',
    description:
      'Pushes live student activity events (quiz completions, assessment milestones, score improvements) instantly to the parent dashboard.',
  })
  async streamLiveStudentActivity(
    @CurrentUser() parent: AuthenticatedUser,
    @Query('studentId') studentId?: string,
  ): Promise<Observable<MessageEvent>> {
    return this.parentRealtimeService.createParentStudentStream(
      parent.id,
      studentId,
    );
  }
}
