import { Logger } from '@nestjs/common';

/**
 * التحقق من متغيّرات البيئة عند الإقلاع.
 *
 * ConfigModule كان بدون أي تحقق، فكل القيم كانت بتوصل كنصوص. يعني:
 *   - `GET /questions/quota` كان يرجّع `"quotaLimit": "20"` بدل رقم
 *   - `config.get<number>('X') ?? 20` ما بتشتغل أبداً لأن "" و"20" مش nullish
 *   - EMBEDDING_DIMENSIONS وEMAIL_PORT نفس القصة
 *
 * هون منحوّل الأنواع مرة وحدة ومنفشل بسرعة لو في إشي ناقص بالإنتاج،
 * بدل ما نكتشفه من سلوك غريب بعدين.
 */

const logger = new Logger('EnvValidation');

type Raw = Record<string, unknown>;

function asInt(
  raw: Raw,
  key: string,
  fallback: number,
  errors: string[],
): number {
  const value = raw[key];
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    errors.push(`${key} must be an integer, got "${String(value)}"`);
    return fallback;
  }
  return parsed;
}

function required(raw: Raw, key: string, errors: string[]): string | undefined {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`${key} is required`);
    return undefined;
  }
  return value;
}

export function validateEnv(raw: Raw): Raw {
  const errors: string[] = [];
  const nodeEnv = (raw.NODE_ENV as string) ?? 'development';
  const isProduction = nodeEnv === 'production';
  const isStaging = nodeEnv === 'staging';
  const isProductionLike = isProduction || isStaging;

  // دايماً مطلوبة
  required(raw, 'DATABASE_URL', errors);

  // مطلوبة بالإنتاج والـ Staging
  if (isProductionLike) {
    for (const key of ['JWT_SECRET', 'ENCRYPTION_KEY']) {
      required(raw, key, errors);
    }

    if (raw.JWT_SECRET && raw.JWT_SECRET === 'ai-exam-dev-secret') {
      errors.push(
        'JWT_SECRET cannot use the insecure default dev secret in production or staging.',
      );
    }

    // REDIS_URL اختياري: بدونه التطبيق بيشتغل بس مهام الخلفية بتتعطّل.
    // بالإنتاج هاد غالباً مش المقصود، فمنحذّر بدل ما نمنع الإقلاع.
    if (!raw.REDIS_URL) {
      logger.warn(
        'REDIS_URL is not set: background processing (exam extraction, ' +
          'embedding, style analysis) is disabled.',
      );
    }
  }

  const coerced: Raw = {
    ...raw,
    NODE_ENV: nodeEnv,
    PORT: asInt(raw, 'PORT', 3002, errors),
    DAILY_GENERATION_QUOTA: asInt(raw, 'DAILY_GENERATION_QUOTA', 20, errors),
    EMBEDDING_DIMENSIONS: asInt(raw, 'EMBEDDING_DIMENSIONS', 768, errors),
    EMAIL_PORT: asInt(raw, 'EMAIL_PORT', 465, errors),
    MAX_FILE_SIZE: asInt(raw, 'MAX_FILE_SIZE', 20 * 1024 * 1024, errors),
    STYLE_UPLOAD_MAX_SIZE: asInt(
      raw,
      'STYLE_UPLOAD_MAX_SIZE',
      15 * 1024 * 1024,
      errors,
    ),
  };

  if (errors.length > 0) {
    const message = `Invalid environment configuration:\n  - ${errors.join('\n  - ')}`;
    if (isProductionLike) throw new Error(message);
    // بالتطوير منحذّر ومنكمّل بالقيم الافتراضية بدل ما نمنع التشغيل
    logger.warn(message);
  }

  return coerced;
}
