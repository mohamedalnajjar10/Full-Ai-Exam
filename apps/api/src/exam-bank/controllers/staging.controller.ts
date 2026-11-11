import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { CurrentUser, RequirePermissions } from '../../common';
import type { User } from '@prisma/client';
import { StagingService } from '../services/staging.service';
import {
  ApproveQuestionDto,
  UpdateStagedQuestionDto,
  QueryStagedDto,
} from '../dto';

@ApiTags('Staged Questions')
@ApiBearerAuth('access-token')
@Controller('admin/staged-questions')
export class StagingController {
  constructor(private readonly staging: StagingService) {}

  @RequirePermissions('content.review')
  @Get()
  @ApiOperation({ summary: '[ADMIN] List staged questions' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of staged questions',
  })
  async list(@Query() query: QueryStagedDto) {
    return this.staging.list(query);
  }

  @RequirePermissions('content.review')
  @Get(':id')
  @ApiOperation({ summary: '[ADMIN] Get a staged question by ID' })
  @ApiResponse({ status: 200, description: 'Staged question details' })
  @ApiResponse({ status: 404, description: 'Staged question not found' })
  async getById(@Param('id') id: string) {
    return this.staging.getById(id);
  }

  @RequirePermissions('content.review')
  @Patch(':id')
  @ApiOperation({ summary: '[ADMIN] Edit a staged question draft' })
  @ApiResponse({ status: 200, description: 'Staged question updated' })
  @ApiResponse({ status: 404, description: 'Staged question not found' })
  @ApiResponse({ status: 409, description: 'Cannot edit non-PENDING question' })
  async update(@Param('id') id: string, @Body() dto: UpdateStagedQuestionDto) {
    return this.staging.update(id, dto);
  }

  @RequirePermissions('content.review')
  @Post(':id/approve')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[ADMIN] Approve staged question with pedagogical metadata',
  })
  @ApiResponse({
    status: 201,
    description: 'Question approved and published to exam bank',
  })
  @ApiResponse({ status: 404, description: 'Staged question not found' })
  @ApiResponse({ status: 409, description: 'Question already processed' })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveQuestionDto,
    @CurrentUser() user: User,
  ) {
    return this.staging.approve(id, dto, user.id);
  }

  @RequirePermissions('content.review')
  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[ADMIN] Reject a staged question' })
  @ApiResponse({ status: 200, description: 'Question rejected' })
  @ApiResponse({ status: 404, description: 'Staged question not found' })
  @ApiResponse({ status: 409, description: 'Question already processed' })
  async reject(@Param('id') id: string, @CurrentUser() user: User) {
    return this.staging.reject(id, user.id);
  }
}
