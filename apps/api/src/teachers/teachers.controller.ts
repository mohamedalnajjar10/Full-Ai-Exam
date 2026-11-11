import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiParam,
} from '@nestjs/swagger';
import { TeachersService } from './teachers.service';
import { Public, RequirePermissions } from '../common';
import {
  CreateTeacherDto,
  UpdateTeacherDto,
  TeacherQueryDto,
  ReorderTeachersDto,
} from './dto';

@ApiTags('Teachers')
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachersService: TeachersService) {}

  // ── Public Showcase Endpoints ──────────────────────────────

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Get list of teachers ("نخبة المعلمين")',
    description:
      'Returns paginated list of teachers with filtering by subject, search query, active status, and custom ordering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of teachers',
  })
  async findAll(@Query() query: TeacherQueryDto) {
    return this.teachersService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get teacher details by ID' })
  @ApiParam({ name: 'id', description: 'Teacher CUID' })
  @ApiResponse({
    status: 200,
    description: 'Teacher details with associated subject',
  })
  @ApiResponse({
    status: 404,
    description: 'Teacher not found',
  })
  async findOne(@Param('id') id: string) {
    return this.teachersService.findOne(id);
  }

  @Public()
  @Get(':id/photo')
  @ApiOperation({ summary: 'Stream or retrieve teacher avatar/photo' })
  @ApiParam({ name: 'id', description: 'Teacher CUID' })
  @ApiResponse({
    status: 200,
    description: 'Image file stream',
  })
  @ApiResponse({
    status: 404,
    description: 'Photo not found for this teacher',
  })
  async getPhoto(@Param('id') id: string, @Res() res: Response) {
    const { buffer, mimeType } = await this.teachersService.getPhotoBuffer(id);
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  }

  // ── Admin Management Endpoints ─────────────────────────────

  @RequirePermissions('academics.manage')
  @Post()
  @ApiBearerAuth('access-token')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: '[ADMIN] Create a new teacher profile',
    description:
      'Creates a teacher card with name, title, bio, optional subject, and optional photo.',
  })
  @ApiResponse({
    status: 201,
    description: 'Teacher profile created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Validation failed or invalid image',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Admin access required',
  })
  async create(
    @Body() dto: CreateTeacherDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5 MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)/i }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.teachersService.create(dto, file);
  }

  @RequirePermissions('academics.manage')
  @Post('reorder')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN] Reorder teachers display order priority',
    description: 'Updates display order sequence for multiple teachers.',
  })
  @ApiResponse({
    status: 200,
    description: 'Teachers reordered successfully',
  })
  async reorder(@Body() dto: ReorderTeachersDto) {
    return this.teachersService.reorder(dto);
  }

  @RequirePermissions('academics.manage')
  @Patch(':id')
  @ApiBearerAuth('access-token')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiOperation({
    summary: '[ADMIN] Update a teacher profile',
    description:
      'Updates teacher fields and optionally uploads a new photo (replaces old photo).',
  })
  @ApiParam({ name: 'id', description: 'Teacher CUID' })
  @ApiResponse({
    status: 200,
    description: 'Teacher updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Teacher or Subject not found',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTeacherDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)/i }),
        ],
        fileIsRequired: false,
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.teachersService.update(id, dto, file);
  }

  @RequirePermissions('academics.manage')
  @Post(':id/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN] Upload or replace teacher photo',
    description: 'Accepts JPEG, PNG, or WebP images up to 5 MB.',
  })
  @ApiParam({ name: 'id', description: 'Teacher CUID' })
  @ApiResponse({
    status: 200,
    description: 'Teacher photo uploaded successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid image format or size',
  })
  @ApiResponse({
    status: 404,
    description: 'Teacher not found',
  })
  async uploadPhoto(
    @Param('id') id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)/i }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.teachersService.uploadPhoto(id, file);
  }

  @RequirePermissions('academics.manage')
  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '[ADMIN] Delete a teacher',
    description: 'Deletes teacher and prunes their image from S3 storage.',
  })
  @ApiParam({ name: 'id', description: 'Teacher CUID' })
  @ApiResponse({
    status: 200,
    description: 'Teacher deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Teacher not found',
  })
  async remove(@Param('id') id: string) {
    return this.teachersService.remove(id);
  }
}
