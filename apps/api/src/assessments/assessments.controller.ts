import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { GenerationRateLimitGuard } from '../questions/guards/generation-rate-limit.guard';
import { QuotaRefundInterceptor } from '../questions/interceptors/quota-refund.interceptor';
import { AssessmentsService } from './assessments.service';
import {
  GenerateAssessmentDto,
  SubmitAssessmentDto,
  AssessmentHistoryQueryDto,
} from './dto';

@ApiTags('Assessments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.STUDENT)
@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessmentsService: AssessmentsService) {}

  /**
   * 1. POST /api/v1/assessments/generate
   * Generates a 10-question capability assessment via AI and creates a PENDING attempt.
   */
  @Post('generate')
  @UseGuards(GenerationRateLimitGuard)
  @UseInterceptors(QuotaRefundInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Generate a student capability assessment test (10 Bloom questions)',
    description:
      'Uses AI to generate 10 questions covering various Bloom Taxonomy cognitive levels, creates a PENDING assessment attempt, and redacts correct answers and explanations.',
  })
  @ApiResponse({
    status: 201,
    description:
      'Assessment generated successfully (answers and explanations redacted)',
  })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  @ApiResponse({
    status: 429,
    description: 'Daily AI generation quota exceeded',
  })
  async generate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GenerateAssessmentDto,
  ) {
    return this.assessmentsService.generateAssessment(user.id, dto);
  }

  /**
   * 4. GET /api/v1/assessments/history
   * Retrieves a paginated list of all past assessments taken by the student.
   */
  @Get('history')
  @ApiOperation({
    summary: 'Get student assessment history',
    description:
      'Retrieves a paginated list of all assessment attempts for the authenticated student, including scores, status, and dates.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of assessment attempts retrieved successfully',
  })
  async getHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AssessmentHistoryQueryDto,
  ) {
    return this.assessmentsService.getHistory(user.id, query);
  }

  /**
   * 2. GET /api/v1/assessments/attempts/:id
   * Retrieves details of a past or ongoing assessment attempt, including questions.
   */
  @Get('attempts/:id')
  @ApiOperation({
    summary: 'Get assessment attempt details',
    description:
      'Retrieves details of an ongoing or completed assessment attempt. Ongoing (PENDING) attempts exclude correct answers; COMPLETED attempts include scores, full answers, and AI feedback.',
  })
  @ApiParam({ name: 'id', description: 'Assessment attempt ID' })
  @ApiResponse({
    status: 200,
    description: 'Attempt details retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Attempt belongs to another student',
  })
  @ApiResponse({ status: 404, description: 'Assessment attempt not found' })
  async getAttempt(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.assessmentsService.getAttempt(user.id, id);
  }

  /**
   * 3. POST /api/v1/assessments/attempts/:id/submit
   * Submits student answers, calculates score, generates diagnostic AI feedback, and marks attempt as COMPLETED.
   */
  @Post('attempts/:id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit answers for an assessment attempt',
    description:
      'Calculates score, analyzes incorrect answers across Bloom Taxonomy levels, invokes AI for diagnostic feedback (strengths, weaknesses, and study plan), and finalizes attempt status.',
  })
  @ApiParam({ name: 'id', description: 'Assessment attempt ID' })
  @ApiResponse({
    status: 200,
    description:
      'Assessment submitted successfully with score, correct answers, and AI feedback',
  })
  @ApiResponse({
    status: 400,
    description: 'Assessment attempt has already been submitted',
  })
  @ApiResponse({
    status: 403,
    description: 'Attempt belongs to another student',
  })
  @ApiResponse({ status: 404, description: 'Assessment attempt not found' })
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SubmitAssessmentDto,
  ) {
    return this.assessmentsService.submitAssessment(user.id, id, dto);
  }
}
