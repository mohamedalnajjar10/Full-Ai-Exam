import * as dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../../.env' });

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * عملية الـ worker: نفس التطبيق بدون خادم HTTP، وبتشغّل مهام المعالجة
 * الثقيلة (تعرّف ضوئي محلي، تضمين محلي، استخراج أسئلة). هيك الـ API بيضل
 * يرد فوراً حتى وكتاب من 300 صفحة قيد المعالجة.
 *
 * الدور لازم ينضبط قبل تحميل الموديولات — قرار تسجيل الـ processors
 * بينأخذ وقت تعريفها (انظر common/queues.ts)، فمنحمّل AppModule بعده.
 */
process.env.PROCESS_ROLE = 'worker';

async function bootstrap() {
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
  Logger.log(
    'Worker started: processing uploads and embeddings (no HTTP)',
    'Worker',
  );
}

void bootstrap();
