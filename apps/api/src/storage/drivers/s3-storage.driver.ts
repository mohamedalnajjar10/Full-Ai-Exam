import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';
import { createReadStream } from 'fs';
import { readFile, stat } from 'fs/promises';
import { join, normalize, resolve } from 'path';
import type {
  StorageDriver,
  StorageFileStream,
} from './storage-driver.interface';

/**
 * محرّك التخزين السحابي عبر S3 / MinIO.
 *
 * يعتمد على خادم MinIO المحلي (docker-compose: minio:9000) أو أي خدمة S3 متوافقة.
 * تم إلغاء الرفع المحلي ليتم حفظ وجلب كافة الكتب والمصادر والامتحانات عبر MinIO حصراً.
 */
@Injectable()
export class S3StorageDriver implements StorageDriver, OnModuleInit {
  private readonly logger = new Logger(S3StorageDriver.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly selfHosted: boolean;

  constructor(private readonly config: ConfigService) {
    const isProduction = this.config.get<string>('NODE_ENV') === 'production';
    const region = this.config.get<string>('AWS_REGION') || 'us-east-1';
    const rawEndpoint = this.config.get<string>('AWS_S3_ENDPOINT');
    const endpoint =
      rawEndpoint || this.config.get<string>('MINIO_ENDPOINT') || undefined;
    const accessKeyId =
      this.config.get<string>('AWS_ACCESS_KEY_ID') ||
      this.config.get<string>('MINIO_ROOT_USER');
    const secretAccessKey =
      this.config.get<string>('AWS_SECRET_ACCESS_KEY') ||
      this.config.get<string>('MINIO_ROOT_PASSWORD');
    this.bucket =
      this.config.get<string>('AWS_S3_BUCKET_NAME') ||
      this.config.get<string>('MINIO_BUCKET') ||
      'ai-exam-project';
    this.selfHosted = Boolean(endpoint);

    if (isProduction && (!accessKeyId || !secretAccessKey)) {
      throw new Error(
        'Missing storage credentials: AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required in production',
      );
    }

    const s3Config: ConstructorParameters<typeof S3Client>[0] = {
      region,
    };
    if (accessKeyId && secretAccessKey) {
      s3Config.credentials = {
        accessKeyId,
        secretAccessKey,
      };
    }
    if (endpoint) {
      s3Config.endpoint = endpoint;
      s3Config.forcePathStyle = true;
    }

    this.s3 = new S3Client(s3Config);
    this.logger.log(
      `S3/MinIO Storage initialized on bucket "${this.bucket}" (endpoint: ${endpoint || 'AWS S3'})`,
    );
  }

  async onModuleInit(): Promise<void> {
    if (this.selfHosted) {
      await this.ensureBucketExists();
    }
  }

  /**
   * البحث عن الـ bucket الذي يحتوي على المفتاح فعلياً من بين الحاويات الممكنة.
   */
  async findBucketFor(key: string): Promise<string> {
    const candidateBuckets = [
      this.bucket,
      'ai-exam-project',
      'ai-exam',
      'ai-exam-bank-storage',
    ].filter((b, idx, arr) => Boolean(b) && arr.indexOf(b) === idx);

    for (const b of candidateBuckets) {
      try {
        await this.s3.send(new HeadObjectCommand({ Bucket: b, Key: key }));
        return b;
      } catch {}
    }
    return this.bucket;
  }

  /**
   * التحقق من وجود الـ Bucket على MinIO وإنشائه تلقائياً إذا لم يكن موجوداً.
   */
  private async ensureBucketExists(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`Verified MinIO bucket "${this.bucket}" exists`);
    } catch (err: unknown) {
      const errorObj = err as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        errorObj?.name === 'NoSuchBucket' ||
        errorObj?.name === 'NotFound' ||
        errorObj?.$metadata?.httpStatusCode === 404
      ) {
        try {
          await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(
            `Created missing MinIO bucket "${this.bucket}" successfully`,
          );
        } catch (createErr: unknown) {
          const cErr = createErr as { name?: string; message?: string };
          if (
            cErr?.name !== 'BucketAlreadyOwnedByYou' &&
            cErr?.name !== 'BucketAlreadyExists'
          ) {
            this.logger.warn(
              `Could not create bucket "${this.bucket}": ${cErr?.message}`,
            );
          }
        }
      } else {
        this.logger.warn(
          `MinIO connection check warning: ${(err as Error)?.message}`,
        );
      }
    }
  }

  async uploadFile(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    try {
      return await this.put(key, body, contentType);
    } catch (err: unknown) {
      const errorObj = err as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
      };
      if (
        errorObj?.name === 'NoSuchBucket' ||
        errorObj?.name === 'NotFound' ||
        errorObj?.$metadata?.httpStatusCode === 404
      ) {
        if (!this.selfHosted) {
          throw new Error(
            `S3 bucket "${this.bucket}" does not exist — create it or fix AWS_S3_BUCKET_NAME`,
          );
        }
        await this.s3
          .send(new CreateBucketCommand({ Bucket: this.bucket }))
          .catch((e: { name?: string }) => {
            if (
              e?.name !== 'BucketAlreadyOwnedByYou' &&
              e?.name !== 'BucketAlreadyExists'
            )
              throw e;
          });
        this.logger.warn(
          `Created missing bucket "${this.bucket}" during upload`,
        );
        return this.put(key, body, contentType);
      }
      throw err;
    }
  }

  private async put(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const upload = new Upload({
      client: this.s3,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      },
      queueSize: 4,
      leavePartsOnError: false,
    });
    await upload.done();
    this.logger.log(
      `Uploaded ${key} (${body.length} bytes) to MinIO bucket "${this.bucket}"`,
    );
    return key;
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    const candidateBuckets = [
      this.bucket,
      'ai-exam-project',
      'ai-exam',
      'ai-exam-bank-storage',
    ].filter((b, idx, arr) => Boolean(b) && arr.indexOf(b) === idx);

    let lastNotFound = false;

    for (const b of candidateBuckets) {
      try {
        const response = await this.s3.send(
          new GetObjectCommand({ Bucket: b, Key: key }),
        );
        let buffer: Buffer;
        if (
          response.Body &&
          typeof (response.Body as any).transformToByteArray === 'function'
        ) {
          const bytes = await (response.Body as any).transformToByteArray();
          buffer = Buffer.from(bytes);
        } else {
          const stream = response.Body as Readable;
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          buffer = Buffer.concat(chunks);
        }

        if (b !== this.bucket) {
          this.logger.log(
            `Found file "${key}" in bucket "${b}", syncing to active bucket "${this.bucket}"...`,
          );
          this.put(key, buffer, 'application/pdf').catch((putErr) =>
            this.logger.warn(
              `Failed to sync "${key}" to active bucket: ${putErr}`,
            ),
          );
        }
        return buffer;
      } catch (err: unknown) {
        const errorObj = err as {
          name?: string;
          $metadata?: { httpStatusCode?: number };
        };
        if (
          errorObj?.name === 'NoSuchKey' ||
          errorObj?.name === 'NotFound' ||
          errorObj?.$metadata?.httpStatusCode === 404
        ) {
          lastNotFound = true;
          continue;
        }
        throw err;
      }
    }

    if (lastNotFound) {
      // فحص ترحيلي: إذا كان الملف رُفع محلياً أثناء التطوير، نقله إلى MinIO وإرجاعه
      const localPath = resolve(join('./uploads', normalize(key)));
      try {
        const buffer = await readFile(localPath);
        this.logger.log(
          `Migrating legacy local file "${key}" (${buffer.length} bytes) to MinIO...`,
        );
        this.put(key, buffer, 'application/pdf').catch((putErr) =>
          this.logger.warn(
            `Background migration of "${key}" to MinIO failed: ${putErr}`,
          ),
        );
        return buffer;
      } catch {
        throw new NotFoundException(`File not found in MinIO storage: ${key}`);
      }
    }

    throw new NotFoundException(`File not found in MinIO storage: ${key}`);
  }

  async getFileStream(key: string): Promise<StorageFileStream> {
    const candidateBuckets = [
      this.bucket,
      'ai-exam-project',
      'ai-exam',
      'ai-exam-bank-storage',
    ].filter((b, idx, arr) => Boolean(b) && arr.indexOf(b) === idx);

    let lastNotFound = false;

    for (const b of candidateBuckets) {
      try {
        const response = await this.s3.send(
          new GetObjectCommand({ Bucket: b, Key: key }),
        );
        if (!response.Body) {
          continue;
        }

        const stream: Readable =
          typeof (response.Body as any)?.pipe === 'function'
            ? (response.Body as Readable)
            : Readable.from(response.Body as any);

        return {
          stream,
          contentLength: response.ContentLength,
          contentType: response.ContentType || 'application/pdf',
        };
      } catch (err: unknown) {
        const errorObj = err as {
          name?: string;
          $metadata?: { httpStatusCode?: number };
        };
        if (
          errorObj?.name === 'NoSuchKey' ||
          errorObj?.name === 'NotFound' ||
          errorObj?.$metadata?.httpStatusCode === 404
        ) {
          lastNotFound = true;
          continue;
        }
        throw err;
      }
    }

    if (lastNotFound) {
      // فحص ترحيلي: إذا كان الملف رُفع محلياً أثناء التطوير، إرجاع ستريم منه
      const localPath = resolve(join('./uploads', normalize(key)));
      try {
        const stats = await stat(localPath);
        const stream = createReadStream(localPath);
        return {
          stream,
          contentLength: stats.size,
          contentType: 'application/pdf',
        };
      } catch {
        throw new NotFoundException(`File not found in MinIO storage: ${key}`);
      }
    }

    throw new NotFoundException(`File not found in MinIO storage: ${key}`);
  }

  async getPresignedUrl(
    key: string,
    originalName?: string | null,
    expiresIn = 3600,
  ): Promise<string> {
    const targetBucket = await this.findBucketFor(key);
    const rawName = originalName || 'book.pdf';
    const cleanAscii = rawName.replace(/[^\x20-\x7E]/g, '_');
    const encodedName = encodeURIComponent(rawName);

    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: key,
      ResponseContentType: 'application/pdf',
      ResponseContentDisposition: `attachment; filename="${cleanAscii}"; filename*=UTF-8''${encodedName}`,
    });
    return getSignedUrl(this.s3, command, { expiresIn });
  }

  async deleteFile(key: string): Promise<void> {
    const candidateBuckets = [
      this.bucket,
      'ai-exam-project',
      'ai-exam',
      'ai-exam-bank-storage',
    ].filter((b, idx, arr) => Boolean(b) && arr.indexOf(b) === idx);

    for (const b of candidateBuckets) {
      try {
        await this.s3.send(new DeleteObjectCommand({ Bucket: b, Key: key }));
        this.logger.log(`Deleted ${key} from MinIO bucket "${b}"`);
      } catch (err: unknown) {
        // ignore errors on secondary buckets
      }
    }
  }
}
