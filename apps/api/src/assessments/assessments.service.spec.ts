import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { AssessmentsService } from './assessments.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../gemini/gemini.service';
import {
  AssessmentAttemptStatus,
  BloomTaxonomyLevel,
  DifficultyLevel,
  Prisma,
} from '@prisma/client';

const mockPrisma = {
  subject: {
    findUnique: jest.fn(),
  },
  assessment: {
    create: jest.fn(),
  },
  assessmentAttempt: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
  assessmentAnswer: {
    createMany: jest.fn(),
  },
  $transaction: jest.fn((callback) => callback(mockPrisma)),
};

const mockGemini = {
  generateQuestions: jest.fn(),
  generateContentWithFallback: jest.fn(),
};

describe('AssessmentsService', () => {
  let service: AssessmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AssessmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeminiService, useValue: mockGemini },
      ],
    }).compile();

    service = module.get<AssessmentsService>(AssessmentsService);
    jest.clearAllMocks();
  });

  describe('generateAssessment', () => {
    const studentId = 'student-123';
    const dto = {
      subjectId: 'subject-1',
      difficultyLevel: DifficultyLevel.MEDIUM,
    };

    it('should throw NotFoundException if subject does not exist', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue(null);

      await expect(service.generateAssessment(studentId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should generate 5 questions, create assessment & attempt, and return questions without answers', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'subject-1',
        name: 'الرياضيات',
        branch: { name: 'علمي' },
      });

      const fakeGenerated = Array.from({ length: 5 }, (_, i) => ({
        questionText: `سؤال ${i + 1}`,
        choices: [
          { label: 'A', text: 'أ' },
          { label: 'B', text: 'ب' },
          { label: 'C', text: 'ج' },
          { label: 'D', text: 'د' },
        ],
        correctAnswer: 'A',
        explanation: `شرح ${i + 1}`,
        bloomTaxonomy: 'APPLY',
      }));
      mockGemini.generateQuestions.mockResolvedValue(fakeGenerated);

      const fakeAssessment = {
        id: 'assessment-1',
        title: 'اختبار تقييم قدرات: الرياضيات',
        subjectId: 'subject-1',
        difficultyLevel: DifficultyLevel.MEDIUM,
        createdAt: new Date(),
        updatedAt: new Date(),
        subject: { id: 'subject-1', name: 'الرياضيات' },
        questions: fakeGenerated.map((q, idx) => ({
          id: `q-${idx + 1}`,
          assessmentId: 'assessment-1',
          questionText: q.questionText,
          options: q.choices,
          correctAnswer: q.correctAnswer,
          bloomTaxonomyLevel: BloomTaxonomyLevel.APPLY,
          explanation: q.explanation,
          createdAt: new Date(),
        })),
      };

      const fakeAttempt = {
        id: 'attempt-1',
        userId: studentId,
        assessmentId: 'assessment-1',
        status: AssessmentAttemptStatus.PENDING,
        startedAt: new Date(),
      };

      mockPrisma.assessment.create.mockResolvedValue(fakeAssessment);
      mockPrisma.assessmentAttempt.create.mockResolvedValue(fakeAttempt);

      const result = await service.generateAssessment(studentId, dto);

      expect(mockGemini.generateQuestions).toHaveBeenCalledWith(
        expect.stringContaining('الرياضيات'),
        5,
      );
      expect(result.attemptId).toBe('attempt-1');
      expect(result.assessment.questions).toHaveLength(5);
      // Ensure correctAnswer and explanation are stripped
      result.assessment.questions.forEach((q: any) => {
        expect(q.correctAnswer).toBeUndefined();
        expect(q.explanation).toBeUndefined();
      });
    });
  });

  describe('getAttempt', () => {
    const studentId = 'student-123';
    const attemptId = 'attempt-1';

    it('should throw NotFoundException if attempt is not found', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue(null);

      await expect(service.getAttempt(studentId, attemptId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if attempt belongs to another student', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: attemptId,
        userId: 'other-student',
      });

      await expect(service.getAttempt(studentId, attemptId)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should redact correctAnswer and explanation when status is PENDING', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: attemptId,
        userId: studentId,
        assessmentId: 'assessment-1',
        score: null,
        status: AssessmentAttemptStatus.PENDING,
        aiFeedback: null,
        startedAt: new Date(),
        completedAt: null,
        assessment: {
          id: 'assessment-1',
          title: 'اختبار تقييم قدرات',
          subjectId: 'sub-1',
          difficultyLevel: DifficultyLevel.MEDIUM,
          createdAt: new Date(),
          updatedAt: new Date(),
          subject: { id: 'sub-1', name: 'فيزياء' },
          questions: [
            {
              id: 'q-1',
              assessmentId: 'assessment-1',
              questionText: 'ما هي وحدة قياس القوة؟',
              options: [{ label: 'A', text: 'نيوتن' }],
              correctAnswer: 'A',
              explanation: 'نيوتن هي الوحدة الدولية',
              bloomTaxonomyLevel: BloomTaxonomyLevel.REMEMBER,
              createdAt: new Date(),
            },
          ],
        },
        answers: [],
      });

      const result = await service.getAttempt(studentId, attemptId);

      expect(result.status).toBe(AssessmentAttemptStatus.PENDING);
      expect(result.assessment.questions[0].correctAnswer).toBeUndefined();
      expect(result.assessment.questions[0].explanation).toBeUndefined();
    });

    it('should reveal correctAnswer, explanation, and score when status is COMPLETED', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: attemptId,
        userId: studentId,
        assessmentId: 'assessment-1',
        score: 100,
        status: AssessmentAttemptStatus.COMPLETED,
        aiFeedback: 'أداء ممتاز',
        startedAt: new Date(),
        completedAt: new Date(),
        assessment: {
          id: 'assessment-1',
          title: 'اختبار تقييم قدرات',
          subjectId: 'sub-1',
          difficultyLevel: DifficultyLevel.MEDIUM,
          createdAt: new Date(),
          updatedAt: new Date(),
          subject: { id: 'sub-1', name: 'فيزياء' },
          questions: [
            {
              id: 'q-1',
              assessmentId: 'assessment-1',
              questionText: 'ما هي وحدة قياس القوة؟',
              options: [{ label: 'A', text: 'نيوتن' }],
              correctAnswer: 'A',
              explanation: 'نيوتن هي الوحدة الدولية',
              bloomTaxonomyLevel: BloomTaxonomyLevel.REMEMBER,
              createdAt: new Date(),
            },
          ],
        },
        answers: [
          {
            id: 'ans-1',
            questionId: 'q-1',
            studentAnswer: 'A',
            isCorrect: true,
            createdAt: new Date(),
            question: {
              correctAnswer: 'A',
              explanation: 'نيوتن هي الوحدة الدولية',
              bloomTaxonomyLevel: BloomTaxonomyLevel.REMEMBER,
            },
          },
        ],
      });

      const result = await service.getAttempt(studentId, attemptId);

      expect(result.status).toBe(AssessmentAttemptStatus.COMPLETED);
      expect(result.assessment.questions[0].correctAnswer).toBe('A');
      expect(result.assessment.questions[0].explanation).toBe(
        'نيوتن هي الوحدة الدولية',
      );
      expect(result.answers).toHaveLength(1);
      expect(result.answers[0].isCorrect).toBe(true);
    });
  });

  describe('submitAssessment', () => {
    const studentId = 'student-123';
    const attemptId = 'attempt-1';

    it('should throw BadRequestException if attempt is already COMPLETED', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: attemptId,
        userId: studentId,
        status: AssessmentAttemptStatus.COMPLETED,
        assessment: { questions: [] },
      });

      await expect(
        service.submitAssessment(studentId, attemptId, { answers: [] }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate score, generate AI feedback, and complete attempt in a transaction', async () => {
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: attemptId,
        userId: studentId,
        status: AssessmentAttemptStatus.PENDING,
        assessment: {
          id: 'assessment-1',
          subject: { id: 'sub-1', name: 'كيمياء' },
          difficultyLevel: DifficultyLevel.MEDIUM,
          questions: [
            {
              id: 'q-1',
              questionText: 'سؤال 1',
              correctAnswer: 'A',
              explanation: 'شرح 1',
              bloomTaxonomyLevel: BloomTaxonomyLevel.REMEMBER,
            },
            {
              id: 'q-2',
              questionText: 'سؤال 2',
              correctAnswer: 'B',
              explanation: 'شرح 2',
              bloomTaxonomyLevel: BloomTaxonomyLevel.APPLY,
            },
          ],
        },
      });

      mockGemini.generateContentWithFallback.mockResolvedValue({
        text: '### تقرير التشخيص الذكي\nنقاط القوة: حفظ المفاهيم\nنقاط الضعف: التطبيق الحسابي',
      });

      const submissionDto = {
        answers: [
          { questionId: 'q-1', answer: 'A' }, // correct
          { questionId: 'q-2', answer: 'C' }, // incorrect
        ],
      };

      mockPrisma.assessmentAttempt.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.submitAssessment(
        studentId,
        attemptId,
        submissionDto,
      );

      expect(result.score).toBe(50);
      expect(result.correctCount).toBe(1);
      expect(result.totalQuestions).toBe(2);
      expect(result.status).toBe(AssessmentAttemptStatus.COMPLETED);
      expect(result.aiFeedback).toContain('تقرير التشخيص الذكي');
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(mockPrisma.assessmentAttempt.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: attemptId, status: AssessmentAttemptStatus.PENDING },
          data: expect.objectContaining({
            score: 50,
            status: AssessmentAttemptStatus.COMPLETED,
          }),
        }),
      );
      expect(mockPrisma.assessmentAnswer.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            questionId: 'q-1',
            studentAnswer: 'A',
            isCorrect: true,
          }),
          expect.objectContaining({
            questionId: 'q-2',
            studentAnswer: 'C',
            isCorrect: false,
          }),
        ]),
      });
    });

    it('should throw BadRequestException if attempt was already completed concurrently (updateMany returns 0)', async () => {
      const studentId = 'student-1';
      const attemptId = 'attempt-1';
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: attemptId,
        userId: studentId,
        status: AssessmentAttemptStatus.PENDING,
        assessment: {
          difficultyLevel: DifficultyLevel.EASY,
          subject: { name: 'رياضيات' },
          questions: [
            {
              id: 'q-1',
              questionText: 'سؤال',
              correctAnswer: 'A',
              bloomTaxonomyLevel: BloomTaxonomyLevel.REMEMBER,
            },
          ],
        },
      });

      mockGemini.generateContentWithFallback.mockResolvedValue({
        text: '### تقرير التشخيص الذكي\nنقاط القوة: حفظ المفاهيم\nنقاط الضعف: التطبيق الحسابي',
      });

      mockPrisma.assessmentAttempt.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.submitAssessment(studentId, attemptId, {
          answers: [{ questionId: 'q-1', answer: 'A' }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if duplicate answers violate unique constraint (P2002 race condition)', async () => {
      const studentId = 'student-1';
      const attemptId = 'attempt-1';
      mockPrisma.assessmentAttempt.findUnique.mockResolvedValue({
        id: attemptId,
        userId: studentId,
        status: AssessmentAttemptStatus.PENDING,
        assessment: {
          difficultyLevel: DifficultyLevel.EASY,
          subject: { name: 'رياضيات' },
          questions: [
            {
              id: 'q-1',
              questionText: 'سؤال',
              correctAnswer: 'A',
              bloomTaxonomyLevel: BloomTaxonomyLevel.REMEMBER,
            },
          ],
        },
      });

      mockPrisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
        }),
      );

      await expect(
        service.submitAssessment(studentId, attemptId, {
          answers: [{ questionId: 'q-1', answer: 'A' }],
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getHistory', () => {
    it('should return paginated attempts list', async () => {
      mockPrisma.assessmentAttempt.count.mockResolvedValue(1);
      mockPrisma.assessmentAttempt.findMany.mockResolvedValue([
        {
          id: 'att-1',
          assessmentId: 'ass-1',
          score: 80,
          status: AssessmentAttemptStatus.COMPLETED,
          startedAt: new Date(),
          completedAt: new Date(),
          assessment: {
            title: 'تقييم كيمياء',
            difficultyLevel: DifficultyLevel.MEDIUM,
            subject: { id: 'sub-1', name: 'كيمياء' },
          },
        },
      ]);

      const result = await service.getHistory('student-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.totalPages).toBe(1);
      expect(result.data[0].title).toBe('تقييم كيمياء');
    });
  });
});
