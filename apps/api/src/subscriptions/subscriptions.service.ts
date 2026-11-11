import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../usage/quota.service';
import {
  RedeemVoucherDto,
  CreateVoucherDto,
  GrantSubscriptionDto,
  CheckoutSessionDto,
} from './dto/subscription.dto';
import {
  SubscriptionPlanItem,
  UserSubscriptionStatus,
  RedeemVoucherResponse,
} from '@ai-exam/types';

const INITIAL_PLANS = [
  {
    code: 'FREE',
    name: 'الباقة المجانية',
    description: 'حصة يومية متجددة لتجربة المنصة والاستعداد للامتحانات',
    price: 0,
    currency: 'ILS',
    intervalDays: 365,
    dailyQuizLimit: 3,
    dailyAssessmentLimit: 1,
    dailyChatLimit: 10,
    badge: null,
    displayOrder: 1,
    features: [
      '3 كويزات ذكية يومياً',
      'اختبار تقييم معرفي يومي واحد',
      '10 رسائل محادثة مع المستشار الذكي يومياً',
      'تصفح وتحميل جميع كتب المنهاج الفلسطيني مجاناً',
      'حفظ النتائج والتقارير في سجلك الأكاديمي',
    ],
  },
  {
    code: 'PRO_MONTHLY',
    name: 'باقة التفوق الشهرية',
    description: 'الخيار الأكثر فاعلية للطلاب الراغبين بتحقيق أعلى المعدلات الوزارية',
    price: 39,
    currency: 'ILS',
    intervalDays: 30,
    dailyQuizLimit: 30,
    dailyAssessmentLimit: 5,
    dailyChatLimit: 100,
    badge: 'الأكثر طلباً ⭐',
    displayOrder: 2,
    features: [
      '30 كويز ذكي متدرج يومياً',
      '5 اختبارات تقييم معرفي مكثفة يومياً',
      '100 استشارة ومحادثة يومياً مع المستشار الذكي',
      'تحليل متقدم لفجوات التعلم وفق هرم بلوم',
      'خطة مذاكرة علاجية مخصصة لنقاط الضعف',
      'أولوية معالجة وسرعة فائقة في استجابة النماذج',
    ],
  },
  {
    code: 'ULTIMATE_TERM',
    name: 'باقة التوجيهي الشاملة',
    description: 'وصول مفتوح وغير محدود لكافة مميزات المنصة طوال الفصل الدراسي',
    price: 149,
    currency: 'ILS',
    intervalDays: 120,
    dailyQuizLimit: null, // Unlimited
    dailyAssessmentLimit: null, // Unlimited
    dailyChatLimit: null, // Unlimited
    badge: 'شاملة لكل شيء 🏆',
    displayOrder: 3,
    features: [
      'كويزات ذكية غير محدودة 24/7 طوال الفصل',
      'اختبارات تقييم معرفي غير محدودة',
      'مستشار ذكي مفتوح بلا سقف للأسئلة والشروحات',
      'بنك الأسئلة الوزارية الكامل وحلول الامتحانات السابقة',
      'استخراج وتحليل أسلوب المعلم من صور أوراق الامتحانات',
      'أعلى سرعة وأولوية مطلقة مع دعم فني مخصص',
    ],
  },
];

