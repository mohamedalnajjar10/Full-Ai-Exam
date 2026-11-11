import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../../gemini/gemini.service';
import { StorageService } from '../../storage/storage.service';
import { RedisService } from '../../redis/redis.service';

const STYLE_MATRIX_CACHE_PREFIX = 'style_matrix:';
const STYLE_MATRIX_TTL = 86400; // 24 hours

interface ExtractStyleMatrixJobData {
  uploadId: string;
  s3Key: string;
  mimeType: string;
}

@Processor('style-extraction-queue')
export class StyleExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(StyleExtractionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
    private readonly storage: StorageService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  /**
   * Process an `extract-style-matrix` job:
   * 1. Download file from S3
   * 2. Send to Gemini multimodal API for style analysis
   * 3. Cache StyleMatrix in Redis (TTL: 24h)
   * 4. Persist StyleMatrix in DB and mark upload as COMPLETED
   * On failure: mark upload as FAILED with error log
   */
  async process(job: Job<ExtractStyleMatrixJobData>): Promise<void> {
    const { uploadId, s3Key, mimeType } = job.data;

    this.logger.log(
      `Processing style extraction job for upload ${uploadId} (${s3Key})`,
    );

    try {
      // ── 1. Download from S3 ─────────────────────────────────────
      const fileBuffer = await this.storage.getFileBuffer(s3Key);
      this.logger.debug(
        `Downloaded ${fileBuffer.length} bytes from S3 for upload ${uploadId}`,
      );

      // ── 2. Extract style matrix via Gemini multimodal ───────────
      const styleMatrix = await this.gemini.extractStyleMatrix(
        fileBuffer,
        mimeType,
      );

      // ── 3. Cache in Redis with 24h TTL ──────────────────────────
      const cacheKey = `${STYLE_MATRIX_CACHE_PREFIX}${uploadId}`;
      await this.redis.set(
        cacheKey,
        JSON.stringify(styleMatrix),
        STYLE_MATRIX_TTL,
      );
      this.logger.debug(`Cached style matrix in Redis: ${cacheKey}`);

      // ── 4. Persist in DB and mark COMPLETED ─────────────────────
      await this.prisma.styleSourceUpload.update({
        where: { id: uploadId },
        data: {
          status: 'COMPLETED',
          styleMatrix: styleMatrix as unknown as Prisma.InputJsonValue,
          errorLog: null,
        },
      });

      this.logger.log(
        `Style extraction completed for upload ${uploadId}. Matrix keys: ${Object.keys(styleMatrix).join(', ')}`,
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Style extraction FAILED for upload ${uploadId}: ${errorMessage}`,
      );

      // Mark upload as FAILED with error log
      await this.prisma.styleSourceUpload.update({
        where: { id: uploadId },
        data: {
          status: 'FAILED',
          errorLog: errorMessage,
        },
      });

      // Re-throw to let BullMQ handle retry logic
      throw err;
    }
  }
}
