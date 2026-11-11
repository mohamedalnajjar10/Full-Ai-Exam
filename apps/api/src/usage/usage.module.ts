import { Global, Module } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';
import { QuotaService } from './quota.service';
import { UsageLimitsService } from './usage-limits.service';

/** عام: GeminiService وحرّاس التوليد والمحادثة كلهم بيحتاجوه */
@Global()
@Module({
  providers: [AiUsageService, QuotaService, UsageLimitsService],
  exports: [AiUsageService, QuotaService, UsageLimitsService],
})
export class UsageModule {}
