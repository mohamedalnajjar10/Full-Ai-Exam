import {
  Injectable,
  Logger,
  BadRequestException,
  UnprocessableEntityException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUES_DISABLED_MESSAGE } from '../../common/queues';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { ConfigService } from '@nestjs/config';

import { resolveExamMimeType, SUPPORTED_EXAM_MIME_TYPES } from '../../common';

const MAX_UPLOAD_SIZE = 15 * 1024 * 1024; // 15 MB

@Injectable()
export class StyleUploadService {
  private readonly logger = new Logger(StyleUploadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @Optional()
    @InjectQueue('style-extraction-queue')
    private readonly extractionQueue?: Queue,
  ) {}

  /**
   * Upload a style-source file to S3 under temp-style-sources/ prefix,
   * create a StyleSourceUpload database record, and enqueue the async
   * style extraction BullMQ job. Returns in < 100ms (no Gemini call here).
   */
  async uploadAndEnqueue(
    studentId: string,
    file: Express.Multer.File,
  ): Promise<{ uploadId: string; status: string }> {
    // Fail before touching storage or the database: a 503 raised after the
    // record is created would strand it in PROCESSING with nothing to finish it.
    const extractionQueue = this.extractionQueue;
    if (!extractionQueue) {
      throw new ServiceUnavailableException(QUEUES_DISABLED_MESSAGE);
    }

    if (!file) {
      throw new BadRequestException('No file provided (field name: "file")');
    }

    // ── Validate & normalize MIME type ───────────────────────────
    const resolvedMime = resolveExamMimeType(file);
    if (!resolvedMime) {
      throw new BadRequestException(
        `Unsupported file type. Allowed: ${SUPPORTED_EXAM_MIME_TYPES.join(', ')}`,
      );
    }

    // ── Validate size (≤ 15 MB) ─────────────────────────────────
    const maxSize =
      this.config.get<number>('STYLE_UPLOAD_MAX_SIZE') ?? MAX_UPLOAD_SIZE;
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File size exceeds ${maxSize / (1024 * 1024)} MB limit`,
      );
    }

    // ── Generate S3 key under temp-style-sources/ prefix ───────
    const timestamp = Date.now();
    const safeName = (file.originalname || 'upload').replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );
    const s3Key = `temp-style-sources/${timestamp}-${safeName}`;

    // ── Upload to S3 ────────────────────────────────────────────
    await this.storage.uploadFile(s3Key, file.buffer, resolvedMime);

    // ── Create DB record ────────────────────────────────────────
    const upload = await this.prisma.styleSourceUpload.create({
      data: {
        studentId,
        s3Key,
        mimeType: resolvedMime,
        fileSize: file.size,
        status: 'PROCESSING',
      },
      select: { id: true, status: true },
    });

    // ── Enqueue async extraction job ─────────────────────────────
    await extractionQueue.add(
      'extract-style-matrix',
      { uploadId: upload.id, s3Key, mimeType: resolvedMime },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );

    this.logger.log(
      `Style upload ${upload.id} enqueued for extraction (${file.originalname}, ${file.size} bytes)`,
    );

    return { uploadId: upload.id, status: upload.status };
  }

  /**
   * Get the processing status of a style upload.
   * Returns 422 payload if FAILED, otherwise the status and available styleMatrix.
   */
  async getUploadStatus(uploadId: string, studentId: string) {
    const upload = await this.prisma.styleSourceUpload.findUnique({
      where: { id: uploadId },
      select: {
        id: true,
        status: true,
        errorLog: true,
        styleMatrix: true,
        createdAt: true,
        updatedAt: true,
        studentId: true,
      },
    });

    if (!upload || upload.studentId !== studentId) {
      throw new BadRequestException('Upload not found or access denied');
    }

    if (upload.status === 'FAILED') {
      throw new UnprocessableEntityException({
        message: 'Style extraction failed for the uploaded file',
        uploadId,
        error: upload.errorLog ?? 'Unknown extraction error',
      });
    }

    return {
      uploadId: upload.id,
      status: upload.status,
      styleMatrixAvailable: upload.styleMatrix !== null,
      createdAt: upload.createdAt,
      updatedAt: upload.updatedAt,
    };
  }
}
