import { Test, TestingModule } from '@nestjs/testing';
import { SupportService } from './support.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const mockPrisma = {
  studentActivityEvent: {
    create: jest.fn(),
  },
  appSetting: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const mockMailService = {
  sendContactSupportEmail: jest.fn(),
};

describe('SupportService', () => {
  let service: SupportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SupportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<SupportService>(SupportService);
    jest.clearAllMocks();
  });

  it('submits contact request successfully for guest users', async () => {
    mockMailService.sendContactSupportEmail.mockResolvedValue(undefined);

    const dto = {
      name: 'أحمد محمود',
      email: 'ahmad@example.com',
      phone: '0599123456',
      message: 'أواجه مشكلة في تفعيل الحساب وأريد مساعدة في الدخول.',
    };

    const res = await service.submitContact(dto);

    expect(res.success).toBe(true);
    expect(res.ticketId).toMatch(/^TIC-/);
    expect(mockPrisma.studentActivityEvent.create).not.toHaveBeenCalled();
    expect(mockMailService.sendContactSupportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        ticketId: res.ticketId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        message: dto.message,
      }),
    );
  });

  it('submits contact request and records activity event when user is authenticated', async () => {
    mockMailService.sendContactSupportEmail.mockResolvedValue(undefined);
    mockPrisma.studentActivityEvent.create.mockResolvedValue({ id: 'event-123' });

    const dto = {
      name: 'سارة خالد',
      email: 'sara@example.com',
      message: 'أريد الاستفسار عن كويزات مادة الرياضيات الفرع العلمي.',
    };

    const res = await service.submitContact(dto, 'student-user-456');

    expect(res.success).toBe(true);
    expect(res.ticketId).toMatch(/^TIC-/);
    expect(mockPrisma.studentActivityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        studentId: 'student-user-456',
        eventType: 'SUPPORT_TICKET_CREATED',
        title: `تذكرة دعم فني #${res.ticketId}`,
      }),
    });
    expect(mockMailService.sendContactSupportEmail).toHaveBeenCalled();
  });

  it('still returns success even if mail sending throws an error', async () => {
    mockMailService.sendContactSupportEmail.mockRejectedValue(
      new Error('SMTP connection error'),
    );

    const dto = {
      name: 'طارق',
      email: 'tariq@example.com',
      message: 'استفسار عام عن المنصة والميزات المتاحة.',
    };

    const res = await service.submitContact(dto);

    expect(res.success).toBe(true);
    expect(res.ticketId).toBeDefined();
  });

  describe('admin tickets management', () => {
    it('retrieves and filters tickets from appSetting', async () => {
      mockPrisma.appSetting.findMany.mockResolvedValue([
        {
          key: 'support_ticket:TIC-1',
          value: {
            ticketId: 'TIC-1',
            name: 'علي',
            email: 'ali@test.com',
            message: 'مساعدة',
            status: 'OPEN',
            createdAt: '2026-10-21T01:00:00Z',
          },
        },
        {
          key: 'support_ticket:TIC-2',
          value: {
            ticketId: 'TIC-2',
            name: 'منى',
            email: 'mona@test.com',
            message: 'استفسار آخر',
            status: 'RESOLVED',
            createdAt: '2026-10-21T02:00:00Z',
          },
        },
      ]);

      const all = await service.getAdminTickets();
      expect(all).toHaveLength(2);
      expect(all[0].ticketId).toBe('TIC-2'); // Sorted desc

      const openOnly = await service.getAdminTickets('OPEN');
      expect(openOnly).toHaveLength(1);
      expect(openOnly[0].ticketId).toBe('TIC-1');
    });

    it('updates ticket status and records resolvedAt', async () => {
      mockPrisma.appSetting.findUnique.mockResolvedValue({
        key: 'support_ticket:TIC-1',
        value: {
          ticketId: 'TIC-1',
          name: 'علي',
          email: 'ali@test.com',
          message: 'مساعدة',
          status: 'OPEN',
          createdAt: '2026-10-21T01:00:00Z',
        },
      });
      mockPrisma.appSetting.update.mockResolvedValue({});

      const updated = await service.updateTicketStatus('TIC-1', 'RESOLVED', 'admin-user');

      expect(updated.status).toBe('RESOLVED');
      expect(updated.resolvedAt).toBeDefined();
      expect(mockPrisma.appSetting.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: 'support_ticket:TIC-1' },
          data: expect.objectContaining({
            updatedBy: 'admin-user',
          }),
        }),
      );
    });
  });
});
