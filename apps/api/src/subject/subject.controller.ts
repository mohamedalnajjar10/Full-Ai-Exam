import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { SubjectService } from './subject.service';
import {
  CurrentUser,
  Public,
  RequirePermissions,
  RequireAnyPermission,
  Throttle,
  ThrottleGuard,
  decodeUploadName,
} from '../common';
import type { User } from '@prisma/client';
import { CreateSubjectDto, UpdateSubjectDto, SubjectQueryDto } from './dto';

@ApiTags('Subjects')
@Controller('subjects')
export class SubjectController {
  constructor(private subjectService: SubjectService) {}

  // ── Public / Student Queries ───────────────────────────────

  @ApiBearerAuth('access-token')
  @Get()
  @ApiOperation({ summary: "Get subjects for the current user's branch" })
  @ApiResponse({
    status: 200,
    description: 'List of subjects for the selected branch',
  })
  @ApiResponse({ status: 404, description: 'User has no branch selected' })
  async getMySubjects(@CurrentUser() user: User) {
    return this.subjectService.getByUserBranch(user.id);
  }

  @Public()
  @Get('all')
  @ApiOperation({
    summary: 'Get all subjects with optional filtering and search',
    description: 'Filter by branchId and/or search by subject name.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of subjects with branch and relation counts',
  })
  async findAll(@Query() query: SubjectQueryDto) {
    return this.subjectService.findAll(query);
  }

