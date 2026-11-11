import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  BadRequestException,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import {
  CurrentUser,
  RequireAnyPermission,
  RequirePermissions,
} from '../../common';
import type { User } from '@prisma/client';
import { ExamBankService } from '../services/exam-bank.service';
import { HybridSearchService } from '../services/hybrid-search.service';
import {
  UploadExamDto,
  HybridSearchDto,
  UpdateBankQuestionDto,
  BankListDto,
  CreateBankQuestionDto,
  BulkBankActionDto,
  ImportCsvDto,
} from '../dto';

@ApiTags('Exam Bank')
@ApiBearerAuth('access-token')
@Controller('admin/exam-bank')
export class ExamBankController {
  constructor(
    private readonly examBankService: ExamBankService,
    private readonly hybridSearchService: HybridSearchService,
  ) {}

  // ── US-10: Upload ─────────────────────────────────────────

  @RequirePermissions('content.upload')
  @Post('upload')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '[ADMIN] Upload an exam PDF or image for AI extraction',
    description:
      'Accepts PDF and image files (JPEG, PNG, WebP, GIF) up to 50 MB.',
  })
  @ApiResponse({ status: 201, description: 'File uploaded, extraction queued' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async upload(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /(pdf|jpeg|jpg|png|webp|gif|octet-stream)/i,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: UploadExamDto,
    @CurrentUser() user: User,
  ) {
    return this.examBankService.uploadAndEnqueue(file, dto, user.id);
  }

  // ── US-10: Exam File Status ───────────────────────────────

  @RequireAnyPermission('content.upload', 'content.review')
  @Get('files')
  @ApiOperation({ summary: '[ADMIN] List uploaded exam files' })
  async listFiles(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.examBankService.listExamFiles(
      status,
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 20,
    );
  }

  @RequireAnyPermission('content.upload', 'content.review')
  @Get('files/:id')
  @ApiOperation({
    summary: '[ADMIN] Get exam file details with staged questions',
  })
  async getFile(@Param('id') id: string) {
    return this.examBankService.getExamFile(id);
  }

  // ── US-13: Hybrid Search ──────────────────────────────────

  @RequireAnyPermission('bank.edit', 'bank.delete', 'content.review')
  @Get('search')
  @ApiOperation({
    summary: '[ADMIN] Hybrid search (semantic + keyword + filters)',
  })
  @ApiResponse({ status: 200, description: 'RRF-fused search results' })
  async search(@Query() dto: HybridSearchDto) {
    return this.hybridSearchService.search(dto);
  }

  // ── Question bank (admin dashboard) ───────────────────────

  @RequireAnyPermission('bank.edit', 'bank.delete', 'content.review')
  @Get('questions')
  @ApiOperation({
    summary: '[ADMIN] List bank questions with filters and text search',
  })
  async listQuestions(@Query() q: BankListDto) {
    return this.examBankService.listBank(q);
  }

  @RequireAnyPermission('bank.edit', 'bank.delete', 'content.review')
  @Get('stats')
  @ApiOperation({ summary: '[ADMIN] Bank totals by embedding status' })
  async stats() {
    return this.examBankService.bankStats();
  }

  @RequirePermissions('bank.edit')
  @Post('questions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '[ADMIN] Add a question to the bank manually' })
  async createQuestion(@Body() dto: CreateBankQuestionDto) {
    return this.examBankService.createBankQuestion(dto);
  }

  @RequirePermissions('bank.edit')
  @Post('questions/bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[ADMIN] Re-embed, change difficulty or delete several questions',
  })
  async bulk(
    @Body() dto: BulkBankActionDto,
    @CurrentUser() user: { permissions?: string[] },
  ) {
    // نفس الـ endpoint بيحذف كمان — الحذف إله صلاحيته الخاصة
    if (dto.action === 'delete' && !user.permissions?.includes('bank.delete')) {
      throw new ForbiddenException('ليس لديك صلاحية الحذف من البنك.');
    }
    return this.examBankService.bulk(dto);
  }

  @RequireAnyPermission('bank.edit', 'bank.delete', 'content.review')
  @Get('export')
  @ApiOperation({
    summary: '[ADMIN] Export bank questions as CSV (same filters as the list)',
  })
  async exportCsv(@Query() q: BankListDto, @Res() res: Response) {
    const csv = await this.examBankService.exportCsv(q);
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="question-bank.csv"',
      'Cache-Control': 'private, no-store',
    });
    res.send(csv);
  }

  @RequirePermissions('bank.edit')
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '[ADMIN] Import bank questions from CSV into one subject',
  })
  async importCsv(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: ImportCsvDto,
  ) {
    if (!file) throw new BadRequestException('CSV file is required');
    return this.examBankService.importCsv(
      dto.subjectId,
      file.buffer.toString('utf8'),
    );
  }

  @RequireAnyPermission('bank.edit', 'bank.delete', 'content.review')
  @Get('questions/:id/similar')
  @ApiOperation({ summary: '[ADMIN] Nearest bank questions by embedding' })
  async similar(@Param('id') id: string) {
    return this.examBankService.similarQuestions(id);
  }

  // ── US-13: Question CRUD ──────────────────────────────────

  @RequireAnyPermission('bank.edit', 'bank.delete', 'content.review')
  @Get('questions/:id')
  @ApiOperation({ summary: '[ADMIN] Get a published exam bank question' })
  async getQuestion(@Param('id') id: string) {
    return this.examBankService.getBankQuestion(id);
  }

  @RequirePermissions('bank.edit')
  @Patch('questions/:id')
  @ApiOperation({
    summary: '[ADMIN] Update a published question (triggers re-indexing)',
  })
  async updateQuestion(
    @Param('id') id: string,
    @Body() dto: UpdateBankQuestionDto,
  ) {
    return this.examBankService.updateBankQuestion(
      id,
      dto as Record<string, unknown>,
    );
  }

  @RequirePermissions('bank.delete')
  @Delete('questions/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[ADMIN] Soft-delete a published question' })
  async deleteQuestion(@Param('id') id: string) {
    return this.examBankService.softDeleteBankQuestion(id);
  }
}
