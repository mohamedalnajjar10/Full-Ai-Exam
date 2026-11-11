import { AdminSystemService } from './admin-system.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';

describe('AdminSystemService', () => {
  let service: AdminSystemService;
  let mockPrisma: any;
  let mockRedis: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      appSetting: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.key === 'ai_task_routes') {
            return Promise.resolve({
              key: 'ai_task_routes',
              value: [
                {
                  task: 'generation',
                  label: 'توليد الأسئلة',
                  description: 'توليد اختياري',
                  model: 'google/gemini-2.5-flash',
                  temperature: 0.7,
                  maxTokens: 4000,
                  needs: ['structured'],
                },
              ],
            });
          }
          if (where.key === 'platform_settings') {
            return Promise.resolve({
              key: 'platform_settings',
              value: {
                general: { siteName: 'مسار التميز' },
              },
            });
          }
          return Promise.resolve(null);
        }),
        upsert: jest.fn().mockImplementation(({ create }: any) => Promise.resolve(create)),
      },
      $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]),
      examFile: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockImplementation(({ where }: any) => {
          if (where?.status === 'FAILED') return Promise.resolve(0);
          return Promise.resolve(5);
        }),
      },
      knowledgeDocument: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      knowledgeChunk: {
        count: jest.fn().mockResolvedValue(25),
      },
      aiUsageLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      studentActivityEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'ev-1',
            createdAt: new Date(),
            student: { name: 'طالب تجريبي', email: 'student@example.com', role: 'STUDENT' },
            eventType: 'QUIZ_SUBMITTED',
            title: 'تسليم كويز الكيمياء',
            metadata: { subjectName: 'الكيمياء' },
          },
        ]),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockRedis = {
      set: jest.fn().mockResolvedValue('OK'),
    };

    mockConfig = {
      get: jest.fn().mockReturnValue('test-bucket'),
    };

    service = new AdminSystemService(
      mockPrisma as unknown as PrismaService,
      mockRedis as unknown as RedisService,
      mockConfig as unknown as ConfigService,
    );
  });

  it('should return AI config including routes, catalog, and guardrails', async () => {
    const config = await service.getAiConfig();
    expect(config).toBeDefined();
    expect(config.catalog.length).toBeGreaterThan(0);
    expect(config.routes).toBeDefined();
    expect(config.guardrails).toBeDefined();
    expect(config.prompts.length).toBeGreaterThan(0);
  });

  it('should save AI routes and return updated routes', async () => {
    const routes = [
      {
        task: 'generation',
        label: 'توليد الأسئلة',
        description: 'وصف جديد',
        model: 'google/gemini-2.5-flash',
        temperature: 0.5,
        maxTokens: 2000,
        needs: ['structured' as const],
      },
    ];
    const res = await service.saveAiRoutes(routes, 'admin@example.com');
    expect(res.success).toBe(true);
    expect(mockPrisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'ai_task_routes' } }),
    );
  });

  it('should return platform settings and allow saving them', async () => {
    const settings = await service.getPlatformSettings();
    expect(settings).toBeDefined();
    expect((settings as any).general.siteName).toBe('مسار التميز');

    const updateRes = await service.savePlatformSettings({ general: { siteName: 'مسار جديد' } }, 'admin@example.com');
    expect(updateRes.success).toBe(true);
    expect(mockPrisma.appSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'platform_settings' } }),
    );
  });

  it('should return health diagnostics with database, redis, queues and services', async () => {
    const health = await service.getHealthDiagnostics();
    expect(health).toBeDefined();
    expect(health.services.length).toBe(4);
    expect(health.queues.length).toBe(3);
    expect(health.overall).toBe('ok');
  });

  it('should return audit logs mapped correctly', async () => {
    const logs = await service.getAuditLogs('طالب', 'all', 7);
    expect(logs).toBeDefined();
    expect(logs.length).toBe(1);
    expect(logs[0].actor).toBe('طالب تجريبي');
  });
});
