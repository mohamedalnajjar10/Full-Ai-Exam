import { Test, TestingModule } from '@nestjs/testing';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { ThrottleGuard } from '../common/guards/throttle.guard';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

const mockSupportService = {
  submitContact: jest.fn(),
  getAdminTickets: jest.fn(),
  updateTicketStatus: jest.fn(),
};

describe('SupportController', () => {
  let controller: SupportController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SupportController],
      providers: [
        { provide: SupportService, useValue: mockSupportService },
      ],
    })
      .overrideGuard(ThrottleGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SupportController>(SupportController);
    jest.clearAllMocks();
  });

  it('delegates contact submissions to SupportService with user id if available', async () => {
    mockSupportService.submitContact.mockResolvedValue({
      success: true,
      ticketId: 'TIC-123',
      message: 'تم إرسال رسالتك بنجاح',
    });

    const dto = {
      name: 'محمود',
      email: 'mahmoud@example.com',
      message: 'شكراً لكم على هذه المنصة الرائعة.',
    };

    const res = await controller.contact(dto, { id: 'usr-1' });

    expect(mockSupportService.submitContact).toHaveBeenCalledWith(dto, 'usr-1');
    expect(res.ticketId).toBe('TIC-123');
  });

  it('delegates contact submissions to SupportService with undefined if guest', async () => {
    mockSupportService.submitContact.mockResolvedValue({
      success: true,
      ticketId: 'TIC-456',
      message: 'تم إرسال رسالتك بنجاح',
    });

    const dto = {
      name: 'ضيف',
      email: 'guest@example.com',
      message: 'استفسار قبل التسجيل في الموقع.',
    };

    const res = await controller.contact(dto, undefined);

    expect(mockSupportService.submitContact).toHaveBeenCalledWith(dto, undefined);
    expect(res.ticketId).toBe('TIC-456');
  });

  it('fetches admin tickets with optional status filter', async () => {
    mockSupportService.getAdminTickets.mockResolvedValue([
      { ticketId: 'TIC-1', status: 'OPEN' },
    ]);

    const res = await controller.getTickets('OPEN');

    expect(mockSupportService.getAdminTickets).toHaveBeenCalledWith('OPEN');
    expect(res).toHaveLength(1);
  });

  it('updates ticket status for admins', async () => {
    mockSupportService.updateTicketStatus.mockResolvedValue({
      ticketId: 'TIC-1',
      status: 'RESOLVED',
    });

    const res = await controller.updateStatus('TIC-1', 'RESOLVED', { id: 'admin-1' });

    expect(mockSupportService.updateTicketStatus).toHaveBeenCalledWith(
      'TIC-1',
      'RESOLVED',
      'admin-1',
    );
    expect(res.status).toBe('RESOLVED');
  });
});