  @Public()
  @Get('branch/:branchId')
  @ApiOperation({ summary: 'Get subjects by branch ID (public)' })
  @ApiParam({ name: 'branchId', description: 'Branch CUID' })
  @ApiResponse({
    status: 200,
    description: 'List of subjects for the branch',
  })
  @ApiResponse({ status: 400, description: 'Invalid branch ID format' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async getByBranch(@Param('branchId') branchId: string) {
    return this.subjectService.getByBranch(branchId);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get subject details by ID (public)' })
  @ApiParam({ name: 'id', description: 'Subject CUID' })
  @ApiResponse({
    status: 200,
    description: 'Subject details with branch, teachers, and relation counts',
  })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  async findOne(@Param('id') id: string) {
    return this.subjectService.findOne(id);
  }

  // ── Admin Management Endpoints ─────────────────────────────

  @RequirePermissions('academics.manage')
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN] Create a new subject',
    description: 'Creates a new subject within a specific branch.',
  })
  @ApiResponse({ status: 201, description: 'Subject created successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  @ApiResponse({ status: 409, description: 'Subject already exists in branch' })
  async create(@Body() dto: CreateSubjectDto) {
    return this.subjectService.create(dto);
  }

  @RequirePermissions('academics.manage')
  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN] Update a subject',
    description: "Updates a subject's name and/or branchId.",
  })
  @ApiParam({ name: 'id', description: 'Subject CUID' })
  @ApiResponse({ status: 200, description: 'Subject updated successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 404, description: 'Subject or Branch not found' })
  @ApiResponse({ status: 409, description: 'Subject name collision in branch' })
  async update(@Param('id') id: string, @Body() dto: UpdateSubjectDto) {
    return this.subjectService.update(id, dto);
  }

  @RequirePermissions('academics.manage')
  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN] Delete a subject',
    description:
      'Deletes a subject and cleans up its book PDF from S3 storage.',
  })
  @ApiParam({ name: 'id', description: 'Subject CUID' })
  @ApiResponse({ status: 200, description: 'Subject deleted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete subject with related data',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  async remove(@Param('id') id: string) {
    return this.subjectService.remove(id);
  }

  // ── Book PDF Endpoints ───────────────────────────────────────

  @RequireAnyPermission('academics.manage', 'content.upload')
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 10, windowMs: 60_000 })
  @Post(':id/book')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN] Upload or replace the PDF book for a subject',
    description:
      'Accepts PDF files up to 50 MB. Replaces the existing book if one is already uploaded.',
  })
  @ApiParam({ name: 'id', description: 'Subject CUID' })
  @ApiResponse({ status: 200, description: 'Book PDF uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  @ApiResponse({ status: 404, description: 'Subject not found' })
  async uploadBook(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 }), // 50 MB
          new FileTypeValidator({ fileType: /(pdf)/i }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    file.originalname = decodeUploadName(file.originalname);
    return this.subjectService.uploadBookPdf(id, file, user?.id);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, windowMs: 60_000 })
  @Get(':id/book/download')
  @ApiOperation({
    summary: 'Download or stream the PDF book for a subject',
    description:
      'Streams the PDF directly through the API server or returns a presigned URL. Accessible to authenticated users.',
  })
  @ApiParam({ name: 'id', description: 'Subject CUID' })
  @ApiResponse({
    status: 200,
    description: 'PDF file stream or presigned download URL',
  })
  @ApiResponse({ status: 404, description: 'Subject or book not found' })
  async downloadBook(
    @Param('id') id: string,
    @Query('mode') mode: string | undefined,
    @Query('disposition') disposition: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (mode === 'url') {
      const urlInfo = await this.subjectService.getBookDownloadUrl(id);
      return res.json(urlInfo);
    }
    return this.sendBookFile(id, disposition, req, res);
  }

  @ApiBearerAuth('access-token')
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 30, windowMs: 60_000 })
  @Get(':id/book/file')
  @ApiOperation({
    summary:
      'Download the PDF book directly through the backend (proxy stream)',
    description:
      'Streams the PDF directly through the API server. Defaults to inline disposition to prevent external download managers (IDM/FDM) from hijacking browser fetch streams.',
  })
  @ApiParam({ name: 'id', description: 'Subject CUID' })
  @ApiResponse({ status: 200, description: 'PDF file stream' })
  @ApiResponse({ status: 404, description: 'Subject or book not found' })
  async streamBookFile(
    @Param('id') id: string,
    @Query('disposition') disposition: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.sendBookFile(id, disposition, req, res);
  }

  private async sendBookFile(
    id: string,
    disposition: string | undefined,
    req: Request,
    res: Response,
  ) {
    if (typeof (this.subjectService as any).getBookFileStream === 'function') {
      const file = await this.subjectService.getBookFileStream(id);
      const originalName = decodeUploadName(file.originalName);
      const asciiFallback = originalName.replace(/[^\x20-\x7E]/g, '_');
      const encodedName = encodeURIComponent(originalName);
      const disp = disposition === 'attachment' ? 'attachment' : 'inline';
      const acceptsOctet = req.headers['accept']?.includes(
        'application/octet-stream',
      );
      const contentType = acceptsOctet
        ? 'application/octet-stream'
        : 'application/pdf';

      res.setHeader('Content-Type', contentType);
      res.setHeader(
        'Content-Disposition',
        `${disp}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
      );
      if (file.fileSize) {
        res.setHeader('Content-Length', file.fileSize.toString());
      }
      res.setHeader(
        'Cache-Control',
        'private, no-cache, no-store, must-revalidate',
      );
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      file.stream.on('error', () => {
        if (!res.headersSent) {
          res.status(500).end();
        } else {
          res.end();
        }
      });

      return file.stream.pipe(res);
    }

    const file = await this.subjectService.getBookFile(id);
    const originalName = decodeUploadName(file.originalName);
    const asciiFallback = originalName.replace(/[^\x20-\x7E]/g, '_');
    const encodedName = encodeURIComponent(originalName);
    const disp = disposition === 'attachment' ? 'attachment' : 'inline';
    const acceptsOctet = req.headers['accept']?.includes(
      'application/octet-stream',
    );
    const contentType = acceptsOctet
      ? 'application/octet-stream'
      : 'application/pdf';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${disp}; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
    );
    res.setHeader('Content-Length', file.buffer.length.toString());
    res.setHeader(
      'Cache-Control',
      'private, no-cache, no-store, must-revalidate',
    );
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.end(file.buffer);
  }

  @RequireAnyPermission('academics.manage', 'content.upload')
  @Delete(':id/book')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '[ADMIN] Delete the PDF book for a subject' })
  @ApiParam({ name: 'id', description: 'Subject CUID' })
  @ApiResponse({ status: 200, description: 'Book PDF deleted successfully' })
  @ApiResponse({ status: 404, description: 'Subject or book not found' })
  async deleteBook(@Param('id') id: string) {
    return this.subjectService.deleteBookPdf(id);
  }
}
