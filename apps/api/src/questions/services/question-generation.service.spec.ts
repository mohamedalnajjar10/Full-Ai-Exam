import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { QuestionGenerationService } from './question-generation.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';
import { GenerationPromptBuilder } from '../builders/generation-prompt.builder';
import { DifficultyLevel, BloomTaxonomyLevel } from '@prisma/client';
import { KnowledgeRetrievalService } from '../../knowledge/services/knowledge-retrieval.service';

const mockPrisma = {
  subject: {
    findUnique: jest.fn(),
  },
  examBankQuestion: {
    findMany: jest.fn(),
    updateMany: jest.fn(),
  },
  generatedQuestion: {
    create: jest.fn(),
  },
  studentActivityEvent: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  $queryRawUnsafe: jest.fn(),
};

const mockGemini = {
  generateEmbedding: jest.fn(),
  generateQuestions: jest.fn(),
};

const mockRetrieval = {
  search: jest.fn(),
};

const mockPromptBuilder = {
  buildBankRagPrompt: jest.fn(),
};

describe('QuestionGenerationService', () => {
  let service: QuestionGenerationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionGenerationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeminiService, useValue: mockGemini },
        { provide: GenerationPromptBuilder, useValue: mockPromptBuilder },
        { provide: KnowledgeRetrievalService, useValue: mockRetrieval },
      ],
    }).compile();

    service = module.get<QuestionGenerationService>(QuestionGenerationService);
    jest.clearAllMocks();
    // بدون كتاب مفهرس افتراضياً — الاختبارات القديمة بتفحص مسار البنك
    mockRetrieval.search.mockResolvedValue([]);
  });

  describe('generateFromBank', () => {
    const dto = {
      subjectId: 'sub-1',
      topicId: 'algebra',
      difficulty: DifficultyLevel.MEDIUM,
      bloomTaxonomy: BloomTaxonomyLevel.APPLY,
      count: 2,
    };

    it('should throw NotFoundException if subject does not exist', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue(null);

      await expect(service.generateFromBank('student-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if zero reference questions are found in the exam bank', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Mathematics',
        branch: { name: 'Scientific' },
      });
      mockGemini.generateEmbedding.mockResolvedValue([]);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ exists: false }]);
      mockPrisma.examBankQuestion.findMany.mockResolvedValue([]); // zero anchors

      await expect(service.generateFromBank('student-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('grounds generation on textbook passages when the bank is empty', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Math',
      });
      mockGemini.generateEmbedding.mockResolvedValue([]);
      mockPrisma.$queryRawUnsafe.mockResolvedValue([{ exists: false }]);
      mockPrisma.examBankQuestion.findMany.mockResolvedValue([]);
      const passage = {
        id: 'ch-1',
        section: 'الوحدة 1',
        pageStart: 3,
        pageEnd: 3,
        text: 'نص',
        documentId: 'd',
        unit: 'الوحدة 1',
        score: 1,
        vectorRank: 1,
        keywordRank: null,
      };
      mockRetrieval.search.mockResolvedValue([passage]);
      mockPromptBuilder.buildBankRagPrompt.mockReturnValue('prompt');
      mockGemini.generateQuestions.mockResolvedValue([
        {
          questionText: 'q',
          choices: [{ label: 'A', text: '1' }],
          correctAnswer: 'A',
          explanation: 'e',
          bloomTaxonomy: 'APPLY',
        },
      ]);
      mockPrisma.generatedQuestion.create.mockResolvedValue({ id: 'gen-1' });

      await service.generateFromBank('student-1', dto);

      expect(mockPromptBuilder.buildBankRagPrompt).toHaveBeenCalledWith(
        [],
        expect.anything(),
        'algebra',
        'MEDIUM',
        'APPLY',
        2,
        [passage],
      );
      expect(mockPrisma.generatedQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            referenceMetadata: {
              bankQuestionIds: [],
              textbookChunkIds: ['ch-1'],
            },
          }),
        }),
      );
      // ما في أسئلة بنك انستعملت — ما في داعي نحدّث العدّاد
      expect(mockPrisma.examBankQuestion.updateMany).not.toHaveBeenCalled();
    });

    it('should generate and persist questions via happy path', async () => {
      // Setup mocks
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'Math',
      });
      mockGemini.generateEmbedding.mockResolvedValue(new Array(768).fill(0.1));

      // pgvector query falls back to Prisma (stub $queryRawUnsafe to throw)
      mockPrisma.$queryRawUnsafe.mockRejectedValue(
        new Error('pgvector not available'),
      );
      mockPrisma.examBankQuestion.findMany.mockResolvedValue([
        {
          id: 'bq-1',
          questionText: 'What is 2+2?',
          choices: [
            { label: 'A', text: '3' },
            { label: 'B', text: '4' },
            { label: 'C', text: '5' },
            { label: 'D', text: '6' },
          ],
          correctAnswer: 'B',
          explanation: 'Basic addition',
          bloomTaxonomy: 'REMEMBER',
          difficulty: 'EASY',
          embedding: [0.1],
        },
      ]);

      mockPromptBuilder.buildBankRagPrompt.mockReturnValue('Generated prompt');
      mockGemini.generateQuestions.mockResolvedValue([
        {
          questionText: 'What is 3+3?',
          choices: [
            { label: 'A', text: '5' },
            { label: 'B', text: '6' },
            { label: 'C', text: '7' },
            { label: 'D', text: '8' },
          ],
          correctAnswer: 'B',
          explanation: 'Addition',
          bloomTaxonomy: 'APPLY',
        },
      ]);

      const createdQuestion = {
        id: 'gen-1',
        questionText: 'What is 3+3?',
        choices: [
          { label: 'A', text: '5' },
          { label: 'B', text: '6' },
          { label: 'C', text: '7' },
          { label: 'D', text: '8' },
        ],
        correctAnswer: 'B',
        explanation: 'Addition',
        bloomTaxonomy: 'APPLY',
        difficulty: 'MEDIUM',
        sourceType: 'BANK_RAG',
        referenceMetadata: { bankQuestionIds: ['bq-1'] },
        subjectId: 'sub-1',
        topicId: 'algebra',
        createdAt: new Date(),
      };
      mockPrisma.generatedQuestion.create.mockResolvedValue(createdQuestion);

      const result = await service.generateFromBank('student-1', dto);

      expect(result).toHaveLength(1);
      expect(mockGemini.generateEmbedding).toHaveBeenCalledTimes(1);
      expect(mockPrisma.examBankQuestion.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['bq-1'] } },
        data: { usageCount: { increment: 1 } },
      });
      expect(mockGemini.generateQuestions).toHaveBeenCalledWith(
        'Generated prompt',
        2,
      );
      expect(mockPrisma.generatedQuestion.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId: 'student-1',
            subjectId: 'sub-1',
            sourceType: 'BANK_RAG',
          }),
        }),
      );
    });

    it('should use pgvector retrieval when embedding succeeds', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({ id: 'sub-1' });
      mockGemini.generateEmbedding.mockResolvedValue(new Array(768).fill(0.2));

      const pgRow = {
        id: 'bq-2',
        questionText: 'Complex question',
        choices: [
          { label: 'A', text: 'Option A' },
          { label: 'B', text: 'Option B' },
          { label: 'C', text: 'Option C' },
          { label: 'D', text: 'Option D' },
        ],
        correctAnswer: 'A',
        explanation: 'Explanation',
        bloomTaxonomy: 'APPLY',
        difficulty: 'MEDIUM',
      };
      mockPrisma.$queryRawUnsafe.mockImplementation(async (sql: string) => {
        if (sql.includes('pg_type')) return [{ exists: true }];
        return [pgRow];
      });
      mockPromptBuilder.buildBankRagPrompt.mockReturnValue('prompt');
      mockGemini.generateQuestions.mockResolvedValue([
        {
          questionText: 'Q?',
          choices: [
            { label: 'A', text: 'a' },
            { label: 'B', text: 'b' },
            { label: 'C', text: 'c' },
            { label: 'D', text: 'd' },
          ],
          correctAnswer: 'A',
          explanation: 'e',
          bloomTaxonomy: 'APPLY',
        },
      ]);
      mockPrisma.generatedQuestion.create.mockResolvedValue({ id: 'gen-2' });

      await service.generateFromBank('student-1', { ...dto, count: 1 });

      // pgvector query should have been called
      expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
      // Fallback Prisma findMany should NOT be called since pgvector succeeded
      expect(mockPrisma.examBankQuestion.findMany).not.toHaveBeenCalled();
    });

    it('should safely parameterize pgvector queries against SQL injection attempts', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({ id: 'sub-1' });
      mockGemini.generateEmbedding.mockResolvedValue(new Array(768).fill(0.1));

      const maliciousTopic = "' OR '1'='1'; DROP TABLE \"User\"; --";
      let capturedSql = '';
      let capturedParams: unknown[] = [];

      mockPrisma.$queryRawUnsafe.mockImplementation(
        async (sql: string, ...params: unknown[]) => {
          if (sql.includes('pg_type')) return [{ exists: true }];
          capturedSql = sql;
          capturedParams = params;
          return [
            {
              id: 'bq-safe',
              questionText: 'Safe question',
              choices: [{ label: 'A', text: 'Ans' }],
              correctAnswer: 'A',
              explanation: 'Exp',
              bloomTaxonomy: 'APPLY',
              difficulty: 'MEDIUM',
            },
          ];
        },
      );

      mockPromptBuilder.buildBankRagPrompt.mockReturnValue('safe prompt');
      mockGemini.generateQuestions.mockResolvedValue([
        {
          questionText: 'Generated safe?',
          choices: [{ label: 'A', text: 'Yes' }],
          correctAnswer: 'A',
          explanation: 'Valid',
          bloomTaxonomy: 'APPLY',
        },
      ]);
      mockPrisma.generatedQuestion.create.mockResolvedValue({ id: 'gen-safe' });

      await service.generateFromBank('student-1', {
        ...dto,
        topicId: maliciousTopic,
        count: 1,
      });

      // Verification: The SQL string must NOT contain the raw injection string
      expect(capturedSql).not.toContain(maliciousTopic);
      // The SQL string must use parameter placeholders ($1, $2, etc.)
      expect(capturedSql).toContain('$1::vector');
      expect(capturedSql).toContain('"subjectId" = $2');
      expect(capturedSql).toContain('"topicId" = $5');
      // The malicious string must be safely contained in the params array
      expect(capturedParams).toContain(maliciousTopic);
    });

    it('should propagate BadGatewayException when Gemini exhausts retries', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({ id: 'sub-1' });
      mockGemini.generateEmbedding.mockResolvedValue([]);
      mockPrisma.$queryRawUnsafe.mockRejectedValue(new Error('no pgvector'));
      mockPrisma.examBankQuestion.findMany.mockResolvedValue([
        {
          id: 'bq-1',
          questionText: 'Sample Q',
          choices: [{ label: 'A', text: '1' }],
          correctAnswer: 'A',
          explanation: null,
          bloomTaxonomy: 'APPLY',
          difficulty: 'MEDIUM',
          embedding: [],
        },
      ]);
      mockPromptBuilder.buildBankRagPrompt.mockReturnValue('prompt');

      const { BadGatewayException } = await import('@nestjs/common');
      mockGemini.generateQuestions.mockRejectedValue(
        new BadGatewayException('AI failed after retries'),
      );

      await expect(service.generateFromBank('student-1', dto)).rejects.toThrow(
        BadGatewayException,
      );
    });
  });

  describe('submitQuizAttempt', () => {
    const studentId = 'student-1';

    it('throws BadRequestException when correct exceeds total', async () => {
      const invalidDto = {
        subjectId: 'sub-1',
        subjectName: 'فيزياء',
        correct: 50,
        total: 10,
        durationSec: 120,
        source: 'GENERATED' as any,
      };

      await expect(
        service.submitQuizAttempt(studentId, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when subject does not exist', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue(null);

      const invalidDto = {
        subjectId: 'sub-nonexistent',
        subjectName: 'فيزياء',
        correct: 5,
        total: 10,
        durationSec: 120,
        source: 'GENERATED' as any,
      };

      await expect(
        service.submitQuizAttempt(studentId, invalidDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('persists event and calculates scorePercentage correctly when valid', async () => {
      mockPrisma.subject.findUnique.mockResolvedValue({
        id: 'sub-1',
        name: 'فيزياء',
      });

      const validDto = {
        subjectId: 'sub-1',
        subjectName: 'فيزياء',
        correct: 8,
        total: 10,
        durationSec: 120,
        source: 'GENERATED' as any,
        questions: [{ questionText: 'Q1', choices: [], correctAnswer: 'A' }],
        answers: { 'q-1': 'A' },
      };

      const fakeSavedEvent = {
        id: 'event-1',
        studentId,
        eventType: 'QUIZ_COMPLETED',
        title: 'إتمام كويز تفاعلي في فيزياء: 80% (8/10)',
        createdAt: new Date(),
      };
      mockPrisma.studentActivityEvent.create.mockResolvedValue(fakeSavedEvent);

      const result = await service.submitQuizAttempt(studentId, validDto);

      expect(result).toBeDefined();
      expect(result.eventId).toBe('event-1');
      expect(result.score).toBe(80);
      expect(mockPrisma.studentActivityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId,
            eventType: 'QUIZ_COMPLETED',
            metadata: expect.objectContaining({
              score: 80,
              correct: 8,
              total: 10,
              questions: validDto.questions,
              answers: validDto.answers,
            }),
          }),
        }),
      );
    });
  });

  describe('Cloud Sync: getQuizAttempts & DailyPlan', () => {
    const studentId = 'student-1';

    it('retrieves and formats quiz attempts from database', async () => {
      const now = new Date('2026-10-21T01:00:00Z');
      mockPrisma.studentActivityEvent.findMany.mockResolvedValue([
        {
          id: 'ev-1',
          studentId,
          eventType: 'QUIZ_COMPLETED',
          title: 'كويز فيزياء',
          createdAt: now,
          metadata: {
            subjectId: 'sub-1',
            subjectName: 'فيزياء',
            difficulty: 'HARD',
            source: 'GENERATED',
            questions: [{ questionText: 'Q1' }],
            answers: { 'q-1': 'B' },
            correct: 5,
            total: 5,
            durationSec: 180,
          },
        },
      ]);

      const attempts = await service.getQuizAttempts(studentId);

      expect(attempts).toHaveLength(1);
      expect(attempts[0]).toEqual({
        id: 'ev-1',
        subjectId: 'sub-1',
        subjectName: 'فيزياء',
        difficulty: 'HARD',
        source: 'GENERATED',
        questions: [{ questionText: 'Q1' }],
        answers: { 'q-1': 'B' },
        correct: 5,
        total: 5,
        durationSec: 180,
        finishedAt: now.toISOString(),
      });
    });

    it('retrieves empty object when daily plan is not yet stored', async () => {
      mockPrisma.studentActivityEvent.findFirst.mockResolvedValue(null);

      const plan = await service.getDailyPlan(studentId);
      expect(plan).toEqual({});
    });

    it('creates new daily plan state when none exists', async () => {
      mockPrisma.studentActivityEvent.findFirst.mockResolvedValue(null);
      mockPrisma.studentActivityEvent.create.mockResolvedValue({ id: 'dp-1' });

      const planData = { '2026-10-21': { done: ['task-1'], custom: [] } };
      const res = await service.saveDailyPlan(studentId, planData);

      expect(res.success).toBe(true);
      expect(mockPrisma.studentActivityEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            studentId,
            eventType: 'DAILY_PLAN_STATE',
            metadata: planData,
          }),
        }),
      );
    });

    it('updates existing daily plan state if one exists', async () => {
      mockPrisma.studentActivityEvent.findFirst.mockResolvedValue({
        id: 'dp-existing',
      });
      mockPrisma.studentActivityEvent.update.mockResolvedValue({
        id: 'dp-existing',
      });

      const planData = { '2026-10-21': { done: ['task-1', 'task-2'], custom: [] } };
      const res = await service.saveDailyPlan(studentId, planData);

      expect(res.success).toBe(true);
      expect(mockPrisma.studentActivityEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'dp-existing' },
          data: expect.objectContaining({
            metadata: planData,
          }),
        }),
      );
    });
  });
});
