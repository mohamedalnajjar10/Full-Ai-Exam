import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';

interface EmbeddingJobData {
  bankQuestionId: string;
}

/**
 * BullMQ worker that generates vector embeddings for approved exam bank questions.
 *
 * Flow:
 * 1. Fetch question text + explanation
 * 2. Generate 768-dim embedding via Gemini text-embedding-004
 * 3. Store vector in pgvector column via raw SQL
 * 4. tsvector is auto-updated by PostgreSQL trigger
 */
@Processor('question-embedding')
export class EmbeddingProcessor extends WorkerHost {
  private readonly logger = new Logger(EmbeddingProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {
    super();
  }

  async process(job: Job<EmbeddingJobData>): Promise<void> {
    const { bankQuestionId } = job.data;
    this.logger.log(
      `Processing embedding job for question ${bankQuestionId} (attempt ${job.attemptsMade + 1})`,
    );

    try {
      // 1. Fetch question
      const question = await this.prisma.examBankQuestion.findUnique({
        where: { id: bankQuestionId },
      });

      if (!question || question.deletedAt) {
        this.logger.warn(
          `Question ${bankQuestionId} not found or deleted, skipping`,
        );
        return;
      }

      // 2. Build embedding input text
      const textParts = [question.questionText];
      if (question.explanation) {
        textParts.push(question.explanation);
      }
      const inputText = textParts.join('\n\n');

      // 3. Generate embedding
      const embedding = await this.gemini.generateEmbedding(inputText);

      // 4. Store embedding array in PostgreSQL
      await this.prisma.examBankQuestion.update({
        where: { id: bankQuestionId },
        data: {
          embedding,
          embeddingStatus: 'INDEXED',
        },
      });

      this.logger.log(
        `Embedding indexed for question ${bankQuestionId} (${embedding.length} dims)`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(
        `Embedding failed for question ${bankQuestionId}: ${errorMessage}`,
      );

      // Mark as FAILED so it can be retried or flagged for ops
      await this.prisma.examBankQuestion
        .update({
          where: { id: bankQuestionId },
          data: { embeddingStatus: 'FAILED' },
        })
        .catch((updateErr) =>
          this.logger.error(
            `Failed to update embedding status: ${updateErr.message}`,
          ),
        );

      throw error; // Re-throw for BullMQ retry
    }
  }
}
