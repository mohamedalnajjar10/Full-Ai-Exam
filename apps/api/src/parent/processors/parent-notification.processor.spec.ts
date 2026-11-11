import { ParentNotificationProcessor } from './parent-notification.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { Job } from 'bullmq';

describe('ParentNotificationProcessor', () => {
  let processor: ParentNotificationProcessor;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    processor = new ParentNotificationProcessor(mockPrisma as PrismaService);
  });

  it('processes parent notification job when parent is active', async () => {
    const job = {
      id: 'job-1',
      data: {
        eventId: 'event-1',
        studentId: 'student-1',
        parentId: 'parent-1',
        eventType: 'ASSESSMENT_COMPLETED',
        title: 'إنجاز جديد',
        body: 'أتم الطالب التقييم بنجاح',
      },
    } as Job<any>;

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'parent-1',
      suspendedAt: null,
    });

    await expect(processor.process(job)).resolves.not.toThrow();
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'parent-1' },
      select: { id: true, suspendedAt: true },
    });
  });

  it('skips processing if parent account is suspended or nonexistent', async () => {
    const job = {
      id: 'job-2',
      data: {
        eventId: 'event-2',
        studentId: 'student-1',
        parentId: 'parent-suspended',
        eventType: 'ASSESSMENT_COMPLETED',
        title: 'إنجاز جديد',
        body: 'أتم الطالب التقييم بنجاح',
      },
    } as Job<any>;

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'parent-suspended',
      suspendedAt: new Date(),
    });

    await expect(processor.process(job)).resolves.not.toThrow();
  });
});
