import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { BranchService } from './branch.service';
import { CurrentUser, Public, RequirePermissions } from '../common';
import type { User } from '@prisma/client';
import { BranchActionDto, CreateBranchDto } from './dto';

@ApiTags('Branches')
@Controller('branches')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get all academic branches' })
  @ApiResponse({
    status: 200,
    description: 'List of branches with subject counts',
  })
  async getAll() {
    return this.branchService.getAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a branch by ID with its subjects' })
  @ApiResponse({ status: 200, description: 'Branch with subjects' })
  @ApiResponse({ status: 400, description: 'Invalid branch ID format' })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async getOne(@Param('id') id: string) {
    return this.branchService.getOne(id);
  }

  @RequirePermissions('academics.manage')
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new branch with subjects' })
  @ApiResponse({ status: 201, description: 'Branch created successfully' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions — admin only',
  })
  @ApiResponse({ status: 409, description: 'Branch name already exists' })
  async create(@Body() dto: CreateBranchDto) {
    return this.branchService.create(dto.name, dto.subjects);
  }

  // اختيار الفرع تفضيل شخصي، مش صلاحية: بيحدّد بس أي مواد بتظهر للمستخدم
  // (subject.service.ts getByUserBranch)، ونفس البيانات متاحة أصلاً بدون
  // تسجيل دخول عبر GET /subjects/branch/:branchId. الراوت بيشتغل على
  // req.user.id لحاله، فما في وصول لمستخدم تاني.
  //
  // لما كان @Roles(Role.STUDENT)، أي حساب أدمن بينحاصر: الواجهة بتوجّهه
  // على /select-branch (ما فيها أي منطق أدوار) وبعدين الباك اند بيرفض.
  @Post('select')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Select an academic branch (first time)' })
  @ApiResponse({ status: 200, description: 'Branch selected successfully' })
  @ApiResponse({ status: 400, description: 'Branch already selected' })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async selectBranch(@CurrentUser() user: User, @Body() dto: BranchActionDto) {
    return this.branchService.selectBranch(user.id, dto.branchId);
  }

  // نفس السبب كما في select أعلاه
  @Post('change')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change academic branch (with confirmation step)' })
  @ApiResponse({ status: 200, description: 'Branch changed successfully' })
  @ApiResponse({
    status: 400,
    description: 'No branch selected or already assigned',
  })
  @ApiResponse({
    status: 401,
    description: 'Not authenticated or session expired',
  })
  @ApiResponse({ status: 404, description: 'Branch not found' })
  async changeBranch(@CurrentUser() user: User, @Body() dto: BranchActionDto) {
    return this.branchService.changeBranch(user.id, dto.branchId);
  }
}
