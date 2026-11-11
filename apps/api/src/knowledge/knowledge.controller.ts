import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { User } from '@prisma/client';
import type { Response } from 'express';
import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermissions,
  decodeUploadName,
} from '../common';
import { KnowledgeService, MAX_BOOK_BYTES } from './services/knowledge.service';
import { IngestionSettingsService } from './services/ingestion-settings.service';
import { KnowledgeRetrievalService } from './services/knowledge-retrieval.service';
import { IngestionPipelineService } from './services/ingestion-pipeline.service';
import {
  ChunkQueryDto,
  IngestionOptionsDto,
  ListJobsDto,
  PauseDto,
  RechunkDto,
  RetrievalTestDto,
  UploadKnowledgeDto,
} from './dto/knowledge.dto';

/**
 * قاعدة المعرفة: رفع ومعالجة الكتب والامتحانات، ومكتبة المصادر، واختبار
 * الاسترجاع. كله للمشرفين فقط.
 */
@ApiTags('Knowledge Base')
@ApiBearerAuth('access-token')
// المعالجة كلها لمن يرفع المحتوى؛ القراءات يلي بتحتاجها صفحات المراجعة
// والبنك (الوحدات، المكتبة، العدّادات) مفتوحة لهم كمان
@RequirePermissions('content.upload')
@Controller('admin/knowledge')
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly settings: IngestionSettingsService,
    private readonly retrieval: KnowledgeRetrievalService,
    private readonly pipeline: IngestionPipelineService,
  ) {}

  @RequireAnyPermission('content.upload', 'content.review', 'bank.edit')
  @Get('summary')
  @ApiOperation({
    summary: '[ADMIN] Counters for the admin nav and ingestion page',
  })
  summary() {
    return this.knowledge.summary();
  }

  @Get('settings')
  @ApiOperation({ summary: '[ADMIN] Default processing options' })
  getSettings() {
    return this.settings.get();
  }

  @Put('settings')
  @ApiOperation({ summary: '[ADMIN] Save default processing options' })
  saveSettings(@Body() dto: IngestionOptionsDto, @CurrentUser() user: User) {
    return this.settings.save(dto, user.id);
  }

  /* ───────── الرفع والمهام ───────── */

  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_BOOK_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '[ADMIN] Upload a textbook or exam file and start processing',
  })
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadKnowledgeDto,
    @CurrentUser() user: User,
  ) {
    if (!file) throw new BadRequestException('الملف مطلوب.');
    file.originalname = decodeUploadName(file.originalname);
    return this.knowledge.upload(file, dto, user.id);
  }

  @Get('jobs')
  listJobs(@Query() q: ListJobsDto) {
    return this.knowledge.listJobs(q);
  }

  @Get('jobs/:id')
  getJob(@Param('id') id: string) {
    return this.knowledge.getJob(id);
  }

  @Get('jobs/:id/chunks')
  jobChunks(@Param('id') id: string) {
    return this.knowledge.jobChunks(id);
  }

  @Post('jobs/:id/retry')
  retry(@Param('id') id: string) {
    return this.knowledge.retry(id);
  }

  @Post('jobs/:id/rechunk')
  rechunk(
    @Param('id') id: string,
    @Body() dto: RechunkDto,
    @CurrentUser() user: User,
  ) {
    return this.knowledge.rechunk(id, dto.options, user.id);
  }

  @Post('jobs/:id/reembed')
  reembed(@Param('id') id: string) {
    return this.knowledge.reembed(id);
  }

  @Delete('jobs/:id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.knowledge.remove(id);
  }

  @Get('jobs/:id/file')
  @ApiOperation({ summary: '[ADMIN] Download the original file' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const { doc, buffer } = await this.knowledge.fileBuffer(id);
    const encoded = encodeURIComponent(doc.originalName);
    res.set({
      'Content-Type': doc.mimeType,
      'Content-Disposition': `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`,
      'Content-Length': buffer.length.toString(),
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  }

  @Put('queues')
  @ApiOperation({ summary: '[ADMIN] Pause or resume the processing queues' })
  setPaused(@Body() dto: PauseDto) {
    return this.knowledge.setPaused(dto.paused);
  }

  /* ───────── المكتبة ───────── */

  @RequireAnyPermission('content.upload', 'content.review', 'bank.edit')
  @Get('library/subjects')
  librarySubjects() {
    return this.knowledge.librarySubjects();
  }

  @RequireAnyPermission('content.upload', 'content.review', 'bank.edit')
  @Get('library/subjects/:id/chunks')
  subjectChunks(@Param('id') id: string, @Query() q: ChunkQueryDto) {
    return this.knowledge.subjectChunks(id, q);
  }

  @RequireAnyPermission('content.upload', 'content.review', 'bank.edit')
  @Get('library/subjects/:id/units')
  subjectUnits(@Param('id') id: string) {
    return this.pipeline.subjectUnits(id);
  }

  @Post('library/subjects/:id/reembed')
  reembedSubject(@Param('id') id: string) {
    return this.knowledge.reembedSubject(id);
  }

  @Delete('library/subjects/:id/books')
  @HttpCode(HttpStatus.OK)
  removeSubjectBooks(@Param('id') id: string) {
    return this.knowledge.removeSubjectBooks(id);
  }

  @RequireAnyPermission('content.upload', 'content.review', 'bank.edit')
  @Get('library/exams')
  examFiles(@Query('branch') branch?: string, @Query('q') q?: string) {
    return this.knowledge.examFiles({ branch, q });
  }

  /* ───────── الاسترجاع ───────── */

  @RequireAnyPermission('ai.retrieval', 'content.upload')
  @Post('search')
  @ApiOperation({
    summary: '[ADMIN] Hybrid retrieval over textbook chunks (for testing RAG)',
  })
  search(@Body() dto: RetrievalTestDto) {
    return this.retrieval.search(dto);
  }
}
