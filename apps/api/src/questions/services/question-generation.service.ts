import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  STUDENT_EVENTS,
  StudentActivityEventPayload,
} from '../../parent/events/student-activity.events';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';
import {
  GenerationPromptBuilder,
  BankQuestionAnchor,
} from '../builders/generation-prompt.builder';
import { GenerateQuestionsDto } from '../dto/generate-questions.dto';
import { SubmitQuizAttemptDto } from '../dto/submit-quiz-attempt.dto';
import { ReferenceMetadata } from '../interfaces/generated-question.interface';
import { DifficultyLevel, BloomTaxonomyLevel, Prisma } from '@prisma/client';
import {
  KnowledgeRetrievalService,
  RetrievedChunk,
} from '../../knowledge/services/knowledge-retrieval.service';
import { getEquivalentSubjectIds } from '../../subject/utils/subject-resolver.util';

/** كم مقطع من الكتاب المدرسي منحط بالـ prompt */
const MAX_TEXTBOOK_PASSAGES = 4;

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
export class QuestionGenerationService {
  private readonly logger = new Logger(QuestionGenerationService.name);
  private isPgVectorAvailable: boolean | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly promptBuilder: GenerationPromptBuilder,
    private readonly retrieval: KnowledgeRetrievalService,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {}

  /**
   * Core RAG pipeline (US-14):
   * 1. Generate a 768d query embedding from the topic/subject
   * 2. Retrieve top-N approved bank questions via pgvector cosine distance
   * 3. Build a few-shot system prompt strictly grounded in Palestinian curriculum
   * 4. Call Gemini with structured output schema + self-healing retry
   * 5. Persist results in generated_questions with BANK_RAG source type
   */
  async generateFromBank(
    studentId: string,
    dto: GenerateQuestionsDto,
  ): Promise<object[]> {
    const { subjectId, topicId, difficulty, bloomTaxonomy, count } = dto;

    // ── 1. Validate subject exists ──────────────────────────────
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      include: { branch: true },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    // ── 2. Build semantic query text ────────────────────────────
    const queryText = [
      `subject:${subject.name}`,
      subject.branch?.name ? `branch:${subject.branch.name}` : '',
      topicId ? `topic:${topicId}` : '',
      `difficulty:${difficulty}`,
      bloomTaxonomy ? `bloom:${bloomTaxonomy}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    // ── 3. Generate query embedding (768d) ──────────────────────
    let queryEmbedding: number[] = [];
    try {
      queryEmbedding = await this.gemini.generateEmbedding(queryText, 'query');
    } catch (err) {
      this.logger.warn(
        `Embedding generation failed, falling back to metadata filter: ${String(err)}`,
      );
    }

    // ── 4. Retrieve top-N bank questions via hybrid retrieval ───
    const anchors = await this.retrieveBankAnchors(
      subjectId,
      topicId,
      difficulty,
      bloomTaxonomy,
      queryEmbedding,
    );

    // ── 4b. مقاطع من الكتاب المدرسي (الاسترجاع الهجين) ──────────
    const passages = await this.retrieveTextbookPassages(
      subjectId,
      [subject.name, topicId, bloomTaxonomy ? `مستوى ${bloomTaxonomy}` : '']
        .filter(Boolean)
        .join(' '),
      topicId,
    );

    // Strict grounding: at least one official reference — a bank question or
    // a passage from the ministry textbook — must exist.
    if (anchors.length === 0 && passages.length === 0) {
      throw new BadRequestException(
        `No approved Palestinian exam bank questions or indexed textbook passages found for subject "${subject.name}" (Branch: "${subject.branch?.name ?? 'General'}"). Question generation requires official curriculum references for strict grounding.`,
      );
    }

    const bankQuestionIds = anchors.map((a) => a.id);

    // ── 5. Build few-shot prompt ────────────────────────────────
    const prompt = this.promptBuilder.buildBankRagPrompt(
      anchors,
      subject,
      topicId,
      difficulty,
      bloomTaxonomy,
      count,
      passages,
    );

    // ── 6. Generate questions via Gemini (with self-healing retry)
    const generated = await this.gemini.generateQuestions(prompt, count);

    // ── 7. Persist generated questions ─────────────────────────
    const referenceMetadata: ReferenceMetadata = {
      bankQuestionIds,
      textbookChunkIds: passages.map((p) => p.id),
    };

    const created =
      typeof this.prisma.generatedQuestion.createManyAndReturn === 'function'
        ? await this.prisma.generatedQuestion.createManyAndReturn({
            data: generated.map((q) => ({
              studentId,
              subjectId,
              topicId: topicId ?? null,
              questionText: q.questionText,
              choices: q.choices,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation,
              bloomTaxonomy: (q.bloomTaxonomy as BloomTaxonomyLevel) ?? null,
              difficulty: difficulty,
              sourceType: 'BANK_RAG',
              referenceMetadata:
                referenceMetadata as unknown as Prisma.InputJsonValue,
            })),
            select: {
              id: true,
              questionText: true,
              choices: true,
              correctAnswer: true,
              explanation: true,
              bloomTaxonomy: true,
              difficulty: true,
              sourceType: true,
              referenceMetadata: true,
              subjectId: true,
              topicId: true,
              createdAt: true,
            },
          })
        : await Promise.all(
            generated.map((q) =>
              this.prisma.generatedQuestion.create({
                data: {
                  studentId,
                  subjectId,
                  topicId: topicId ?? null,
                  questionText: q.questionText,
                  choices: q.choices,
                  correctAnswer: q.correctAnswer,
                  explanation: q.explanation,
                  bloomTaxonomy:
                    (q.bloomTaxonomy as BloomTaxonomyLevel) ?? null,
                  difficulty: difficulty,
                  sourceType: 'BANK_RAG',
                  referenceMetadata:
                    referenceMetadata as unknown as Prisma.InputJsonValue,
                },
                select: {
                  id: true,
                  questionText: true,
                  choices: true,
                  correctAnswer: true,
                  explanation: true,
                  bloomTaxonomy: true,
                  difficulty: true,
                  sourceType: true,
                  referenceMetadata: true,
                  subjectId: true,
                  topicId: true,
                  createdAt: true,
                },
              }),
            ),
          );

    if (bankQuestionIds.length) {
      await this.prisma.examBankQuestion.updateMany({
        where: { id: { in: bankQuestionIds } },
        data: { usageCount: { increment: 1 } },
      });
    }

    this.logger.log(
      `Generated and persisted ${created.length} questions (BANK_RAG, ${anchors.length} bank anchors, ${passages.length} textbook passages) for student ${studentId}`,
    );

    this.eventEmitter?.emit(STUDENT_EVENTS.QUESTIONS_GENERATED, {
      studentId,
      type: 'QUESTIONS_GENERATED',
      title: `توليد ${created.length} أسئلة تدريبية في مادة ${subject.name}`,
      subjectId,
      metadata: {
        count: created.length,
        subjectName: subject.name,
        topicId,
        difficulty,
        bloomTaxonomy,
        bankAnchorsCount: anchors.length,
        textbookPassagesCount: passages.length,
      },
    } satisfies StudentActivityEventPayload);

    return created;
  }

  /**
   * مقاطع الكتاب الأقرب للطلب. الفشل هون ما بيوقف التوليد — أسئلة البنك
   * لحالها كافية كمرجع.
   */
  private async retrieveTextbookPassages(
    subjectId: string,
    query: string,
    unit: string | undefined,
  ): Promise<RetrievedChunk[]> {
    try {
      const subjectIds = await getEquivalentSubjectIds(this.prisma, subjectId);
      for (const sid of subjectIds) {
        let passages = unit
          ? await this.retrieval.search({
              subjectId: sid,
              query,
              unit,
              limit: MAX_TEXTBOOK_PASSAGES,
            })
          : [];
        // topicId نص حر؛ إذا ما طابق وحدة بالكتاب منبحث بكل المادة
        if (passages.length === 0) {
          passages = await this.retrieval.search({
            subjectId: sid,
            query,
            limit: MAX_TEXTBOOK_PASSAGES,
          });
        }
        if (passages.length > 0) return passages;
      }
      return [];
    } catch (err) {
      this.logger.warn(
        `Textbook retrieval failed, continuing with bank anchors only: ${String(err)}`,
      );
      return [];
    }
  }

  /**
   * Check if pgvector extension is installed and active in PostgreSQL.
   * Probes the pg_type system catalog to prevent throwing SQL type errors.
   */
  private async hasPgVectorSupport(): Promise<boolean> {
    if (this.isPgVectorAvailable !== null) {
      return this.isPgVectorAvailable;
    }
    try {
      const result = await this.prisma.$queryRawUnsafe<{ exists: boolean }[]>(
        `SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vector') as "exists"`,
      );
      this.isPgVectorAvailable = Boolean(result?.[0]?.exists);
    } catch {
      this.isPgVectorAvailable = false;
    }
    return this.isPgVectorAvailable;
  }

  /**
   * Retrieve top-3 to 5 approved ExamBankQuestions using pgvector cosine distance
   * filtered by subject, difficulty, bloomTaxonomy, and not soft-deleted.
   */
  private async retrieveBankAnchors(
    subjectId: string,
    topicId: string | undefined,
    difficulty: DifficultyLevel,
    bloomTaxonomy: BloomTaxonomyLevel | undefined,
    queryEmbedding: number[],
  ): Promise<BankQuestionAnchor[]> {
    const MAX_ANCHORS = 5;

    const hasPgVector =
      queryEmbedding.length > 0 && (await this.hasPgVectorSupport());

    const subjectIds = await getEquivalentSubjectIds(this.prisma, subjectId);
    const subjectFilter =
      subjectIds.length > 1 ? { in: subjectIds } : subjectId;

    if (hasPgVector) {
      // pgvector cosine distance query — uses HNSW index for O(log n) retrieval
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      // Helper to safely query pgvector with fully parameterized placeholders ($1, $2, ...)
      const queryVectorWithPredicates = async (
        includeDifficulty: boolean,
        includeBloom: boolean,
        includeTopic: boolean,
      ) => {
        const params: unknown[] = [
          embeddingStr,
          subjectIds.length > 1 ? subjectIds : subjectIds[0],
        ];
        const whereParts: string[] = [
          `"deletedAt" IS NULL`,
          `"embeddingStatus" = 'INDEXED'`,
          subjectIds.length > 1
            ? `"subjectId" = ANY($2::text[])`
            : `"subjectId" = $2`,
        ];

        if (includeDifficulty) {
          params.push(difficulty);
          whereParts.push(`difficulty = $${params.length}::"DifficultyLevel"`);
        }

        if (includeBloom && bloomTaxonomy) {
          params.push(bloomTaxonomy);
          whereParts.push(
            `"bloomTaxonomy" = $${params.length}::"BloomTaxonomyLevel"`,
          );
        }

        if (includeTopic && topicId) {
          params.push(topicId);
          whereParts.push(`"topicId" = $${params.length}`);
        }

        const sql = `SELECT id, "questionText", choices, "correctAnswer", explanation, "bloomTaxonomy", difficulty
           FROM "ExamBankQuestion"
           WHERE ${whereParts.join(' AND ')}
           ORDER BY embedding::vector <=> $1::vector
           LIMIT ${MAX_ANCHORS}`;

        return this.prisma.$queryRawUnsafe<
          {
            id: string;
            questionText: string;
            choices: unknown;
            correctAnswer: string;
            explanation: string | null;
            bloomTaxonomy: string;
            difficulty: string;
          }[]
        >(sql, ...params);
      };

      try {
        // 1. Try strict match (subject + difficulty + bloom + topic)
        let rows = await queryVectorWithPredicates(
          true,
          Boolean(bloomTaxonomy),
          Boolean(topicId),
        );

        // 2. Relax bloom and topic if no strict match
        if (rows.length === 0 && (bloomTaxonomy || topicId)) {
          rows = await queryVectorWithPredicates(true, false, false);
        }

        // 3. Relax difficulty to any approved question in this subject
        if (rows.length === 0) {
          rows = await queryVectorWithPredicates(false, false, false);
        }

        if (rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            questionText: r.questionText,
            choices: r.choices as { label: string; text: string }[],
            correctAnswer: r.correctAnswer,
            explanation: r.explanation,
            bloomTaxonomy: r.bloomTaxonomy,
            difficulty: r.difficulty,
          }));
        }
      } catch (err) {
        this.isPgVectorAvailable = false;
        this.logger.debug(
          `pgvector query execution failed, falling back to in-memory cosine ranking: ${String(err)}`,
        );
      }
    }

    // Fallback: Prisma-filtered retrieval with progressive relaxation
    const selectFields = {
      id: true,
      questionText: true,
      choices: true,
      correctAnswer: true,
      explanation: true,
      bloomTaxonomy: true,
      difficulty: true,
      embedding: true,
    };

    // 1. Try strict Prisma query
    const whereStrict: Prisma.ExamBankQuestionWhereInput = {
      deletedAt: null,
      subjectId: subjectFilter,
      difficulty,
    };
    if (bloomTaxonomy) whereStrict.bloomTaxonomy = bloomTaxonomy;
    if (topicId) whereStrict.topicId = topicId;

    let fallback = await this.prisma.examBankQuestion.findMany({
      where: whereStrict,
      take: queryEmbedding.length > 0 ? 50 : MAX_ANCHORS,
      orderBy: { createdAt: 'desc' },
      select: selectFields,
    });

    // 2. Relax bloom and topic if 0 results
    if (fallback.length === 0 && (bloomTaxonomy || topicId)) {
      fallback = await this.prisma.examBankQuestion.findMany({
        where: { deletedAt: null, subjectId: subjectFilter, difficulty },
        take: queryEmbedding.length > 0 ? 50 : MAX_ANCHORS,
        orderBy: { createdAt: 'desc' },
        select: selectFields,
      });
    }

    // 3. Relax difficulty to any question for this subject if 0 results
    if (fallback.length === 0) {
      fallback = await this.prisma.examBankQuestion.findMany({
        where: { deletedAt: null, subjectId: subjectFilter },
        take: queryEmbedding.length > 0 ? 50 : MAX_ANCHORS,
        orderBy: { createdAt: 'desc' },
        select: selectFields,
      });
    }

    // Deduplicate by normalized questionText
    const seenBankText = new Set<string>();
    fallback = fallback.filter((item) => {
      const textKey = item.questionText.trim().replace(/\s+/g, ' ');
      if (seenBankText.has(textKey)) return false;
      seenBankText.add(textKey);
      return true;
    });

    if (queryEmbedding.length > 0 && fallback.length > 0) {
      fallback.sort((a, b) => {
        const scoreA = cosineSimilarity(queryEmbedding, a.embedding);
        const scoreB = cosineSimilarity(queryEmbedding, b.embedding);
        return scoreB - scoreA;
      });
    }

    return fallback.slice(0, MAX_ANCHORS).map((r) => ({
      id: r.id,
      questionText: r.questionText,
      choices: r.choices as { label: string; text: string }[],
      correctAnswer: r.correctAnswer,
      explanation: r.explanation,
      bloomTaxonomy: r.bloomTaxonomy,
      difficulty: r.difficulty,
    }));
  }

  /**
   * Records student interactive quiz attempt or retake, persists to StudentActivityEvent,
   * and emits STUDENT_EVENTS.QUIZ_COMPLETED for live parent dashboard updates.
   */
  async submitQuizAttempt(studentId: string, dto: SubmitQuizAttemptDto) {
    if (dto.correct > dto.total) {
      throw new BadRequestException('correct cannot exceed total');
    }

    const subject = await this.prisma.subject.findUnique({
      where: { id: dto.subjectId },
      select: { id: true, name: true },
    });
    if (!subject) {
      throw new NotFoundException(`Subject not found with id ${dto.subjectId}`);
    }

    const verifiedSubjectName = subject.name || dto.subjectName;
    const { total, correct } = dto;
    const isRetake = dto.source === 'RETAKE';
    const scorePercentage = Math.round((correct / total) * 100);
    const prevScore =
      dto.previousScore !== undefined
        ? Math.round(dto.previousScore)
        : undefined;
    const isImprovement =
      prevScore !== undefined && scorePercentage > prevScore;

    let title: string;
    if (isRetake && isImprovement) {
      title = `🎉 تحسن ملحوظ! إعادة كويز تفاعلي في ${verifiedSubjectName}: ${scorePercentage}% (أعلى من ${prevScore}%)`;
    } else if (isRetake) {
      title = `إعادة كويز تفاعلي في ${verifiedSubjectName}: ${scorePercentage}%`;
    } else {
      title = `إتمام كويز تفاعلي في ${verifiedSubjectName}: ${scorePercentage}% (${correct}/${total})`;
    }

    const savedEvent = await this.prisma.studentActivityEvent.create({
      data: {
        studentId,
        eventType: 'QUIZ_COMPLETED',
        title,
        metadata: {
          subjectId: subject.id,
          subjectName: verifiedSubjectName,
          score: scorePercentage,
          correct,
          total,
          durationSec: dto.durationSec,
          difficulty: dto.difficulty ?? 'MEDIUM',
          source: dto.source,
          isRetake,
          previousScore: prevScore,
          isImprovement,
          questions: dto.questions ?? [],
          answers: dto.answers ?? {},
        },
      },
    });

    this.logger.log(
      `[Quiz] Recorded quiz attempt for student ${studentId}: score ${scorePercentage}% (isRetake: ${isRetake}, improvement: ${isImprovement})`,
    );

    this.eventEmitter?.emit(STUDENT_EVENTS.QUIZ_COMPLETED, {
      studentId,
      type: 'QUIZ_COMPLETED',
      title,
      subjectId: subject.id,
      metadata: {
        eventId: savedEvent.id,
        subjectId: subject.id,
        subjectName: verifiedSubjectName,
        score: scorePercentage,
        correct,
        total,
        durationSec: dto.durationSec,
        difficulty: dto.difficulty ?? 'MEDIUM',
        source: dto.source,
        isRetake,
        previousScore: prevScore,
        isImprovement,
      },
    } satisfies StudentActivityEventPayload);

    return {
      success: true,
      eventId: savedEvent.id,
      score: scorePercentage,
      isRetake,
      isImprovement,
    };
  }

  /**
   * Retrieves student's historical quiz attempts for cross-device cloud sync.
   */
  async getQuizAttempts(studentId: string, limit = 60) {
    const events = await this.prisma.studentActivityEvent.findMany({
      where: {
        studentId,
        eventType: 'QUIZ_COMPLETED',
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return events.map((event) => {
      const meta = (event.metadata ?? {}) as Record<string, any>;
      return {
        id: event.id,
        subjectId: meta.subjectId ?? '',
        subjectName: meta.subjectName ?? '',
        difficulty: meta.difficulty ?? 'MEDIUM',
        source: meta.source ?? 'GENERATED',
        questions: Array.isArray(meta.questions) ? meta.questions : [],
        answers:
          meta.answers && typeof meta.answers === 'object' ? meta.answers : {},
        correct: typeof meta.correct === 'number' ? meta.correct : 0,
        total: typeof meta.total === 'number' ? meta.total : 0,
        durationSec:
          typeof meta.durationSec === 'number' ? meta.durationSec : 0,
        finishedAt: event.createdAt.toISOString(),
      };
    });
  }

  /**
   * Retrieves student's cloud-persisted daily plan state.
   */
  async getDailyPlan(studentId: string) {
    const event = await this.prisma.studentActivityEvent.findFirst({
      where: {
        studentId,
        eventType: 'DAILY_PLAN_STATE',
      },
      orderBy: { createdAt: 'desc' },
    });

    return (event?.metadata as Record<string, any>) ?? {};
  }

  /**
   * Syncs student's daily plan state to PostgreSQL for cross-device persistence.
   */
  async saveDailyPlan(studentId: string, planData: Record<string, any>) {
    const existing = await this.prisma.studentActivityEvent.findFirst({
      where: {
        studentId,
        eventType: 'DAILY_PLAN_STATE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      const updated = await this.prisma.studentActivityEvent.update({
        where: { id: existing.id },
        data: {
          metadata: planData as unknown as Prisma.InputJsonValue,
        },
      });
      return { success: true, eventId: updated.id };
    }

    const created = await this.prisma.studentActivityEvent.create({
      data: {
        studentId,
        eventType: 'DAILY_PLAN_STATE',
        title: 'مزامنة الخطة اليومية',
        metadata: planData as unknown as Prisma.InputJsonValue,
      },
    });

    return { success: true, eventId: created.id };
  }
}
