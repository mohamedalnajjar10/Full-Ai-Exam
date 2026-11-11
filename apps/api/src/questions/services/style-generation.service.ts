import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';
import { RedisService } from '../../redis/redis.service';
import {
  GenerationPromptBuilder,
  BankQuestionAnchor,
} from '../builders/generation-prompt.builder';
import { GenerateFromStyleDto } from '../dto/generate-from-style.dto';
import {
  StyleMatrix,
  ReferenceMetadata,
} from '../interfaces/generated-question.interface';
import { BloomTaxonomyLevel, Prisma } from '@prisma/client';

const STYLE_MATRIX_CACHE_PREFIX = 'style_matrix:';
const STYLE_MATRIX_TTL = 86400; // 24 hours in seconds

@Injectable()
export class StyleGenerationService {
  private readonly logger = new Logger(StyleGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly redis: RedisService,
    private readonly promptBuilder: GenerationPromptBuilder,
  ) {}

  /**
   * US-16: Style-matched RAG generation pipeline.
   * 1. Retrieve StyleMatrix from Redis cache → fallback to DB
   * 2. Retrieve curriculum content-grounding anchors from exam bank
   * 3. Build dual-context prompt (Style Blueprint + Bank RAG)
   * 4. Generate via Gemini with self-healing retry
   * 5. Persist with UPLOAD_STYLE_MATCH sourceType and full referenceMetadata
   */
  async generateFromStyle(
    studentId: string,
    dto: GenerateFromStyleDto,
  ): Promise<object[]> {
    const { styleUploadId, subjectId, topicId, count } = dto;

    // ── 1. Validate subject ──────────────────────────────────────
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      include: { branch: true },
    });
    if (!subject) throw new NotFoundException('Subject not found');

    // ── 2. Retrieve StyleMatrix from Redis or DB ─────────────────
    const styleMatrix = await this.getStyleMatrix(styleUploadId, studentId);

    // ── 3. Retrieve curriculum anchors ───────────────────────────
    const anchors = await this.retrieveBankAnchors(subjectId, topicId);
    const bankQuestionIds = anchors.map((a) => a.id);

    // ── 4. Build dual-context prompt ─────────────────────────────
    const prompt = this.promptBuilder.buildDualContextPrompt(
      styleMatrix,
      anchors,
      subject,
      topicId,
      count,
    );

    // ── 5. Generate via Gemini ────────────────────────────────────
    const generated = await this.gemini.generateQuestions(prompt, count);

    // ── 6. Persist with full lineage metadata ─────────────────────
    const referenceMetadata: ReferenceMetadata = {
      styleUploadId,
      bankQuestionIds,
    };

    const inferredBloom = styleMatrix.cognitiveDepth as BloomTaxonomyLevel;

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
              bloomTaxonomy:
                (q.bloomTaxonomy as BloomTaxonomyLevel) ?? inferredBloom,
              difficulty: null,
              sourceType: 'UPLOAD_STYLE_MATCH',
              referenceMetadata:
                referenceMetadata as unknown as Prisma.InputJsonValue,
              styleUploadId,
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
              styleUploadId: true,
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
                    (q.bloomTaxonomy as BloomTaxonomyLevel) ?? inferredBloom,
                  difficulty: null,
                  sourceType: 'UPLOAD_STYLE_MATCH',
                  referenceMetadata:
                    referenceMetadata as unknown as Prisma.InputJsonValue,
                  styleUploadId,
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
                  styleUploadId: true,
                  createdAt: true,
                },
              }),
            ),
          );

    this.logger.log(
      `Generated ${created.length} style-matched questions (UPLOAD_STYLE_MATCH) for student ${studentId}`,
    );

    return created;
  }

  /**
   * Retrieve StyleMatrix: Redis cache → DB fallback.
   * Throws if upload not found, not owned by student, or not COMPLETED.
   */
  private async getStyleMatrix(
    uploadId: string,
    studentId: string,
  ): Promise<StyleMatrix> {
    // Try Redis cache first
    const cacheKey = `${STYLE_MATRIX_CACHE_PREFIX}${uploadId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as StyleMatrix;
      } catch {
        this.logger.warn(
          `StyleMatrix cache parse failed for ${uploadId}, falling back to DB`,
        );
      }
    }

    // Fallback: DB lookup
    const upload = await this.prisma.styleSourceUpload.findUnique({
      where: { id: uploadId },
      select: {
        status: true,
        styleMatrix: true,
        studentId: true,
      },
    });

    if (!upload || upload.studentId !== studentId) {
      throw new NotFoundException('Style upload not found or access denied');
    }

    if (upload.status !== 'COMPLETED' || !upload.styleMatrix) {
      throw new BadRequestException(
        `Style upload is not ready (status: ${upload.status}). Please wait for extraction to complete.`,
      );
    }

    const matrix = upload.styleMatrix as unknown as StyleMatrix;

    // Re-cache in Redis with 24h TTL
    await this.redis.set(cacheKey, JSON.stringify(matrix), STYLE_MATRIX_TTL);

    return matrix;
  }

  /**
   * Retrieve top-5 curriculum grounding anchors from the exam bank
   * filtered by subject (and optional topic).
   */
  private async retrieveBankAnchors(
    subjectId: string,
    topicId?: string,
  ): Promise<BankQuestionAnchor[]> {
    const where: Record<string, unknown> = {
      deletedAt: null,
      subjectId,
      embeddingStatus: 'INDEXED',
    };
    if (topicId) where.topicId = topicId;

    const results = await this.prisma.examBankQuestion.findMany({
      where,
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        questionText: true,
        choices: true,
        correctAnswer: true,
        explanation: true,
        bloomTaxonomy: true,
        difficulty: true,
      },
    });

    return results.map((r) => ({
      id: r.id,
      questionText: r.questionText,
      choices: r.choices as { label: string; text: string }[],
      correctAnswer: r.correctAnswer,
      explanation: r.explanation,
      bloomTaxonomy: r.bloomTaxonomy,
      difficulty: r.difficulty,
    }));
  }
}
