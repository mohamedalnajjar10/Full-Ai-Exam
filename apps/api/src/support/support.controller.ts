import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '../common/decorators/throttle.decorator';
import { ThrottleGuard } from '../common/guards/throttle.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ContactUsDto } from './dto/contact-us.dto';
import {
  ContactResponse,
  SupportService,
  SupportTicketRecord,
} from './support.service';

@Controller('support')
@UseGuards(ThrottleGuard)
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @Post('contact')
  @HttpCode(HttpStatus.OK)
  @Throttle({ limit: 5, windowMs: 10 * 60_000 }) // 5 requests per 10 minutes
  async contact(
    @Body() dto: ContactUsDto,
    @CurrentUser() user?: { id?: string },
  ): Promise<ContactResponse> {
    return this.supportService.submitContact(dto, user?.id);
  }

  @Get('admin/tickets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getTickets(
    @Query('status') status?: string,
  ): Promise<SupportTicketRecord[]> {
    return this.supportService.getAdminTickets(status);
  }

  @Patch('admin/tickets/:ticketId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateStatus(
    @Param('ticketId') ticketId: string,
    @Body('status') status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED',
    @CurrentUser() user?: { id?: string },
  ): Promise<SupportTicketRecord> {
    return this.supportService.updateTicketStatus(ticketId, status, user?.id);
  }
}
