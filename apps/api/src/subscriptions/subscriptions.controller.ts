import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import {
  RedeemVoucherDto,
  CreateVoucherDto,
  GrantSubscriptionDto,
  CheckoutSessionDto,
} from './dto/subscription.dto';
import { JwtAuthGuard, CurrentUser, RequirePermissions } from '../common';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

@ApiTags('Subscriptions & Plans')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('plans')
  @ApiOperation({ summary: 'Get all active subscription plans' })
  getPlans() {
    return this.subscriptionsService.getPlans();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Get('my-status')
  @ApiOperation({ summary: 'Get current student subscription and daily quotas' })
  getMyStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.subscriptionsService.getMyStatus(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('redeem-voucher')
  @ApiOperation({ summary: 'Redeem an activation voucher code' })
  redeemVoucher(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RedeemVoucherDto,
  ) {
    return this.subscriptionsService.redeemVoucher(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @Post('checkout')
  @ApiOperation({ summary: 'Initiate subscription checkout session' })
  createCheckout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutSessionDto,
  ) {
    return this.subscriptionsService.createCheckoutSession(user.id, dto);
  }

  /* ───────────── مسارات الإدارة ───────────── */

  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.edit')
  @ApiBearerAuth('access-token')
  @Post('admin/vouchers')
  @ApiOperation({ summary: '[ADMIN] Generate bulk subscription vouchers' })
  createVouchers(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVoucherDto,
  ) {
    return this.subscriptionsService.createVouchers(user.email || user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.edit')
  @ApiBearerAuth('access-token')
  @Post('admin/grant')
  @ApiOperation({ summary: '[ADMIN] Manually grant subscription to a student' })
  grantManual(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: GrantSubscriptionDto,
  ) {
    return this.subscriptionsService.grantSubscriptionManual(
      user.email || user.id,
      dto,
    );
  }
}
