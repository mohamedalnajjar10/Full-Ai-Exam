import { Test, TestingModule } from '@nestjs/testing';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { DifficultyLevel, Role } from '@prisma/client';
import { QuotaService } from '../usage/quota.service';
import { RedisService } from '../redis/redis.service';

const mockAssessmentsService = {
  generateAssessment: jest.fn(),
  getAttempt: jest.fn(),
  submitAssessment: jest.fn(),
  getHistory: jest.fn(),
};

const mockQuotaService = {
  consume: jest.fn(),
};

const mockRedisService = {
  decrNotBelowZero: jest.fn(),
};

describe('AssessmentsController', () => {
  let controller: AssessmentsController;

  const mockUser: any = {
    id: 'student-1',
    email: 'student@example.com',
    role: Role.STUDENT,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssessmentsController],
      providers: [
        { provide: AssessmentsService, useValue: mockAssessmentsService },
        { provide: QuotaService, useValue: mockQuotaService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    controller = module.get<AssessmentsController>(AssessmentsController);
    jest.clearAllMocks();
  });

  describe('generate', () => {
    it('should delegate to assessmentsService.generateAssessment', async () => {
      const dto = {
        subjectId: 'sub-1',
        difficultyLevel: DifficultyLevel.MEDIUM,
      };
      mockAssessmentsService.generateAssessment.mockResolvedValue({
        assessment: { id: 'ass-1' },
        attemptId: 'att-1',
      });

      const result = await controller.generate(mockUser, dto);

      expect(mockAssessmentsService.generateAssessment).toHaveBeenCalledWith(
        mockUser.id,
        dto,
      );
      expect(result).toEqual({
        assessment: { id: 'ass-1' },
        attemptId: 'att-1',
      });
    });
  });

  describe('getHistory', () => {
    it('should delegate to assessmentsService.getHistory', async () => {
      const query = { page: 1, limit: 10 };
      mockAssessmentsService.getHistory.mockResolvedValue({
        data: [],
        meta: { total: 0, page: 1, limit: 10, totalPages: 0 },
      });

      const result = await controller.getHistory(mockUser, query);

      expect(mockAssessmentsService.getHistory).toHaveBeenCalledWith(
        mockUser.id,
        query,
      );
      expect(result.data).toEqual([]);
    });
  });

  describe('getAttempt', () => {
    it('should delegate to assessmentsService.getAttempt', async () => {
      mockAssessmentsService.getAttempt.mockResolvedValue({ id: 'att-1' });

      const result = await controller.getAttempt(mockUser, 'att-1');

      expect(mockAssessmentsService.getAttempt).toHaveBeenCalledWith(
        mockUser.id,
        'att-1',
      );
      expect(result).toEqual({ id: 'att-1' });
    });
  });

  describe('submit', () => {
    it('should delegate to assessmentsService.submitAssessment', async () => {
      const dto = { answers: [{ questionId: 'q-1', answer: 'A' }] };
      mockAssessmentsService.submitAssessment.mockResolvedValue({
        score: 100,
        status: 'COMPLETED',
      });

      const result = await controller.submit(mockUser, 'att-1', dto);

      expect(mockAssessmentsService.submitAssessment).toHaveBeenCalledWith(
        mockUser.id,
        'att-1',
        dto,
      );
      expect(result.score).toBe(100);
    });
  });
});
