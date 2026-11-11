import {
  Controller,
  Get,
  Query,
  Res,
  BadRequestException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public, Throttle, ThrottleGuard } from '../common';
import { LocalStorageDriver } from './drivers/local-storage.driver';

/**
 * يخدم الملفات المخزّنة محلياً عبر رابط موقّع وله وقت انتهاء.
 *
 * هاد مقابل presigned URL تبع S3 لما ما يكون في سيرفر تخزين. الرابط
 * `@Public()` لأن التوقيع نفسه هو الإذن — بالضبط متل روابط S3 المؤقتة —
 * والتوقيع بينتحقق منه بـ timingSafeEqual وبينتهي بعد مدة.
 * محمي بحارس ThrottleGuard للوقاية من هجمات DoS أو التحميل العشوائي المكثف.
 */
@ApiExcludeController()
@Controller('files')
@UseGuards(ThrottleGuard)
export class FilesController {
  constructor(private readonly local: LocalStorageDriver) {}

  @Public()
  @UseGuards(ThrottleGuard)
  @Throttle({ limit: 60, windowMs: 60_000 })
  @Get()
  async serve(
    @Query('key') key: string,
    @Query('expires') expires: string,
    @Query('sig') sig: string,
    @Query('name') name: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!key || !expires || !sig) {
      throw new BadRequestException('Missing file parameters');
    }

    if (!this.local.verify(key, Number(expires), sig)) {
      throw new ForbiddenException('This link is invalid or has expired');
    }

    const filename = encodeURIComponent(name || key.split('/').pop() || 'file');

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${filename}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=0, no-store');

    if (typeof this.local.getFileStream === 'function') {
      const fileStream = await this.local.getFileStream(key);
      if (fileStream.contentLength) {
        res.setHeader('Content-Length', fileStream.contentLength.toString());
      }
      fileStream.stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      fileStream.stream.pipe(res);
      return;
    }

    const file = await this.local.getFileBuffer(key);
    res.send(file);
  }
}
