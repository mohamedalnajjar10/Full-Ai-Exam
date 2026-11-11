import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StorageService } from './storage.service';
import { STORAGE_DRIVER } from './drivers/storage-driver.interface';
import { S3StorageDriver } from './drivers/s3-storage.driver';

/**
 * وحدة التخزين الرئيسية للنظام عبر MinIO / S3 حصراً.
 *
 * تم إلغاء الرفع والتخزين المحلي (Local Storage Driver) بالكامل وفق متطلبات
 * ملف CRITICAL_ISSUES_REPORT.md، لضمان رفع وتخزين ومشاركة الكتب والامتحانات
 * عبر خادم MinIO السحابي المشترك (Container: minio:9000).
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    S3StorageDriver,
    {
      provide: STORAGE_DRIVER,
      useClass: S3StorageDriver,
    },
    StorageService,
  ],
  exports: [StorageService, S3StorageDriver],
})
export class StorageModule {}
