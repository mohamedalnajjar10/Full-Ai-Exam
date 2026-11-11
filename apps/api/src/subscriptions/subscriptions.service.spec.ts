import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotaService } from '../usage/quota.service';

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: any;
  let quota: any;

  const mockPlan = {
    id: 'plan-pro',
    code: 'PRO_MONTHLY',
    name: 'باقة التفوق الشهرية',
    description: 'باقة مخصصة للتفوق',
    price: 39,
    currency: 'ILS',
    intervalDays: 30,
    dailyQuizLimit: 30,
    dailyAssessmentLimit: 5,
    dailyChatLimit: 100,
    features: ['ميزة 1', 'ميزة 2'],
    badge: 'الأكثر طلباً ⭐',
    isActive: true,
    displayOrder: 2,
  };

  const mockPrisma = {
    subscriptionPlan: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    subscriptionVoucher: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userSubscription: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((promises) => Promise.all(promises)),
  };

  const mockQuota = {
    getAllFeaturesStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: QuotaService, useValue: mockQuota },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);
    prisma = module.get<PrismaService>(PrismaService);
    quota = module.get<QuotaService>(QuotaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPlans', () => {
    it('returns active plans from database', async () => {
      mockPrisma.subscriptionPlan.findMany.mockResolvedValue([mockPlan]);

      const plans = await service.getPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0].code).toBe('PRO_MONTHLY');
      expect(plans[0].price).toBe(39);
    });

    it('returns default plans if database has no plans', async () => {
      mockPrisma.subscriptionPlan.findMany.mockResolvedValue([]);

      const plans = await service.getPlans();
      expect(plans.length).toBeGreaterThanOrEqual(3);
      expect(plans.map((p) => p.code)).toContain('FREE');
      expect(plans.map((p) => p.code)).toContain('PRO_MONTHLY');
      expect(plans.map((p) => p.code)).toContain('ULTIMATE_TERM');
    });
  });

  describe('getMyStatus', () => {
    it('delegates status retrieval to QuotaService', async () => {
      const mockStatus = {
        planCode: 'PRO_MONTHLY',
        planName: 'باقة التفوق الشهرية',
        isPaid: true,
        quotas: {
          quiz: { limit: 30, used: 5, remaining: 25, allowed: true },
          assessment: { limit: 5, used: 1, remaining: 4, allowed: true },
          chat: { limit: 100, used: 10, remaining: 90, allowed: true },
        },
      };
      mockQuota.getAllFeaturesStatus.mockResolvedValue(mockStatus);

      const status = await service.getMyStatus('user-1');
      expect(status.planCode).toBe('PRO_MONTHLY');
      expect(status.quotas.quiz.remaining).toBe(25);
      expect(mockQuota.getAllFeaturesStatus).toHaveBeenCalledWith('user-1');
    });
  });

  describe('redeemVoucher', () => {
    it('throws BadRequestException if code is empty', async () => {
      await expect(
        service.redeemVoucher('user-1', { code: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException if voucher does not exist', async () => {
      mockPrisma.subscriptionVoucher.findUnique.mockResolvedValue(null);

      await expect(
        service.redeemVoucher('user-1', { code: 'INVALID-CODE' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException if voucher is already redeemed', async () => {
      mockPrisma.subscriptionVoucher.findUnique.mockResolvedValue({
        id: 'v-1',
        code: 'USED-CODE',
        isRedeemed: true,
      });

      await expect(
        service.redeemVoucher('user-1', { code: 'USED-CODE' }),
      ).rejects.toThrow(ConflictException);
    });

    it('successfully redeems voucher and creates user subscription', async () => {
      mockPrisma.subscriptionVoucher.findUnique.mockResolvedValue({
        id: 'v-1',
        code: 'TAWJIHI-PRO-TEST',
        planCode: 'PRO_MONTHLY',
        durationDays: 30,
        isRedeemed: false,
      });
      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);

      const result = await service.redeemVoucher('user-1', {
        code: 'tawjihi-pro-test',
      });

      expect(result.success).toBe(true);
      expect(result.planName).toBe('باقة التفوق الشهرية');
      expect(mockPrisma.subscriptionVoucher.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'v-1' },
          data: expect.objectContaining({ isRedeemed: true, redeemedBy: 'user-1' }),
        }),
      );
      expect(mockPrisma.userSubscription.create).toHaveBeenCalled();
    });
  });

  describe('createVouchers', () => {
    it('creates multiple voucher codes', async () => {
      mockPrisma.subscriptionVoucher.create.mockResolvedValue({});

      const result = await service.createVouchers('admin@test.com', {
        planCode: 'PRO_MONTHLY',
        durationDays: 30,
        count: 3,
      });

      expect(result.count).toBe(3);
      expect(result.codes).toHaveLength(3);
      expect(result.codes[0]).toContain('TAWJIHI-PRO');
      expect(mockPrisma.subscriptionVoucher.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('grantSubscriptionManual', () => {
    it('manually assigns a plan to user', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        name: 'أحمد',
        email: 'ahmad@test.com',
      });
      mockPrisma.subscriptionPlan.findUnique.mockResolvedValue(mockPlan);
      mockPrisma.userSubscription.create.mockResolvedValue({});

      const result = await service.grantSubscriptionManual('admin@test.com', {
        userId: 'user-1',
        planCode: 'PRO_MONTHLY',
        durationDays: 30,
      });

      expect(result.success).toBe(true);
      expect(mockPrisma.userSubscription.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: 'user-1',
            planId: mockPlan.id,
            paymentMethod: 'MANUAL_ADMIN',
          }),
        }),
      );
    });
  });
});
