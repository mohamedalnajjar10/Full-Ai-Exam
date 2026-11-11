import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';
import {
  normalizeForSearch,
  SEARCH_TRANSLATE_FROM,
  SEARCH_TRANSLATE_TO,
} from '../text/cleanup';
import { getEquivalentSubjectIds } from '../../subject/utils/subject-resolver.util';

/**
 * تعبير المستند للبحث النصي — لازم يطابق حرفياً فهرس
 * KnowledgeChunk_search_fts_idx بالـ migration حتى Postgres يستعمله.
 */
const DOC_TSV = Prisma.raw(
  `to_tsvector('simple', translate(coalesce(section, '') || ' ' || text, '${SEARCH_TRANSLATE_FROM}', '${SEARCH_TRANSLATE_TO}'))`,
);

/**
 * أقصى عدد مقاطع منحمّل متجهاتها بالذاكرة لمادة وحدة. كتاب مادة واحدة
 * بحدود ١٠٠٠–٣٠٠٠ مقطع، فالسقف بيغطيه. الحل الصحيح لما يكبر هو pgvector
 * (غير متوفر بصورة Postgres الحالية) — نفس الملاحظة بـ hybrid-search.
 */
const MAX_VECTOR_CANDIDATES = 6000;
const RRF_K = 60;
const LEG_LIMIT = 50;

export interface RetrievedChunk {
  id: string;
  documentId: string;
  text: string;
  section: string | null;
  unit: string | null;
  pageStart: number;
  pageEnd: number;
  score: number;
  /** ترتيب المقطع بكل مسار (للتشخيص بلوحة التحكم) */
  vectorRank: number | null;
  keywordRank: number | null;
}

/**
 * جيب التمام. متجهين بأطوال مختلفة جايين من نموذجين مختلفين وما بينقارنوا
 * (بعد تغيير نموذج التضمين وقبل إعادة التضمين) — منرجّع 0 بدل رقم مضلل.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

/**
 * استرجاع هجين من مقاطع الكتب: تشابه المتجهات + بحث نصي (tsvector بإعداد
 * simple لأنه ما في قاموس عربي بـ Postgres)، ومنجمعهم بـ RRF. إذا
 * التضمين معطّل أو فشل، بيضل البحث النصي شغّال.
 */
@Injectable()
export class KnowledgeRetrievalService {
  private readonly logger = new Logger(KnowledgeRetrievalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: GeminiService,
  ) {}

  async search(params: {
    subjectId: string;
    query: string;
    limit?: number;
    unit?: string;
  }): Promise<RetrievedChunk[]> {
    const { subjectId, unit } = params;
    // نص الكتاب مشكّل غالباً وسؤال الطالب لا — منوحّد الاتنين
    const query = normalizeForSearch(params.query);
    const limit = params.limit ?? 5;
    if (!query.trim()) return [];

    const subjectIds = await getEquivalentSubjectIds(this.prisma, subjectId);

    const [vectorIds, keywordIds] = await Promise.all([
      this.vectorLeg(subjectIds, query, unit),
      this.keywordLeg(subjectIds, query, unit),
    ]);

    const scores = new Map<
      string,
      { score: number; v: number | null; k: number | null }
    >();
    vectorIds.forEach((id, i) =>
      scores.set(id, { score: 1 / (RRF_K + i + 1), v: i + 1, k: null }),
    );
    keywordIds.forEach((id, i) => {
      const cur = scores.get(id) ?? { score: 0, v: null, k: null };
      scores.set(id, {
        score: cur.score + 1 / (RRF_K + i + 1),
        v: cur.v,
        k: i + 1,
      });
    });

    const top = [...scores.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, limit);
    if (!top.length) return [];

    const rows = await this.prisma.knowledgeChunk.findMany({
      where: { id: { in: top.map(([id]) => id) } },
      select: {
        id: true,
        documentId: true,
        text: true,
        section: true,
        unit: true,
        pageStart: true,
        pageEnd: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    return top
      .map(([id, s]) => {
        const r = byId.get(id);
        return r
          ? { ...r, score: s.score, vectorRank: s.v, keywordRank: s.k }
          : null;
      })
      .filter((r): r is RetrievedChunk => r !== null);
  }

  private async vectorLeg(
    subjectIds: string[],
    query: string,
    unit?: string,
  ): Promise<string[]> {
    if (!this.ai.embeddingInfo().enabled) return [];
    let q: number[];
    try {
      q = await this.ai.generateEmbedding(query, 'query');
    } catch (err) {
      this.logger.warn(
        `Query embedding failed, keyword search only: ${String(err)}`,
      );
      return [];
    }
    const candidates = await this.prisma.knowledgeChunk.findMany({
      where: {
        subjectId: { in: subjectIds },
        embeddingStatus: 'INDEXED',
        ...(unit ? { unit } : {}),
      },
      select: { id: true, embedding: true },
      take: MAX_VECTOR_CANDIDATES,
    });
    return candidates
      .map((c) => ({ id: c.id, s: cosineSimilarity(q, c.embedding) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, LEG_LIMIT)
      .map((c) => c.id);
  }

  private async keywordLeg(
    subjectIds: string[],
    query: string,
    unit?: string,
  ): Promise<string[]> {
    try {
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "KnowledgeChunk"
        WHERE "subjectId" IN (${Prisma.join(subjectIds)})
          ${unit ? Prisma.sql`AND unit = ${unit}` : Prisma.empty}
          AND ${DOC_TSV} @@ plainto_tsquery('simple', ${query})
        ORDER BY ts_rank_cd(${DOC_TSV}, plainto_tsquery('simple', ${query})) DESC
        LIMIT ${LEG_LIMIT}`;
      if (rows.length) return rows.map((r) => r.id);
      // plainto_tsquery بيطلب كل الكلمات (AND)؛ سؤال طويل نادراً ما يطابق حرفياً،
      // فمنرجع لـ OR بين الكلمات
      const words = query
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 2)
        .slice(0, 12)
        .map((w) => w.replace(/'/g, ''));
      if (!words.length) return [];
      const orQuery = words.join(' | ');
      const loose = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM "KnowledgeChunk"
        WHERE "subjectId" IN (${Prisma.join(subjectIds)})
          ${unit ? Prisma.sql`AND unit = ${unit}` : Prisma.empty}
          AND ${DOC_TSV} @@ to_tsquery('simple', ${orQuery})
        ORDER BY ts_rank_cd(${DOC_TSV}, to_tsquery('simple', ${orQuery})) DESC
        LIMIT ${LEG_LIMIT}`;
      return loose.map((r) => r.id);
    } catch (err) {
      this.logger.warn(`Keyword search failed: ${String(err)}`);
      return [];
    }
  }
}
