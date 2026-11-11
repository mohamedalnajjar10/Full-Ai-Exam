import type { Readable } from 'stream';

export interface StorageFileStream {
  stream: Readable;
  contentLength?: number;
  contentType?: string;
}

/**
 * واجهة التخزين — المشروع كله بيتعامل معها، مش مع S3 مباشرة.
 *
 * المفاتيح (keys) نصوص مبهمة محفوظة بقاعدة البيانات (bookPdfKey، s3Key،
 * imageKey)، فتبديل الـ backend ما بيحتاج أي تعديل على السكيما.
 */
export interface StorageDriver {
  /** يرفع ملف ويرجّع مفتاحه. */
  uploadFile(key: string, body: Buffer, contentType: string): Promise<string>;

  /** يجيب محتوى ملف. */
  getFileBuffer(key: string): Promise<Buffer>;

  /** يجيب تدفق (Stream) للملف لتفادي تحميل الملف كاملاً في الذاكرة أثناء التحميل. */
  getFileStream(key: string): Promise<StorageFileStream>;

  /** رابط تحميل محدود بالوقت. */
  getPresignedUrl(
    key: string,
    originalName?: string | null,
    expiresIn?: number,
  ): Promise<string>;

  /** يحذف ملف. الحذف لملف غير موجود ما بيرمي خطأ. */
  deleteFile(key: string): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');
