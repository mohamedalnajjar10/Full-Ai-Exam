import { Test, TestingModule } from '@nestjs/testing';
import {
  ParentEventsListener,
  PARENT_NOTIFICATIONS_QUEUE,
} from './parent-events.listener';
import { ParentRealtimeService } from '../services/parent-realtime.service';
import { PrismaService } from '../../prisma/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { ParentLinkStatus } from '@prisma/client';
import {
  STUDENT_EVENTS,
  StudentActivityEventPayload,
} from '../events/student-activity.events';

describe('ParentEventsListener', () => {
  let listener: ParentEventsListener;
  let mockPrisma: any;
  let mockQueue: any;

  beforeEach(async () => {
    mockPrisma = {
      studentActivityEvent: {
        create: jest.fn(),
      },
      parentStudentLink: {
        findMany: jest.fn(),
      },
    };

    mockQueue = {
      add: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentEventsListener,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ParentRealtimeService,
          useValue: { emitStudentEvent: jest.fn() },
        },
        {
          provide: getQueueToken(PARENT_NOTIFICATIONS_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    listener = module.get<ParentEventsListener>(ParentEventsListener);
  });

  it('should be defined', () => {
    expect(listener).toBeDefined();
  });

  describe('handleAssessmentCompleted', () => {
    it('persists event and dispatches notification job to active parent links', async () => {
      const payload: StudentActivityEventPayload = {
        studentId: 'student-1',
        type: 'ASSESSMENT_COMPLETED',
        title: 'إكمال اختبار تقييم قدرات: فيزياء',
        subjectId: 'subject-1',
        metadata: {
          attemptId: 'attempt-1',
          score: 85,
          subjectName: 'فيزياء',
        },
      };

      mockPrisma.studentActivityEvent.create.mockResolvedValue({
        id: 'event-1',
        ...payload,
      });

      mockPrisma.parentStudentLink.findMany.mockResolvedValue([
        { parentId: 'parent-1' },
      ]);

      await listener.handleAssessmentCompleted(payload);

      expect(mockPrisma.studentActivityEvent.create).toHaveBeenCalledWith({
        data: {
          studentId: 'student-1',
          eventType: 'ASSESSMENT_COMPLETED',
          title: payload.title,
          metadata: payload.metadata,
        },
      });

      expect(mockPrisma.parentStudentLink.findMany).toHaveBeenCalledWith({
        where: {
          studentId: 'student-1',
          status: ParentLinkStatus.ACTIVE,
        },
        select: { parentId: true },
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-parent-push-notification',
        expect.objectContaining({
          eventId: 'event-1',
          parentId: 'parent-1',
          studentId: 'student-1',
        }),
        expect.any(Object),
      );
    });

    it('does not throw if database insert fails', async () => {
      mockPrisma.studentActivityEvent.create.mockRejectedValue(
        new Error('DB error'),
      );

      await expect(
        listener.handleAssessmentCompleted({
          studentId: 'student-1',
          type: 'ASSESSMENT_COMPLETED',
          title: 'Test',
        }),
      ).resolves.not.toThrow();
    });
  });

  describe('handleQuestionsGenerated', () => {
    it('persists questions generated activity', async () => {
      const payload: StudentActivityEventPayload = {
        studentId: 'student-1',
        type: 'QUESTIONS_GENERATED',
        title: 'توليد 5 أسئلة',
        subjectId: 'subject-1',
        metadata: { count: 5 },
      };

      await listener.handleQuestionsGenerated(payload);

      expect(mockPrisma.studentActivityEvent.create).toHaveBeenCalledWith({
        data: {
          studentId: 'student-1',
          eventType: 'QUESTIONS_GENERATED',
          title: 'توليد 5 أسئلة',
          metadata: { count: 5 },
        },
      });
    });
  });

  describe('handleChatFileUploaded', () => {
    it('persists file upload activity', async () => {
      const payload: StudentActivityEventPayload = {
        studentId: 'student-1',
        type: 'CHAT_FILE_UPLOADED',
        title: 'رفع ملف محاكاة: exam.pdf',
        subjectId: 'subject-1',
        metadata: { fileName: 'exam.pdf' },
      };

      await listener.handleChatFileUploaded(payload);

      expect(mockPrisma.studentActivityEvent.create).toHaveBeenCalledWith({
        data: {
          studentId: 'student-1',
          eventType: 'CHAT_FILE_UPLOADED',
          title: 'رفع ملف محاكاة: exam.pdf',
          metadata: { fileName: 'exam.pdf' },
        },
      });
    });
  });

  describe('handleChatSessionClosed', () => {
    it('persists session closed activity', async () => {
      const payload: StudentActivityEventPayload = {
        studentId: 'student-1',
        type: 'CHAT_SESSION_CLOSED',
        title: 'إنهاء جلسة مذاكرة',
        subjectId: 'subject-1',
        metadata: { sessionId: 'session-1' },
      };

      await listener.handleChatSessionClosed(payload);

      expect(mockPrisma.studentActivityEvent.create).toHaveBeenCalledWith({
        data: {
          studentId: 'student-1',
          eventType: 'CHAT_SESSION_CLOSED',
          title: 'إنهاء جلسة مذاكرة',
          metadata: { sessionId: 'session-1' },
        },
      });
    });
  });
});
