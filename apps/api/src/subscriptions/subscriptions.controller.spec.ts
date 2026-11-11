import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let service: any;

  const mockUser: AuthenticatedUser = {
    id: 'user-1',
    email: 'student@example.com',
    role: 'STUDENT' as any,
  } as unknown as AuthenticatedUser;

  const mockSubscriptionsService = {
    getPlans: jest.fn(),
    getMyStatus: jest.fn(),
    redeemVoucher: jest.fn(),
    createCheckoutSession: jest.fn(),
    createVouchers: jest.fn(),
    grantSubscriptionManual: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
      ],
    }).compile();

    controller = module.get<SubscriptionsController>(SubscriptionsController);
    service = module.get<SubscriptionsService>(SubscriptionsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getPlans should return plans', async () => {
    mockSubscriptionsService.getPlans.mockResolvedValue([
      { code: 'FREE', name: 'الباقة المجانية' },
    ]);

    const result = await controller.getPlans();
    expect(result).toHaveLength(1);
    expect(service.getPlans).toHaveBeenCalled();
  });

  it('getMyStatus should return status for current user', async () => {
    mockSubscriptionsService.getMyStatus.mockResolvedValue({
      planCode: 'FREE',
      quotas: { quiz: { remaining: 3 } },
    });

    const result = await controller.getMyStatus(mockUser);
    expect(result.planCode).toBe('FREE');
    expect(service.getMyStatus).toHaveBeenCalledWith('user-1');
  });

  it('redeemVoucher should redeem voucher for current user', async () => {
    mockSubscriptionsService.redeemVoucher.mockResolvedValue({
      success: true,
      message: 'تم التفعيل',
    });

    const result = await controller.redeemVoucher(mockUser, {
      code: 'TAWJIHI-PRO-1234',
    });
    expect(result.success).toBe(true);
    expect(service.redeemVoucher).toHaveBeenCalledWith('user-1', {
      code: 'TAWJIHI-PRO-1234',
    });
  });

  it('createCheckout should return checkout session', async () => {
    mockSubscriptionsService.createCheckoutSession.mockResolvedValue({
      checkoutUrl: '/subscriptions?checkout=1',
    });

    const result = await controller.createCheckout(mockUser, {
      planCode: 'PRO_MONTHLY',
    });
    expect(result.checkoutUrl).toBeDefined();
  });

  it('admin createVouchers should create voucher codes', async () => {
    mockSubscriptionsService.createVouchers.mockResolvedValue({
      count: 2,
      codes: ['C1', 'C2'],
    });

    const result = await controller.createVouchers(mockUser, {
      planCode: 'PRO_MONTHLY',
      count: 2,
    });
    expect(result.count).toBe(2);
  });

  it('admin grantManual should grant subscription', async () => {
    mockSubscriptionsService.grantSubscriptionManual.mockResolvedValue({
      success: true,
    });

    const result = await controller.grantManual(mockUser, {
      userId: 'user-2',
      planCode: 'PRO_MONTHLY',
      durationDays: 30,
    });
    expect(result.success).toBe(true);
  });
});
