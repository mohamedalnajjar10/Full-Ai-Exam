import { Body, Controller, Get, Patch } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CurrentUser } from '../common';
import type { User } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile (canonical)' })
  @ApiResponse({ status: 200, description: 'User profile with branch info' })
  async getMe(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile (name)' })
  @ApiResponse({ status: 200, description: 'Updated profile' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async updateMe(@CurrentUser() user: User, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile (alias for me)' })
  @ApiResponse({ status: 200, description: 'User profile with branch info' })
  async getProfile(@CurrentUser() user: User) {
    return this.usersService.getProfile(user.id);
  }
}
