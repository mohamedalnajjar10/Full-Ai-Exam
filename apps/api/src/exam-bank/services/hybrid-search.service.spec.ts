import { Test, TestingModule } from '@nestjs/testing';
import { HybridSearchService } from './hybrid-search.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';
import { DifficultyLevel, BloomTaxonomyLevel } from '@prisma/client';

describe('HybridSearchService', () => {
  let service: HybridSearchService;
  let prisma: any;
  let gemini: any;

  beforeEach(async () => {
    prisma = {
      examBankQuestion: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      $queryRawUnsafe: jest.fn(),
    };

    gemini = {
      generateEmbedding: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HybridSearchService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiService, useValue: gemini },
      ],
    }).compile();

    service = module.get<HybridSearchService>(HybridSearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should use filter-only B-Tree query when query string is omitted', async () => {
    const mockQuestions = [
      {
        id: 'q-1',
        questionText: 'Derive the derivative of $\\sin(x)$',
        difficulty: DifficultyLevel.MEDIUM,
        bloomTaxonomy: BloomTaxonomyLevel.APPLY,
      },
    ];

    prisma.examBankQuestion.findMany.mockResolvedValue(mockQuestions);
    prisma.examBankQuestion.count.mockResolvedValue(1);

    const result = await service.search({
      branchId: 'branch-1',
      difficulty: DifficultyLevel.MEDIUM,
      page: 1,
      limit: 10,
    });

    expect(gemini.generateEmbedding).not.toHaveBeenCalled();
    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('should execute hybrid RRF search fusing vector similarity and keyword search', async () => {
    const queryVector = [0.1, 0.2, 0.3];
    gemini.generateEmbedding.mockResolvedValue(queryVector);

    const mockCandidates = [
      {
        id: 'q-1',
        questionText: 'Calculus derivatives',
        embedding: [0.1, 0.2, 0.3], // Exact match vector
      },
      {
        id: 'q-2',
        questionText: 'Organic chemistry',
        embedding: [-0.1, -0.2, -0.3], // Distant vector
      },
    ];

    prisma.examBankQuestion.findMany.mockResolvedValue(mockCandidates);
    prisma.$queryRawUnsafe.mockResolvedValue([{ id: 'q-1', rank_score: 0.95 }]);

    const result = await service.search({
      query: 'calculus derivatives',
      page: 1,
      limit: 10,
    });

    expect(gemini.generateEmbedding).toHaveBeenCalledWith(
      'calculus derivatives',
      'query',
    );
    expect(result.data).toBeDefined();
    expect(result.data.length).toBeGreaterThan(0);
    // q-1 should rank highest due to combined vector match + keyword match
    expect(result.data[0].id).toBe('q-1');
  });

  // ── regression cover for the bounded-candidate refactor ──
  // The scoring pass used to select every column *including* the 768-float
  // embedding, for every matching row, with no take.
  describe('candidate loading', () => {
    const embedding = (seed: number) =>
      Array.from({ length: 768 }, (_, i) => (i === 0 ? seed : 0));

    const fullRow = (id: string) => ({
      id,
      questionText: `question ${id}`,
      choices: [{ label: 'A', text: 'x' }],
      correctAnswer: 'A',
      explanation: null,
      branchId: 'b1',
      subjectId: 's1',
      year: 2024,
      term: 'FIRST',
      difficulty: DifficultyLevel.EASY,
      bloomTaxonomy: BloomTaxonomyLevel.REMEMBER,
      topicId: null,
      embeddingStatus: 'INDEXED',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    beforeEach(() => {
      gemini.generateEmbedding.mockResolvedValue(embedding(1));
      prisma.$queryRawUnsafe.mockResolvedValue([]);
    });

    it('loads only id+embedding for scoring, and caps the candidate set', async () => {
      prisma.examBankQuestion.findMany
        .mockResolvedValueOnce([{ id: 'q1', embedding: embedding(1) }])
        .mockResolvedValueOnce([fullRow('q1')]);

      await service.search({ query: 'photosynthesis' });

      const scoringCall = prisma.examBankQuestion.findMany.mock.calls[0][0];
      expect(scoringCall.select).toEqual({ id: true, embedding: true });
      expect(typeof scoringCall.take).toBe('number');
      expect(scoringCall.take).toBeGreaterThan(0);
    });

    it('hydrates only the requested page, never selecting the embedding', async () => {
      const candidates = ['q1', 'q2', 'q3'].map((id) => ({
        id,
        embedding: embedding(1),
      }));
      prisma.examBankQuestion.findMany
        .mockResolvedValueOnce(candidates)
        .mockResolvedValueOnce([fullRow('q1'), fullRow('q2')]);

      const result = await service.search({
        query: 'cells',
        page: 1,
        limit: 2,
      });

      const hydrateCall = prisma.examBankQuestion.findMany.mock.calls[1][0];
      expect(hydrateCall.where.id.in).toHaveLength(2);
      expect(hydrateCall.select).not.toHaveProperty('embedding');
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).not.toHaveProperty('embedding');
      expect(result.data[0]).toHaveProperty('rrfScore');
    });

    it('returns an empty page when nothing matches the filters', async () => {
      prisma.examBankQuestion.findMany.mockResolvedValueOnce([]);

      const result = await service.search({ query: 'nothing' });

      expect(result).toEqual({ data: [], total: 0, page: 1, limit: 20 });
      expect(prisma.examBankQuestion.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
