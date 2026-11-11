import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { createReadStream } from 'fs';
import { mkdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { dirname, join, normalize, resolve, sep } from 'path';
import type {
  StorageDriver,
  StorageFileStream,
} from './storage-driver.interface';

/**
 * تخزين على قرص السيرفر — البديل المحلي لـ MinIO/S3.
 *
 * الملفات بتنحفظ تحت UPLOAD_DIR بنفس الـ key يلي محفوظ بقاعدة البيانات،
 * فالتبديل بين المحلي وS3 ما بيأثر على أي صف موجود.
 *
 * `getPresignedUrl` بترجّع رابط موقّع بـ HMAC وله وقت انتهاء، بيخدمه
 * FilesController. هيك بتضل نفس دلالة "رابط مؤقت" بدون أي سيرفر تخزين.
 */
@Injectable()
export class LocalStorageDriver implements StorageDriver {
  private readonly logger = new Logger(LocalStorageDriver.name);
  private readonly root: string;
  private readonly secret: string;
  private readonly publicBase: string;

  constructor(private readonly config: ConfigService) {
    this.root = resolve(this.config.get<string>('UPLOAD_DIR') ?? './uploads');
    this.secret =
      this.config.get<string>('ENCRYPTION_KEY') ??
      this.config.get<string>('JWT_SECRET') ??
      'local-storage-dev-secret';
    this.publicBase =
      this.config.get<string>('BACKEND_URL') ?? 'http://localhost:8088';
    this.logger.log(`Local file storage at ${this.root}`);
  }

  /**
   * يمنع الخروج من مجلد التخزين عبر مفتاح فيه ../
   */
  private pathFor(key: string): string {
    const full = resolve(join(this.root, normalize(key)));
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new NotFoundException('Invalid file key');
    }
    return full;
  }

  async uploadFile(
    key: string,
    body: Buffer,
    // نظام الملفات ما بيخزّن نوع المحتوى؛ الباراميتر موجود حتى يطابق
    // الواجهة ويضل التبديل مع S3 بدون أي تعديل عند المستدعي
    _contentType?: string,
  ): Promise<string> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    this.logger.log(`Stored ${key} (${body.length} bytes)`);
    return key;
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    // التحقق من المسار برّا الـ try: لو المفتاح بيحاول يطلع من المجلد،
    // لازم يوصل الخطأ كما هو بدل ما ينبلع ويصير "الملف غير موجود"
    const path = this.pathFor(key);
    try {
      return await readFile(path);
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  async getFileStream(key: string): Promise<StorageFileStream> {
    const path = this.pathFor(key);
    try {
      const stats = await stat(path);
      const stream = createReadStream(path);
      return {
        stream,
        contentLength: stats.size,
        contentType: 'application/pdf',
      };
    } catch {
      throw new NotFoundException('File not found');
    }
  }

  async getPresignedUrl(
    key: string,
    originalName?: string | null,
    expiresIn = 3600,
  ): Promise<string> {
    const expiresAt = Date.now() + expiresIn * 1000;
    const token = this.sign(key, expiresAt);
    const params = new URLSearchParams({
      key,
      expires: String(expiresAt),
      sig: token,
    });
    if (originalName) params.set('name', originalName);
    return `${this.publicBase}/api/v1/files?${params.toString()}`;
  }

  async deleteFile(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
    this.logger.log(`Deleted ${key}`);
  }

  sign(key: string, expiresAt: number): string {
    return createHmac('sha256', this.secret)
      .update(`${key}:${expiresAt}`)
      .digest('hex');
  }

  verify(key: string, expiresAt: number, signature: string): boolean {
    if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
    const expected = Buffer.from(this.sign(key, expiresAt));
    const given = Buffer.from(signature);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }
}
