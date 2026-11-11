import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  STORAGE_DRIVER,
  type StorageDriver,
  type StorageFileStream,
} from './drivers/storage-driver.interface';

/**
 * نقطة التعامل الوحيدة مع التخزين.
 *
 * صارت تفوّض لـ driver بدل ما تكلّم S3 مباشرة، فالمشروع بيشتغل بدون
 * MinIO ولا أي سيرفر تخزين: لو ما في إعدادات S3 بينحفظ الملف على قرص
 * السيرفر. المفاتيح هي هي بالحالتين، فما في تعديل على قاعدة البيانات
 * ولا على أي استدعاء موجود (٧ خدمات بتستعملها).
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(@Inject(STORAGE_DRIVER) private readonly driver: StorageDriver) {}

  uploadFile(key: string, body: Buffer, contentType: string): Promise<string> {
    return this.driver.uploadFile(key, body, contentType);
  }

  getFileBuffer(key: string): Promise<Buffer> {
    return this.driver.getFileBuffer(key);
  }

  getFileStream(key: string): Promise<StorageFileStream> {
    return this.driver.getFileStream(key);
  }

  getPresignedUrl(
    key: string,
    originalName?: string | null,
    expiresIn = 3600,
  ): Promise<string> {
    return this.driver.getPresignedUrl(key, originalName, expiresIn);
  }

  deleteFile(key: string): Promise<void> {
    return this.driver.deleteFile(key);
  }
}
