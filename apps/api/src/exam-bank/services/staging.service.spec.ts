import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { StagingService } from './staging.service';
import { PrismaService } from '../../prisma/prisma.service';
import { DifficultyLevel, BloomTaxonomyLevel } from '@prisma/client';

describe('StagingService', () => {
  let service: StagingService;
  let prisma: any;
  let eventEmitter: any;

  beforeEach(async () => {
    prisma = {
      stagedQuestion: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      examBankQuestion: {
        create: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StagingService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<StagingService>(StagingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should atomically approve a staged question and emit QuestionApprovedEvent', async () => {
    prisma.stagedQuestion.findUnique.mockResolvedValue({
      id: 'staged-1',
      examFileId: 'file-1',
      questionText: 'What is $2+2$?',
      choices: [{ label: 'A', text: '4' }],
      correctAnswer: 'A',
      explanation: 'Basic arithmetic',
      status: 'PENDING',
      examFile: {
        branchId: 'b-1',
        subjectId: 's-1',
        year: 2025,
        term: 'First',
      },
    });

    prisma.stagedQuestion.update.mockResolvedValue({
      id: 'staged-1',
      status: 'APPROVED',
    });
    prisma.examBankQuestion.create.mockResolvedValue({
      id: 'bank-q-1',
      questionText: 'What is $2+2$?',
      difficulty: DifficultyLevel.EASY,
      bloomTaxonomy: BloomTaxonomyLevel.REMEMBER,
    });

    const result = await service.approve(
      'staged-1',
      {
        difficulty: DifficultyLevel.EASY,
        bloomTaxonomy: BloomTaxonomyLevel.REMEMBER,
        topicId: 'algebra',
      },
      'reviewer-1',
    );

    expect(result.id).toBe('bank-q-1');
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'question.approved',
      expect.objectContaining({ bankQuestionId: 'bank-q-1' }),
    );
  });

  it('should reject approval if question is not PENDING', async () => {
    prisma.stagedQuestion.findUnique.mockResolvedValue({
      id: 'staged-1',
      status: 'APPROVED',
      examFile: {},
    });

    await expect(
      service.approve(
        'staged-1',
        {
          difficulty: DifficultyLevel.EASY,
          bloomTaxonomy: BloomTaxonomyLevel.REMEMBER,
        },
        'reviewer-1',
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('should reject a staged question', async () => {
    prisma.stagedQuestion.findUnique.mockResolvedValue({
      id: 'staged-1',
      status: 'PENDING',
    });
    prisma.stagedQuestion.update.mockResolvedValue({
      id: 'staged-1',
      status: 'REJECTED',
    });

    const result = await service.reject('staged-1', 'reviewer-1');
    expect(result.status).toBe('REJECTED');
  });
});
