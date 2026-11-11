import { ParentRealtimeService } from './parent-realtime.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

describe('ParentRealtimeService', () => {
  let service: ParentRealtimeService;
  let mockPrisma: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      parentStudentLink: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };
    mockConfig = {
      get: jest.fn().mockReturnValue(null), // no Redis in unit test
    };

    service = new ParentRealtimeService(mockPrisma, mockConfig);
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('streams events when parent-student link is ACTIVE', async () => {
    const parentId = 'p1';
    const studentId = 's1';

    mockPrisma.parentStudentLink.findMany.mockResolvedValue([{ studentId }]);
    mockPrisma.parentStudentLink.findFirst.mockResolvedValue({ id: 'link-1' });

    const stream$ = await service.createParentStudentStream(
      parentId,
      studentId,
    );

    const receivedPromise = firstValueFrom(stream$);

    service.emitStudentEvent(
      studentId,
      'ASSESSMENT_COMPLETED',
      'أنهى اختباراً',
      {
        score: 95,
      },
    );

    const received = await receivedPromise;
    expect(received.type).toBe('STUDENT_ACTIVITY');
    const parsed = JSON.parse(received.data as string);
    expect(parsed.studentId).toBe(studentId);
    expect(parsed.data).toEqual({ score: 95 });
  });

  it('dynamically suppresses events and revokes access when link becomes inactive', async () => {
    const parentId = 'p1';
    const studentId = 's1';

    mockPrisma.parentStudentLink.findMany.mockResolvedValue([{ studentId }]);
    // Simulate link being deleted or revoked after stream was opened
    mockPrisma.parentStudentLink.findFirst.mockResolvedValue(null);

    const stream$ = await service.createParentStudentStream(
      parentId,
      studentId,
    );

    let emitted = false;
    const sub = stream$.subscribe((msg) => {
      if (msg.type === 'STUDENT_ACTIVITY') emitted = true;
    });

    service.emitStudentEvent(
      studentId,
      'ASSESSMENT_COMPLETED',
      'أنهى اختباراً',
      {
        score: 95,
      },
    );

    // Wait a brief tick for async concatMap
    await new Promise((r) => setTimeout(r, 50));
    sub.unsubscribe();

    expect(emitted).toBe(false);
  });

  it('ignores events for students that were never linked to this parent', async () => {
    const parentId = 'p1';

    mockPrisma.parentStudentLink.findMany.mockResolvedValue([
      { studentId: 'child-1' },
    ]);

    const stream$ = await service.createParentStudentStream(parentId);

    let emitted = false;
    const sub = stream$.subscribe((msg) => {
      if (msg.type === 'STUDENT_ACTIVITY') emitted = true;
    });

    service.emitStudentEvent(
      'child-OTHER',
      'ASSESSMENT_COMPLETED',
      'اختبار',
      {},
    );

    await new Promise((r) => setTimeout(r, 50));
    sub.unsubscribe();

    expect(emitted).toBe(false);
    expect(mockPrisma.parentStudentLink.findFirst).not.toHaveBeenCalled();
  });

  it('caches active link check for 30 seconds to prevent hammering the database', async () => {
    const parentId = 'p-cached';
    const studentId = 's-cached';

    mockPrisma.parentStudentLink.findFirst.mockResolvedValue({ id: 'link-cached' });

    // First call: goes to database
    const valid1 = await service.isLinkActive(parentId, studentId);
    expect(valid1).toBe(true);
    expect(mockPrisma.parentStudentLink.findFirst).toHaveBeenCalledTimes(1);

    // Second call within 30s: hits in-memory cache
    const valid2 = await service.isLinkActive(parentId, studentId);
    expect(valid2).toBe(true);
    expect(mockPrisma.parentStudentLink.findFirst).toHaveBeenCalledTimes(1);

    // Invalidation clears cache, next call hits database
    service.invalidateLinkCache(parentId, studentId);
    const valid3 = await service.isLinkActive(parentId, studentId);
    expect(valid3).toBe(true);
    expect(mockPrisma.parentStudentLink.findFirst).toHaveBeenCalledTimes(2);
  });
});
