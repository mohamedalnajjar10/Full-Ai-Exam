import { Test, TestingModule } from '@nestjs/testing';
import { EmbeddingProcessor } from './embedding.processor';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';

describe('EmbeddingProcessor', () => {
  let processor: EmbeddingProcessor;
  let prisma: any;
  let gemini: any;

  beforeEach(async () => {
    prisma = {
      examBankQuestion: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    gemini = {
      generateEmbedding: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiService, useValue: gemini },
      ],
    }).compile();

    processor = module.get<EmbeddingProcessor>(EmbeddingProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should generate 768d vector and update exam bank question to INDEXED', async () => {
    const mockQuestion = {
      id: 'bank-q-1',
      questionText: 'What is momentum?',
      explanation: '$p = mv$',
      deletedAt: null,
    };

    prisma.examBankQuestion.findUnique.mockResolvedValue(mockQuestion);
    gemini.generateEmbedding.mockResolvedValue(new Array(768).fill(0.5));
    prisma.examBankQuestion.update.mockResolvedValue({ id: 'bank-q-1' });

    const mockJob = {
      data: { bankQuestionId: 'bank-q-1' },
      attemptsMade: 0,
    } as any;

    await processor.process(mockJob);

    expect(gemini.generateEmbedding).toHaveBeenCalledWith(
      'What is momentum?\n\n$p = mv$',
    );
    expect(prisma.examBankQuestion.update).toHaveBeenCalledWith({
      where: { id: 'bank-q-1' },
      data: {
        embedding: expect.any(Array),
        embeddingStatus: 'INDEXED',
      },
    });
  });
});
