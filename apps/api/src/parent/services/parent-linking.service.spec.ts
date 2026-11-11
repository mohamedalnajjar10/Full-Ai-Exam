import { ParentLinkingService } from './parent-linking.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Role } from '@prisma/client';
import { BadRequestException, ConflictException } from '@nestjs/common';

describe('ParentLinkingService', () => {
  let service: ParentLinkingService;
  let mockPrisma: any;
  let mockConfig: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      parentStudentLink: {
        upsert: jest.fn(),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      studentActivityEvent: {
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      assessmentAttempt: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({
          _count: { id: 0 },
          _avg: { score: null },
          _max: { score: null },
        }),
      },
      generatedQuestion: {
        count: jest.fn().mockResolvedValue(0),
      },
    };

    mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'FRONTEND_URL') return 'https://masar.local';
        return null;
      }),
    };

    service = new ParentLinkingService(mockPrisma, mockConfig);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createLink', () => {
    it('creates a new parent account and link when phone is not registered', async () => {
      const studentId = 'student-uuid-1';
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id === studentId) {
            return Promise.resolve({
              id: studentId,
              name: 'سالم أحمد',
              email: 'salem@masar.local',
              role: Role.STUDENT,
            });
          }
          if (where.email === 'parent.970591234567@family.masar.local') {
            return Promise.resolve(null); // Parent does not exist yet
          }
          return Promise.resolve(null);
        },
      );

      mockPrisma.user.create.mockResolvedValue({
        id: 'parent-uuid-1',
        name: 'أحمد سالم',
        email: 'parent.970591234567@family.masar.local',
        role: Role.PARENT,
        emailVerified: true,
      });

      mockPrisma.parentStudentLink.upsert.mockResolvedValue({
        id: 'link-uuid-1',
        studentId,
        parentId: 'parent-uuid-1',
        parentPhone: '+970591234567',
        status: 'ACTIVE',
      });

      const result = await service.createLink(studentId, {
        parentName: 'أحمد سالم',
        parentPhone: '0591234567',
      });

      expect(result.linkId).toBe('link-uuid-1');
      expect(result.parentId).toBe('parent-uuid-1');
      expect(result.pin).toMatch(/^\d{6}$/);
      expect(result.magicToken).toMatch(/^[0-9a-f]{64}$/);
      expect(result.whatsappLink).toContain('https://wa.me/970591234567?text=');
      expect(result.qrData).toBe(result.magicToken);
      expect(result.magicLoginLink).toContain('/parent/magic-login?token=');
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'parent.970591234567@family.masar.local',
          name: 'أحمد سالم',
          role: Role.PARENT,
          emailVerified: true,
        },
      });
    });

    it('reuses existing parent account if phone is already registered as PARENT', async () => {
      const studentId = 'student-uuid-2';
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id === studentId) {
            return Promise.resolve({
              id: studentId,
              name: 'منى أحمد',
              email: 'mona@masar.local',
              role: Role.STUDENT,
            });
          }
          if (where.email === 'parent.970591234567@family.masar.local') {
            return Promise.resolve({
              id: 'parent-uuid-existing',
              name: 'أحمد سالم',
              email: 'parent.970591234567@family.masar.local',
              role: Role.PARENT,
            });
          }
          return Promise.resolve(null);
        },
      );

      mockPrisma.parentStudentLink.upsert.mockResolvedValue({
        id: 'link-uuid-2',
        studentId,
        parentId: 'parent-uuid-existing',
        parentPhone: '+970591234567',
        status: 'ACTIVE',
      });

      const result = await service.createLink(studentId, {
        parentName: 'أحمد سالم',
        parentPhone: '+970591234567',
      });

      expect(mockPrisma.user.create).not.toHaveBeenCalled();
      expect(result.parentId).toBe('parent-uuid-existing');
    });

    it('SEC-01: does not overwrite parent profile name if it was already set', async () => {
      const studentId = 'student-uuid-attacker';
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id === studentId) {
            return Promise.resolve({
              id: studentId,
              name: 'طالب مهاجم',
              email: 'attacker@masar.local',
              role: Role.STUDENT,
            });
          }
          if (where.email === 'parent.970591234567@family.masar.local') {
            return Promise.resolve({
              id: 'parent-victim',
              name: 'الاسم الحقيقي الأصلي لولي الأمر',
              email: 'parent.970591234567@family.masar.local',
              role: Role.PARENT,
            });
          }
          return Promise.resolve(null);
        },
      );

      mockPrisma.parentStudentLink.findUnique.mockResolvedValue(null);
      mockPrisma.parentStudentLink.upsert.mockResolvedValue({
        id: 'link-uuid-new',
        studentId,
        parentId: 'parent-victim',
        status: 'PENDING',
      });

      await service.createLink(studentId, {
        parentName: 'اسم مزيف يحاول تجاوزه',
        parentPhone: '+970591234567',
      });

      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects attempt if phone is registered under another non-parent role', async () => {
      const studentId = 'student-uuid-3';
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id === studentId) {
            return Promise.resolve({
              id: studentId,
              email: 'student@masar.local',
              role: Role.STUDENT,
            });
          }
          if (where.email === 'parent.970591234567@family.masar.local') {
            return Promise.resolve({
              id: 'admin-uuid',
              email: 'parent.970591234567@family.masar.local',
              role: Role.ADMIN, // not a parent
            });
          }
          return Promise.resolve(null);
        },
      );

      await expect(
        service.createLink(studentId, {
          parentName: 'Admin Guy',
          parentPhone: '0591234567',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects student attempting to link their own email/phone (IDOR defense)', async () => {
      const studentId = 'student-uuid-4';
      mockPrisma.user.findUnique.mockResolvedValue({
        id: studentId,
        email: 'parent.970591234567@family.masar.local',
        role: Role.STUDENT,
      });

      await expect(
        service.createLink(studentId, {
          parentName: 'Me As Parent',
          parentPhone: '0591234567',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects attempt to re-link when link is already ACTIVE (ConflictException)', async () => {
      const studentId = 'student-uuid-active';
      mockPrisma.user.findUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id === studentId) {
            return Promise.resolve({
              id: studentId,
              email: 'student@masar.local',
              role: Role.STUDENT,
            });
          }
          if (where.email === 'parent.970591234567@family.masar.local') {
            return Promise.resolve({
              id: 'parent-uuid-active',
              name: 'ولي أمر موجود',
              email: 'parent.970591234567@family.masar.local',
              role: Role.PARENT,
            });
          }
          return Promise.resolve(null);
        },
      );

      mockPrisma.parentStudentLink.findUnique.mockResolvedValue({
        id: 'link-already-active',
        studentId,
        parentId: 'parent-uuid-active',
        status: 'ACTIVE',
      });

      await expect(
        service.createLink(studentId, {
          parentName: 'Parent Guy',
          parentPhone: '0591234567',
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.parentStudentLink.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getChildOverview', () => {
    it('returns zero, empty arrays, and null AI recommendation when there is no real student data', async () => {
      const parentId = 'parent-1';
      const studentId = 'student-new';

      mockPrisma.parentStudentLink.findFirst.mockResolvedValue({
        id: 'link-1',
        parentId,
        studentId,
        status: 'ACTIVE',
        student: {
          id: studentId,
          name: 'خالد محمد',
          email: 'khaled@masar.local',
          avatar: null,
          branch: { id: 'branch-sci', name: 'الفرع العلمي' },
          lastActiveAt: null,
        },
      });

      // No activity events today
      mockPrisma.studentActivityEvent.count.mockResolvedValue(0);
      mockPrisma.studentActivityEvent.findFirst.mockResolvedValue(null);
      // No assessment attempts today or ever
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([]);
      // No generated questions today
      mockPrisma.generatedQuestion.count.mockResolvedValue(0);
      // No quiz events or recent events
      mockPrisma.studentActivityEvent.findMany.mockResolvedValue([]);

      const result = await service.getChildOverview(parentId, studentId);

      expect(result.todayKpis).toEqual({
        activitiesCount: 0,
        studyStartTime: 'لم يبدأ الدراسة اليوم بعد',
        hasStartedToday: false,
        questionsSolved: 0,
        questionsGenerated: 0,
        accuracyRate: 0,
        cognitiveScore: 0,
        cognitiveLevel: 'قيد التقييم',
        assessmentsCount: 0,
        planDoneTasks: 0,
        planTotalTasks: 5,
        planProgressPercentage: 0,
      });
      expect(result.aiRecommendation).toBeNull();
      expect(result.subjectCapabilities).toEqual([]);
      expect(result.notifications).toEqual([]);
      expect(mockPrisma.studentActivityEvent.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId,
            eventType: { not: 'PARENT_LINKED' },
          }),
        }),
      );
      expect(mockPrisma.studentActivityEvent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            studentId,
            eventType: { not: 'PARENT_LINKED' },
          }),
        }),
      );
    });

    it('returns real computed values when real assessment and quiz data exist', async () => {
      const parentId = 'parent-1';
      const studentId = 'student-active';

      mockPrisma.parentStudentLink.findFirst.mockResolvedValue({
        id: 'link-1',
        parentId,
        studentId,
        status: 'ACTIVE',
        student: {
          id: studentId,
          name: 'أحمد علي',
          email: 'ahmed@masar.local',
          avatar: null,
          branch: { id: 'branch-sci', name: 'الفرع العلمي' },
          lastActiveAt: new Date(),
        },
      });

      // 2 events today
      mockPrisma.studentActivityEvent.count.mockResolvedValue(2);
      mockPrisma.studentActivityEvent.findFirst.mockResolvedValue({
        id: 'ev-1',
        createdAt: new Date('2026-10-18T08:30:00Z'),
      });
      // 1 attempt completed today with 5 answers, 4 correct (80% accuracy)
      const mockAttempt = {
        id: 'att-1',
        score: 80,
        completedAt: new Date(),
        assessment: {
          subject: { id: 'math-id', name: 'الرياضيات' },
        },
        answers: [
          { isCorrect: true },
          { isCorrect: true },
          { isCorrect: true },
          { isCorrect: true },
          { isCorrect: false },
        ],
      };

      mockPrisma.assessmentAttempt.findMany.mockImplementation(
        ({ where }: any) => {
          if (where?.completedAt) return Promise.resolve([mockAttempt]);
          if (where?.status === 'COMPLETED' && where?.userId)
            return Promise.resolve([mockAttempt]);
          return Promise.resolve([]);
        },
      );

      mockPrisma.generatedQuestion.count.mockResolvedValue(0);
      mockPrisma.studentActivityEvent.findMany.mockImplementation(
        ({ where }: any) => {
          if (where?.eventType === 'QUIZ_COMPLETED') return Promise.resolve([]);
          return Promise.resolve([
            {
              id: 'ev-completed',
              eventType: 'ASSESSMENT_COMPLETED',
              title: 'إنهاء اختبار قدرات',
              metadata: { score: 80, subjectName: 'الرياضيات' },
              createdAt: new Date(),
            },
          ]);
        },
      );

      const result = await service.getChildOverview(parentId, studentId);

      expect(result.todayKpis.activitiesCount).toBe(2);
      expect(result.todayKpis.questionsSolved).toBe(5);
      expect(result.todayKpis.questionsGenerated).toBe(0);
      expect(result.todayKpis.accuracyRate).toBe(80);
      expect(result.todayKpis.cognitiveScore).toBe(80);
      expect(result.todayKpis.cognitiveLevel).toBe('متقدم');
      expect(result.todayKpis.assessmentsCount).toBe(1);
      expect(result.todayKpis.planDoneTasks).toBe(3); // totalActivities>=1 (1), todayAttempts>=1 (1), accuracyRate>=70 with answers>0 (1)

      expect(result.subjectCapabilities).toHaveLength(1);
      expect(result.subjectCapabilities[0].subjectName).toBe('الرياضيات');
      expect(result.subjectCapabilities[0].score).toBe(80);

      expect(result.aiRecommendation).not.toBeNull();
      expect(result.aiRecommendation?.strengthPoint?.subject).toBe('الرياضيات');

      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].title).toContain('الرياضيات');
    });

    it('does not count generated questions as solved and does not complete 10-question daily plan goal from generation', async () => {
      const parentId = 'parent-1';
      const studentId = 'student-active';

      mockPrisma.parentStudentLink.findFirst.mockResolvedValue({
        id: 'link-1',
        parentId,
        studentId,
        status: 'ACTIVE',
        student: {
          id: studentId,
          name: 'سارة خالد',
          email: 'sara@masar.local',
          avatar: null,
          branch: { id: 'branch-sci', name: 'الفرع العلمي' },
          lastActiveAt: new Date(),
        },
      });

      mockPrisma.studentActivityEvent.count.mockResolvedValue(0);
      mockPrisma.studentActivityEvent.findFirst.mockResolvedValue(null);
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([]);
      // 15 questions generated today without answering them
      mockPrisma.generatedQuestion.count.mockResolvedValue(15);
      mockPrisma.studentActivityEvent.findMany.mockResolvedValue([]);

      const result = await service.getChildOverview(parentId, studentId);

      expect(result.todayKpis.questionsSolved).toBe(0);
      expect(result.todayKpis.questionsGenerated).toBe(15);
      // 10-question daily plan task is NOT completed because 0 questions were solved
      expect(result.todayKpis.planDoneTasks).toBe(0);
    });
  });
});
