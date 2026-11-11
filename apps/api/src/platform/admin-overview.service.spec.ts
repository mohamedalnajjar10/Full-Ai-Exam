import { AdminOverviewService } from './admin-overview.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';

describe('AdminOverviewService', () => {
  let service: AdminOverviewService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        count: jest.fn().mockImplementation((args: any) => {
          if (args?.where?.updatedAt) return Promise.resolve(15);
          return Promise.resolve(100);
        }),
      },
      examBankQuestion: {
        count: jest.fn().mockResolvedValue(500),
      },
      aiUsageLog: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { costUsd: 12.5 },
        }),
      },
      $queryRaw: jest.fn().mockImplementation((query: any) => {
        const text = String(query);
        if (text.includes('GROUP BY 1 ORDER BY 1 ASC')) {
          return Promise.resolve([
            { day: new Date(), count: BigInt(25) },
          ]);
        }
        if (text.includes('GROUP BY 1 ORDER BY count DESC')) {
          return Promise.resolve([
            { task: 'generation', count: BigInt(80) },
            { task: 'answer', count: BigInt(45) },
          ]);
        }
        return Promise.resolve([]);
      }),
      knowledgeDocument: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'doc-1',
            originalName: 'كيمياء_علمي.pdf',
            kind: 'BOOK',
            stage: 'INDEXED',
            progress: 100,
            chunkCount: 150,
            error: null,
            createdAt: new Date(),
            subject: { name: 'الكيمياء' },
            branch: { name: 'العلمي' },
          },
        ]),
      },
      examFile: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ef-1',
            originalName: 'امتحان_فيزياء_2025.pdf',
            status: 'COMPLETED',
            errorLog: null,
            createdAt: new Date(),
            subject: { name: 'الفيزياء' },
            branch: { name: 'العلمي' },
          },
        ]),
      },
      subject: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            name: 'الكيمياء',
            branch: { name: 'العلمي' },
            bookPdfKey: 'books/chem.pdf',
          },
        ]),
      },
      knowledgeChunk: {
        groupBy: jest.fn().mockResolvedValue([
          { subjectId: 'sub-1', embeddingStatus: 'INDEXED', _count: { _all: 150 } },
        ]),
      },
      studentActivityEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ev-1',
            eventType: 'quiz.completed',
            title: 'أنهى كويز تفاعلي بنجاح',
            metadata: { subjectName: 'الكيمياء' },
            createdAt: new Date(),
            student: { name: 'أحمد', email: 'ahmad@test.com' },
          },
        ]),
      },
    };

    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue('1'),
    };

    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'GEMINI_API_KEY') return 'test-key';
        return null;
      }),
    };

    service = new AdminOverviewService(
      mockPrisma as unknown as PrismaService,
      mockRedis as unknown as RedisService,
      mockConfig as unknown as ConfigService,
    );
  });

  it('aggregates live KPIs, AI series, pipeline jobs and service health', async () => {
    const overview = await service.getOverview(30);

    expect(overview.kpis.students.value).toBe(100);
    expect(overview.kpis.activeToday.value).toBe(15);
    expect(overview.kpis.bankQuestions.value).toBe(500);
    expect(overview.kpis.aiCost.value).toBe('$12.50');

    expect(overview.aiRequestsSeries.length).toBe(30);
    expect(overview.requestsByTask[0].label).toBe('توليد الأسئلة');

    expect(overview.pipeline.jobs.length).toBeGreaterThan(0);
    expect(overview.knowledgeReadiness.subjects.length).toBeGreaterThan(0);
    expect(overview.services.some((s) => s.name.includes('PostgreSQL'))).toBe(true);
    expect(overview.activity.length).toBe(1);
    expect(overview.activity[0].who).toBe('أحمد');
  });

  it('supports 7-day range slice for chart zoom', async () => {
    const overview = await service.getOverview(7);
    expect(overview.rangeDays).toBe(7);
    expect(overview.aiRequestsSeries.length).toBe(7);
  });
});
