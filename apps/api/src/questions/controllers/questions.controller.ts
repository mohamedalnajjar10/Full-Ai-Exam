import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { CurrentUser, Roles, Throttle, ThrottleGuard } from '../../common';
import { Role, type User } from '@prisma/client';
import { GenerationRateLimitGuard } from '../guards/generation-rate-limit.guard';
import { QuotaRefundInterceptor } from '../interceptors/quota-refund.interceptor';
import { QuestionGenerationService } from '../services/question-generation.service';
import { StyleUploadService } from '../services/style-upload.service';
import { StyleGenerationService } from '../services/style-generation.service';
import { GenerateQuestionsDto } from '../dto/generate-questions.dto';
import { GenerateFromStyleDto } from '../dto/generate-from-style.dto';
import { SubmitQuizAttemptDto } from '../dto/submit-quiz-attempt.dto';
import { QuotaService } from '../../usage/quota.service';
import { UsageLimitsService } from '../../usage/usage-limits.service';

@ApiTags('Questions')
@ApiBearerAuth('access-token')
// JwtAuthGuard مسجّل عالمياً كـ APP_GUARD بـ common.module.ts —
// تكراره هون كان بيخلّي JwtStrategy.validate تنفّذ مرتين لكل طلب.
@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly questionGenerationService: QuestionGenerationService,
    private readonly styleUploadService: StyleUploadService,
    private readonly styleGenerationService: StyleGenerationService,
    private readonly quota: QuotaService,
    private readonly usageLimits: UsageLimitsService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // US-14: Bank RAG Generation
  // ─────────────────────────────────────────────────────────────────────────

  @Post('generate')
  @UseGuards(GenerationRateLimitGuard)
  @UseInterceptors(QuotaRefundInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate AI questions via Hybrid RAG (US-14)',
    description:
      'Generates new practice questions using pgvector semantic retrieval from the exam bank and Google Gemini 2.5 Flash with structured JSON output and self-healing retry.',
  })
  @ApiResponse({ status: 201, description: 'Questions generated successfully' })
  @ApiResponse({ status: 429, description: 'Daily generation quota exceeded' })
  @ApiResponse({ status: 502, description: 'Gemini upstream error' })
  async generate(@CurrentUser() user: User, @Body() dto: GenerateQuestionsDto) {
    const studentId = user.id;
    const questions = await this.questionGenerationService.generateFromBank(
      studentId,
      { ...dto, count: await this.capCount(dto.count) },
    );

    return {
      success: true,
      count: questions.length,
      sourceType: 'BANK_RAG',
      questions,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // US-Interactive Quiz: Submit Attempt or Retake for Parent Real-Time Sync
  // ─────────────────────────────────────────────────────────────────────────

  @Post('submit-quiz-attempt')
  @Roles(Role.STUDENT)
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 15, windowMs: 60_000 })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit interactive quiz attempt or retake',
    description:
      'Records quiz attempt results in student activity events, notifies linked parents, and triggers live dashboard updates.',
  })
  @ApiResponse({
    status: 200,
    description: 'Quiz attempt recorded successfully',
  })
  async submitQuizAttempt(
    @CurrentUser() user: User,
    @Body() dto: SubmitQuizAttemptDto,
  ) {
    return this.questionGenerationService.submitQuizAttempt(user.id, dto);
  }

  @Get('quiz-attempts')
  @Roles(Role.STUDENT)
  @ApiOperation({
    summary: 'Get student historical quiz attempts for cross-device synchronization',
  })
  @ApiResponse({ status: 200, description: 'List of past quiz attempts' })
  async getQuizAttempts(@CurrentUser() user: User) {
    return this.questionGenerationService.getQuizAttempts(user.id);
  }

  @Get('daily-plan')
  @Roles(Role.STUDENT)
  @ApiOperation({
    summary: 'Get student daily plan state for cross-device synchronization',
  })
  @ApiResponse({ status: 200, description: 'Current daily plan state' })
  async getDailyPlan(@CurrentUser() user: User) {
    return this.questionGenerationService.getDailyPlan(user.id);
  }

  @Put('daily-plan')
  @Roles(Role.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Save/sync student daily plan state across devices',
  })
  @ApiResponse({
    status: 200,
    description: 'Daily plan state synced successfully',
  })
  async saveDailyPlan(
    @CurrentUser() user: User,
    @Body() planData: Record<string, any>,
  ) {
    return this.questionGenerationService.saveDailyPlan(user.id, planData);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // US-15: Style-Source Upload
  // ─────────────────────────────────────────────────────────────────────────

  @Post('upload-style-source')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'PDF or image file (≤ 15 MB)',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload a question sheet for style analysis (US-15)',
    description:
      'Accepts a PDF/image file, stores it in S3 with 24h lifecycle, and dispatches an async BullMQ job to extract the style blueprint via Gemini multimodal.',
  })
  @ApiResponse({ status: 202, description: 'File accepted for processing' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async uploadStyleSource(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const studentId = user.id;
    const result = await this.styleUploadService.uploadAndEnqueue(
      studentId,
      file,
    );

    return {
      success: true,
      message:
        'File accepted. Style extraction is processing asynchronously. Poll the status endpoint to check completion.',
      uploadId: result.uploadId,
      status: result.status,
    };
  }

  @Get('upload-style-source/:id/status')
  @ApiOperation({
    summary: 'Poll style upload extraction status (US-15)',
    description:
      'Returns the current processing status. Returns 422 if extraction failed.',
  })
  @ApiResponse({ status: 200, description: 'Status retrieved' })
  @ApiResponse({ status: 422, description: 'Extraction failed' })
  async getUploadStatus(
    @CurrentUser() user: User,
    @Param('id') uploadId: string,
  ) {
    return this.styleUploadService.getUploadStatus(uploadId, user.id);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // US-16: Style-Matched Generation
  // ─────────────────────────────────────────────────────────────────────────

  @Post('generate-from-style')
  @UseGuards(GenerationRateLimitGuard)
  @UseInterceptors(QuotaRefundInterceptor)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate style-matched questions grounded in curriculum (US-16)',
    description:
      'Synthesizes questions that emulate the style from an uploaded sheet while being grounded in official exam bank content. Records UPLOAD_STYLE_MATCH source type with full lineage metadata.',
  })
  @ApiResponse({
    status: 201,
    description: 'Style-matched questions generated',
  })
  @ApiResponse({ status: 400, description: 'Style upload not ready' })
  @ApiResponse({ status: 429, description: 'Daily quota exceeded' })
  async generateFromStyle(
    @CurrentUser() user: User,
    @Body() dto: GenerateFromStyleDto,
  ) {
    const studentId = user.id;
    const questions = await this.styleGenerationService.generateFromStyle(
      studentId,
      { ...dto, count: await this.capCount(dto.count) },
    );

    return {
      success: true,
      count: questions.length,
      sourceType: 'UPLOAD_STYLE_MATCH',
      styleUploadId: dto.styleUploadId,
      questions,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // US-17: Quota Status Endpoint
  // ─────────────────────────────────────────────────────────────────────────

  @Get('quota')
  @ApiOperation({
    summary: 'Get remaining daily generation quota (US-17)',
    description:
      'Returns the current daily quota consumption, remaining requests, and UTC reset timestamp.',
  })
  @ApiResponse({ status: 200, description: 'Quota info returned' })
  async getQuota(@CurrentUser() user: User) {
    const studentId = user.id;
    const { limit, used, resetAt } = await this.quota.status(studentId);
    return {
      quotaLimit: limit,
      used,
      remaining: limit === null ? null : Math.max(0, limit - used),
      resetAt,
    };
  }

  /** سقف «أقصى عدد أسئلة في الطلب الواحد» من لوحة التحكم (الـ DTO بيقبل حتى 20) */
  private async capCount(count: number): Promise<number> {
    const { perRequestMax } = await this.usageLimits.get();
    return Math.max(1, Math.min(count, perRequestMax));
  }
}
