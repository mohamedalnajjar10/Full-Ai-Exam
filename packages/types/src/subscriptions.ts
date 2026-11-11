export type SubscriptionPlanCode = 'FREE' | 'PRO_MONTHLY' | 'ULTIMATE_TERM' | string;

export type SubscriptionFeatureType = 'quiz' | 'assessment' | 'chat';

export interface SubscriptionPlanItem {
  id: string;
  code: SubscriptionPlanCode;
  name: string;
  description: string;
  price: number;
  currency: string;
  intervalDays: number;
  dailyQuizLimit: number | null; // null = unlimited
  dailyAssessmentLimit: number | null; // null = unlimited
  dailyChatLimit: number | null; // null = unlimited
  features: string[];
  badge?: string | null;
  isActive: boolean;
  displayOrder: number;
}

export interface FeatureDailyQuota {
  limit: number | null; // null = unlimited
  used: number;
  remaining: number | null; // null = unlimited
  allowed: boolean;
}

export interface UserSubscriptionStatus {
  planCode: SubscriptionPlanCode;
  planName: string;
  badge?: string | null;
  isPaid: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  resetAt: string;
  quotas: {
    quiz: FeatureDailyQuota;
    assessment: FeatureDailyQuota;
    chat: FeatureDailyQuota;
  };
}

export interface RedeemVoucherResponse {
  success: boolean;
  message: string;
  planName: string;
  expiresAt: string;
}

export interface QuotaExceededErrorPayload {
  statusCode: 429;
  error: 'QUOTA_EXCEEDED';
  feature: SubscriptionFeatureType;
  message: string;
  limit: number | null;
  used: number;
  resetAt: string;
  upgradeUrl: string;
}