@Injectable()
export class SubscriptionsService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quota: QuotaService,
  ) {}

  async onModuleInit() {
    await this.seedDefaultPlans();
  }

  /**
   * إدخال الباقات الافتراضية في قاعدة البيانات إذا لم تكن موجودة.
   */
  async seedDefaultPlans(): Promise<void> {
    try {
      for (const p of INITIAL_PLANS) {
        const existing = await (this.prisma as any).subscriptionPlan?.findUnique({
          where: { code: p.code },
        });
        if (!existing && (this.prisma as any).subscriptionPlan) {
          await (this.prisma as any).subscriptionPlan.create({
            data: {
              code: p.code,
              name: p.name,
              description: p.description,
              price: p.price,
              currency: p.currency,
              intervalDays: p.intervalDays,
              dailyQuizLimit: p.dailyQuizLimit,
              dailyAssessmentLimit: p.dailyAssessmentLimit,
              dailyChatLimit: p.dailyChatLimit,
              badge: p.badge,
              displayOrder: p.displayOrder,
              features: p.features,
              isActive: true,
            },
          });
          this.logger.log(`Seeded subscription plan: ${p.code} (${p.name})`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`Could not seed subscription plans: ${err?.message}`);
    }
  }

  /**
   * جلب باقات الاشتراك النشطة المتاحة للعرض.
   */
  async getPlans(): Promise<SubscriptionPlanItem[]> {
    try {
      const plans = await (this.prisma as any).subscriptionPlan?.findMany({
        where: { isActive: true },
        orderBy: { displayOrder: 'asc' },
      });
      if (plans && plans.length > 0) {
        return plans.map((p: any) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          description: p.description,
          price: p.price,
          currency: p.currency,
          intervalDays: p.intervalDays,
          dailyQuizLimit: p.dailyQuizLimit,
          dailyAssessmentLimit: p.dailyAssessmentLimit,
          dailyChatLimit: p.dailyChatLimit,
          features: p.features,
          badge: p.badge,
          isActive: p.isActive,
          displayOrder: p.displayOrder,
        }));
      }
    } catch (err) {
      this.logger.warn(`Could not read plans from DB, falling back to defaults: ${err}`);
    }

    return INITIAL_PLANS.map((p, idx) => ({
      id: `default-plan-${idx}`,
      code: p.code,
      name: p.name,
      description: p.description,
      price: p.price,
      currency: p.currency,
      intervalDays: p.intervalDays,
      dailyQuizLimit: p.dailyQuizLimit,
      dailyAssessmentLimit: p.dailyAssessmentLimit,
      dailyChatLimit: p.dailyChatLimit,
      features: p.features,
      badge: p.badge,
      isActive: true,
      displayOrder: p.displayOrder,
    }));
  }

  /**
   * جلب حالة اشتراك الطالب الحالية وتفاصيل رصيده اليومي للميزات الثلاث.
   */
  async getMyStatus(userId: string): Promise<UserSubscriptionStatus> {
    return this.quota.getAllFeaturesStatus(userId);
  }

  /**
   * شحن كود تفعيل / كرت مكتبة لترقية الحساب.
   */
  async redeemVoucher(
    userId: string,
    dto: RedeemVoucherDto,
  ): Promise<RedeemVoucherResponse> {
    const rawCode = (dto.code || '').trim().toUpperCase();
    if (!rawCode) {
      throw new BadRequestException('يرجى إدخال كود التفعيل');
    }

    const voucher = await (this.prisma as any).subscriptionVoucher?.findUnique({
      where: { code: rawCode },
    });

    if (!voucher) {
      throw new NotFoundException('كود التفعيل غير صحيح أو غير موجود');
    }

    if (voucher.isRedeemed) {
      throw new ConflictException('تم استخدام كود التفعيل هذا مسبقاً');
    }

    if (voucher.expiresAt && new Date(voucher.expiresAt) < new Date()) {
      throw new BadRequestException('عذراً، انتهت صلاحية كود التفعيل هذا');
    }

    // جلب الباقة المرتبطة بالكود
    let plan = await (this.prisma as any).subscriptionPlan?.findUnique({
      where: { code: voucher.planCode },
    });

    if (!plan) {
      // Fallback: ابحث عن باقة PRO
      plan = await (this.prisma as any).subscriptionPlan?.findFirst({
        where: { code: 'PRO_MONTHLY' },
      });
      if (!plan) {
        throw new NotFoundException('الباقة المرتبطة بهذا الكود غير متوفرة حالياً');
      }
    }

    const durationDays = voucher.durationDays || plan.intervalDays || 30;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    // تحديث الكود وإنشاء/تمديد الاشتراك
    await (this.prisma as any).$transaction([
      (this.prisma as any).subscriptionVoucher.update({
        where: { id: voucher.id },
        data: {
          isRedeemed: true,
          redeemedBy: userId,
          redeemedAt: new Date(),
        },
      }),
      (this.prisma as any).userSubscription.create({
        data: {
          userId,
          planId: plan.id,
          status: 'ACTIVE',
          startedAt: new Date(),
          expiresAt,
          paymentMethod: 'VOUCHER',
          paymentRef: rawCode,
        },
      }),
    ]);

    this.logger.log(
      `User ${userId} redeemed voucher ${rawCode} for plan ${plan.name} until ${expiresAt.toISOString()}`,
    );

    return {
      success: true,
      message: `تهانينا! تم تفعيل "${plan.name}" بنجاح لمدة ${durationDays} يوماً.`,
      planName: plan.name,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * ترقية حساب طالب يدوياً من لوحة الإدارة (عند استلام حوالة أو نقدياً).
   */
  async grantSubscriptionManual(
    adminEmail: string,
    dto: GrantSubscriptionDto,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) {
      throw new NotFoundException(`المستخدم غير موجود: ${dto.userId}`);
    }

    const plan = await (this.prisma as any).subscriptionPlan?.findUnique({
      where: { code: dto.planCode },
    });
    if (!plan) {
      throw new NotFoundException(`الباقة غير موجودة: ${dto.planCode}`);
    }

    const durationDays = dto.durationDays || plan.intervalDays || 30;
    const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000);

    await (this.prisma as any).userSubscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        status: 'ACTIVE',
        startedAt: new Date(),
        expiresAt,
        paymentMethod: 'MANUAL_ADMIN',
        paymentRef: `Granted by ${adminEmail}. Note: ${dto.note || ''}`,
      },
    });

    return {
      success: true,
      message: `تم منح "${plan.name}" للمستخدم ${user.name || user.email} بنجاح حتى ${expiresAt.toISOString().slice(0, 10)}.`,
    };
  }

  /**
   * إنشاء كروت شحن وأكواد تفعيل جديدة (Vouchers) للمكتبات أو المدارس.
   */
  async createVouchers(
    adminEmail: string,
    dto: CreateVoucherDto,
  ): Promise<{ count: number; codes: string[] }> {
    const count = Math.min(100, Math.max(1, dto.count || 1));
    const durationDays = dto.durationDays || 30;
    const planCode = dto.planCode || 'PRO_MONTHLY';

    const generatedCodes: string[] = [];

    for (let i = 0; i < count; i++) {
      const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
      const code = `TAWJIHI-${planCode.replace('_MONTHLY', '')}-${randomPart}`;

      await (this.prisma as any).subscriptionVoucher.create({
        data: {
          code,
          planCode,
          durationDays,
          createdBy: adminEmail,
        },
      });
      generatedCodes.push(code);
    }

    return {
      count: generatedCodes.length,
      codes: generatedCodes,
    };
  }

  /**
   * إنشاء جلسة دفع تجريبية / محاكاة الدفع الإلكتروني.
   */
  async createCheckoutSession(
    userId: string,
    dto: CheckoutSessionDto,
  ): Promise<{ checkoutUrl: string; planCode: string; message: string }> {
    const plan = await (this.prisma as any).subscriptionPlan?.findUnique({
      where: { code: dto.planCode },
    });

    if (!plan) {
      throw new NotFoundException('الباقة المختارة غير متوفرة');
    }

    return {
      checkoutUrl: `/subscriptions?checkout_pending=true&plan=${plan.code}`,
      planCode: plan.code,
      message: `سيتم توجيهك لإتمام الدفع بقيمة ${plan.price} ${plan.currency}.`,
    };
  }
}
