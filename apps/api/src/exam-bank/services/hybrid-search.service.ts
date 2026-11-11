import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';
import { HybridSearchDto } from '../dto';

/**
 * سقف عدد المرشحين يلي منحمّل embeddings تبعهم بالذاكرة.
 *
 * الحل الصح هو pgvector مع فهرس HNSW حتى الترتيب يصير بقاعدة البيانات
 * بدل JS — بس هاد بدّه تغيير نوع العمود وmigration لحاله. لحد هديك،
 * السقف بيمنع الاستعلام من إنه يكبر بلا حدود مع كل سؤال بينضاف للبنك.
 */
const MAX_VECTOR_CANDIDATES = 2000;

export interface SearchResult {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  limit: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

@Injectable()
export class HybridSearchService {
  private readonly logger = new Logger(HybridSearchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  /**
   * Execute a hybrid search combining:
   * - Dense vector similarity (cosine similarity over 768d embeddings)
   * - Sparse full-text search (tsvector BM25 / ts_rank_cd scoring)
   * - Reciprocal Rank Fusion (RRF) score merging: RRF = 1/(60 + rank_v) + 1/(60 + rank_t)
   *
   * When no query text is provided, falls back to filtered B-Tree query.
   */
  async search(dto: HybridSearchDto): Promise<SearchResult> {
    const {
      query,
      branchId,
      subjectId,
      topicId,
      year,
      difficulty,
      bloomTaxonomy,
      page = 1,
      limit = 20,
    } = dto;

    const offset = (page - 1) * limit;

    // Build Prisma where clause for filters
    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (branchId) where.branchId = branchId;
    if (subjectId) where.subjectId = subjectId;
    if (topicId) where.topicId = topicId;
    if (year) where.year = year;
    if (difficulty) where.difficulty = difficulty;
    if (bloomTaxonomy) where.bloomTaxonomy = bloomTaxonomy;

    // ── Filter-only mode (no search query text) ──
    if (!query || query.trim() === '') {
      const [data, total] = await Promise.all([
        this.prisma.examBankQuestion.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: offset,
          take: limit,
          select: {
            id: true,
            questionText: true,
            choices: true,
            correctAnswer: true,
            explanation: true,
            branchId: true,
            subjectId: true,
            year: true,
            term: true,
            difficulty: true,
            bloomTaxonomy: true,
            topicId: true,
            embeddingStatus: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        this.prisma.examBankQuestion.count({ where }),
      ]);

      return {
        data: data as unknown as Record<string, unknown>[],
        total,
        page,
        limit,
      };
    }

    // ── Hybrid RRF Search Mode ──
    // 1. Generate query embedding via Gemini (768 dimensions)
    const queryEmbedding = await this.gemini.generateEmbedding(query, 'query');

    // 2. Fetch candidate ids + embeddings only.
    //
    // This used to select every column *including* the 768-float embedding
    // for every matching row, with no take — roughly 60 MB of JS numbers at
    // 10k rows, on every search. Scoring only needs the id and the vector;
    // the full rows are fetched for the returned page alone (step 6).
    const candidates = await this.prisma.examBankQuestion.findMany({
      where,
      select: { id: true, embedding: true },
      orderBy: { createdAt: 'desc' },
      take: MAX_VECTOR_CANDIDATES,
    });

    if (candidates.length === 0) {
      return { data: [], total: 0, page, limit };
    }

    // 3. Dense Vector Search: Rank by cosine similarity
    const vectorScored = candidates
      .filter((q) => q.embedding && q.embedding.length > 0)
      .map((q) => ({
        id: q.id,
        score: cosineSimilarity(queryEmbedding, q.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 100);

    const vectorRankMap = new Map<string, number>();
    vectorScored.forEach((item, index) => {
      vectorRankMap.set(item.id, index + 1);
    });

    // 4. Sparse Text Search: Query PostgreSQL tsvector for keyword ranking
    let textRankMap = new Map<string, number>();
    try {
      const textMatches = await this.prisma.$queryRawUnsafe<
        { id: string; rank_score: number }[]
      >(
        `SELECT id, ts_rank_cd(
           to_tsvector('english', COALESCE("questionText", '') || ' ' || COALESCE(explanation, '')),
           plainto_tsquery('english', $1)
         ) AS rank_score
         FROM "ExamBankQuestion"
         WHERE "deletedAt" IS NULL
           AND to_tsvector('english', COALESCE("questionText", '') || ' ' || COALESCE(explanation, '')) @@ plainto_tsquery('english', $1)
         ORDER BY rank_score DESC
         LIMIT 100`,
        query,
      );

      textMatches.forEach((item, index) => {
        textRankMap.set(item.id, index + 1);
      });
    } catch {
      // If tsquery fails on special syntax, fallback to substring match
      textRankMap = new Map();
    }

    // 5. Reciprocal Rank Fusion (RRF): RRF Score = 1/(60 + rank_v) + 1/(60 + rank_t)
    const k = 60;
    const candidateIds = new Set(candidates.map((c) => c.id));
    const allMatchingIds = new Set([
      ...vectorRankMap.keys(),
      ...textRankMap.keys(),
    ]);

    // If neither vector nor tsquery matched specifically, score all candidates by vector similarity
    if (allMatchingIds.size === 0) {
      candidates.forEach((c) => allMatchingIds.add(c.id));
    }

    const fusedResults = Array.from(allMatchingIds)
      .map((id) => {
        const rankV = vectorRankMap.get(id);
        const rankT = textRankMap.get(id);

        const rrfScore =
          (rankV !== undefined ? 1.0 / (k + rankV) : 0) +
          (rankT !== undefined ? 1.0 / (k + rankT) : 0);

        if (!candidateIds.has(id)) return null;
        return { id, rrfScore };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.rrfScore - a.rrfScore);

    const total = fusedResults.length;
    const pagedRanked = fusedResults.slice(offset, offset + limit);

    // 6. Hydrate only the page being returned. `embedding` is deliberately
    //    absent from the select, so it never reaches the API response.
    const rows = await this.prisma.examBankQuestion.findMany({
      where: { id: { in: pagedRanked.map((r) => r.id) } },
      select: {
        id: true,
        questionText: true,
        choices: true,
        correctAnswer: true,
        explanation: true,
        branchId: true,
        subjectId: true,
        year: true,
        term: true,
        difficulty: true,
        bloomTaxonomy: true,
        topicId: true,
        embeddingStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const rowById = new Map(rows.map((r) => [r.id, r]));
    const pagedData = pagedRanked
      .map(({ id, rrfScore }) => {
        const row = rowById.get(id);
        return row ? { ...row, rrfScore } : null;
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    this.logger.log(
      `Hybrid RRF search for "${query.slice(0, 50)}" matched ${total} questions (page ${page})`,
    );

    return {
      data: pagedData as unknown as Record<string, unknown>[],
      total,
      page,
      limit,
    };
  }
}
