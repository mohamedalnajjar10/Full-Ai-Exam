import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  DEFAULT_INGESTION_OPTIONS,
  IngestionOptions,
  normalizeOptions,
} from '../knowledge.types';

const KEY = 'ingestion.defaults';

/**
 * الخيارات الافتراضية للوحة المعالجة. كل دفعة جديدة بتحفظ خياراتها هون،
 * فاللوحة بتفتح على آخر إعدادات استعملها أي مشرف.
 */
@Injectable()
export class IngestionSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<IngestionOptions> {
    const row = await this.prisma.appSetting.findUnique({
      where: { key: KEY },
    });
    return normalizeOptions(
      row?.value as Partial<IngestionOptions> | undefined,
      DEFAULT_INGESTION_OPTIONS,
    );
  }

  async save(
    input: Partial<IngestionOptions>,
    userId?: string,
  ): Promise<IngestionOptions> {
    const value = normalizeOptions(input, await this.get());
    await this.prisma.appSetting.upsert({
      where: { key: KEY },
      create: {
        key: KEY,
        value: value as unknown as Prisma.InputJsonValue,
        updatedBy: userId,
      },
      update: {
        value: value as unknown as Prisma.InputJsonValue,
        updatedBy: userId,
      },
    });
    return value;
  }
}
