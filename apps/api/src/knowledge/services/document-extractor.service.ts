import path from 'path';
import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy, renderPageAsImage } from 'unpdf';
import { GeminiService } from '../../gemini/gemini.service';
import type { ExtractedPage, OcrEngine, OcrLanguage } from '../knowledge.types';

/** صفحات بين كل نقطة حفظ وتانية بالتعرّف المحلي */
const LOCAL_OCR_PAGES_PER_BATCH = 4;

/**
 * دقة رسم الصفحة قبل Tesseract. 2 = ~150 نقطة/إنش لصفحة A4 — أقل من هيك
 * الحروف العربية الصغيرة بتتلخبط، وأعلى بطّأ بدون فرق يُذكر.
 */
const LOCAL_OCR_SCALE = 2;

/** ثقة Tesseract (0–100) تحتها الصفحة بتنعلّم للمراجعة بالسجل */
export const LOCAL_OCR_LOW_CONFIDENCE = 60;

/** صفحة طبقة النص فيها أقل من هيك حروف بتعتبر فاضية (غالباً ممسوحة ضوئياً) */
const MIN_TEXT_LAYER_CHARS = 40;

/** نتيجة دفعة تعرّف ضوئي — بتنرفع للـ pipeline حتى يحفظ ويسجّل أول بأول */
export interface OcrBatchResult {
  pages: number[];
  ok: boolean;
  extracted: ExtractedPage[];
  error?: string;
}

@Injectable()
export class DocumentExtractorService {
  private readonly logger = new Logger(DocumentExtractorService.name);

  constructor(private readonly ai: GeminiService) {}

  isPdf(mimeType: string) {
    return mimeType === 'application/pdf';
  }

  async pageCount(buffer: Buffer, mimeType: string): Promise<number> {
    if (!this.isPdf(mimeType)) return 1;
    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdf.getPageCount();
  }

  /**
   * نص كل صفحة من طبقة النص تبع الـ PDF، بدون أي نموذج. visualPages =
   * صفحات كان العربي فيها مخزّن بترتيب العرض وانصلح (الإصلاح تقريبي).
   */
  async extractTextLayer(
    buffer: Buffer,
  ): Promise<{ pages: ExtractedPage[]; visualPages: number[] }> {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: false });
    const visualPages: number[] = [];
    const pages = text.map((t, i) => {
      const fixed = repairVisualArabic(t ?? '');
      if (fixed.repaired) visualPages.push(i + 1);
      return { page: i + 1, text: fixed.text, source: 'text' as const };
    });
    return { pages, visualPages };
  }

  /** عدد الصفحات يلي طبقة النص فيها شبه فاضية */
  emptyPages(pages: ExtractedPage[]): number[] {
    return pages
      .filter((p) => p.text.replace(/\s+/g, '').length < MIN_TEXT_LAYER_CHARS)
      .map((p) => p.page);
  }

  /**
   * تعرّف ضوئي على صفحات الملف. محركين:
   * - local: Tesseract على السيرفر نفسه — مجاني، بدون مفتاح ولا حدود يومية،
   *   ~2–6 ث للصفحة. ممتاز للنص العربي العادي، ضعيف بالتشكيل الكامل
   *   والمعادلات.
   * - ai: نموذج اللغة (Claude أو OpenRouter) — أدق بالتشكيل والمعادلات
   *   وبيطلّع العناوين وLaTeX، بس بيكلّف أو بيتقيّد بحدود النماذج المجانية.
   * onBatch بيتنادى بعد كل دفعة (نجحت أو فشلت) — الحفظ وإعادة المحاولة
   * وقرار الفشل عند الـ pipeline.
   */
  async ocr(
    buffer: Buffer,
    mimeType: string,
    opts: {
      engine?: OcrEngine;
      ocrLang: OcrLanguage;
      keepLatex: boolean;
      pages?: number[];
    },
    onBatch: (result: OcrBatchResult) => Promise<void>,
  ): Promise<void> {
    return (opts.engine ?? 'local') === 'local'
      ? this.localOcr(buffer, mimeType, opts, onBatch)
      : this.aiOcr(buffer, mimeType, opts, onBatch);
  }

  /**
   * Tesseract محلياً (نفس أسلوب مشروع store): كل صفحة بتنرسم لصورة بـ
   * unpdf + @napi-rs/canvas وبتنقرا. عامل واحد للملف كامل — تحميل بيانات
   * اللغة (مرة وحدة، بتنخزّن بـ .cache/tesseract) أغلى من الصفحة نفسها.
   */
  private async localOcr(
    buffer: Buffer,
    mimeType: string,
    opts: { ocrLang: OcrLanguage; pages?: number[] },
    onBatch: (result: OcrBatchResult) => Promise<void>,
  ): Promise<void> {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(opts.ocrLang.split('+'), 1, {
      cachePath: path.resolve(process.cwd(), '.cache/tesseract'),
    });
    try {
      if (!this.isPdf(mimeType)) {
        const { data } = await worker.recognize(buffer);
        await onBatch({
          pages: [1],
          ok: Boolean(data.text?.trim()),
          extracted: data.text?.trim()
            ? [
                {
                  page: 1,
                  text: data.text,
                  source: 'ocr',
                  confidence: data.confidence,
                },
              ]
            : [],
          error: data.text?.trim()
            ? undefined
            : 'no text recognised in the image',
        });
        return;
      }

      const total =
        opts.pages ??
        Array.from(
          { length: await this.pageCount(buffer, mimeType) },
          (_, i) => i + 1,
        );
      for (const batch of consecutiveBatches(
        total,
        LOCAL_OCR_PAGES_PER_BATCH,
      )) {
        try {
          const extracted: ExtractedPage[] = [];
          for (const page of batch) {
            // نسخة جديدة لكل صفحة: pdf.js بيفصل (detach) الـ buffer يلي بياخده
            const image = await renderPageAsImage(
              new Uint8Array(buffer),
              page,
              {
                scale: LOCAL_OCR_SCALE,
                canvasImport: () => import('@napi-rs/canvas'),
              },
            );
            const { data } = await worker.recognize(Buffer.from(image));
            extracted.push({
              page,
              text: data.text ?? '',
              source: 'ocr',
              confidence: data.confidence,
            });
          }
          if (extracted.every((p) => !p.text.trim())) {
            throw new Error(
              'no text recognised on these pages (blank or images only)',
            );
          }
          await onBatch({ pages: batch, ok: true, extracted });
        } catch (err) {
          this.logger.warn(
            `Local OCR failed for pages ${batch[0]}-${batch.at(-1)}: ${String(err)}`,
          );
          await onBatch({
            pages: batch,
            ok: false,
            extracted: [],
            error: String(err),
          });
        }
      }
    } finally {
      await worker.terminate();
    }
  }

  /**
   * تعرّف ضوئي بالنموذج. الـ PDF بينقسم لدفعات صغيرة بـ pdf-lib (بدون
   * رسم صفحات، فما في حاجة لـ canvas)، وكل دفعة بتتفرّغ لحالها.
   * onBatch بيتنادى بعد كل دفعة (نجحت أو فشلت) — الحفظ وإعادة المحاولة
   * وقرار الفشل عند الـ pipeline.
   */
  private async aiOcr(
    buffer: Buffer,
    mimeType: string,
    opts: { ocrLang: OcrLanguage; keepLatex: boolean; pages?: number[] },
    onBatch: (result: OcrBatchResult) => Promise<void>,
  ): Promise<void> {
    const run = async (bytes: Buffer, mime: string, batch: number[]) => {
      try {
        const out = await this.ai.transcribePages(bytes, mime, {
          firstPage: batch[0],
          pageCount: batch.length,
          ocrLang: opts.ocrLang,
          keepLatex: opts.keepLatex,
        });
        // نماذج التفكير (reasoning) أحياناً بترجع رد فاضي — هاد فشل مش نجاح،
        // وإلا الصفحات بتنحفظ فاضية وما بتنعاد
        if (out.every((p) => !p.text.trim())) {
          throw new Error('model returned an empty transcription');
        }
        const byPage = new Map(out.map((p) => [p.page, p.text]));
        // صورة = صفحة وحدة؛ الناتج كله إلها حتى لو النموذج رقّمها غلط
        const text = (n: number) =>
          batch.length === 1
            ? out.map((p) => p.text).join('\n\n')
            : (byPage.get(n) ?? '');
        await onBatch({
          pages: batch,
          ok: true,
          extracted: batch.map((n) => ({
            page: n,
            text: text(n),
            source: 'ocr' as const,
          })),
        });
      } catch (err) {
        this.logger.warn(
          `OCR failed for pages ${batch[0]}-${batch.at(-1)}: ${String(err)}`,
        );
        await onBatch({
          pages: batch,
          ok: false,
          extracted: [],
          error: String(err),
        });
      }
    };

    if (!this.isPdf(mimeType)) return run(buffer, mimeType, [1]);
    for await (const { pages, bytes } of this.pdfBatches(
      buffer,
      this.ai.documentPagesPerRequest('ocr'),
      opts.pages,
    )) {
      await run(bytes, 'application/pdf', pages);
    }
  }

  /**
   * بيقسم الـ PDF لملفات صغيرة من صفحات متتالية بـ pdf-lib (بدون رسم
   * صفحات). كل نموذج بيقرا دفعة صغيرة أسرع وأدق من ملف كامل، وطلب فاشل
   * بيضيّع دفعة بس مش الملف.
   */
  async *pdfBatches(
    buffer: Buffer,
    size: number,
    only?: number[],
  ): AsyncGenerator<{ pages: number[]; bytes: Buffer; totalPages: number }> {
    const src = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const all =
      only ?? Array.from({ length: src.getPageCount() }, (_, i) => i + 1);
    for (const batch of consecutiveBatches(all, size)) {
      const part = await PDFDocument.create();
      const copied = await part.copyPages(
        src,
        batch.map((p) => p - 1),
      );
      copied.forEach((p) => part.addPage(p));
      yield {
        pages: batch,
        bytes: Buffer.from(await part.save()),
        totalPages: all.length,
      };
    }
  }
}

const PRESENTATION_FORMS = /[ﭐ-﷿ﹰ-﻾]/g;
const ARABIC_ANY = /[؀-ۿﭐ-﷿ﹰ-﻾]/g;

/**
 * ملفات PDF عربية كتير بتخزّن طبقة النص بترتيب العرض: أشكال العرض
 * (U+FE70…) وكل سطر مقلوب. منكشفها من نسبة أشكال العرض، ومنقلب السطر
 * ومنرجّع الحروف لأصلها بـ NFKC. الإصلاح تقريبي — pdf.js أحياناً بيخلط
 * مقاطع بالترتيب المنطقي — فالتعرّف الضوئي بيضل الأدق للكتب العربية.
 */
export function repairVisualArabic(text: string): {
  text: string;
  repaired: boolean;
} {
  let repaired = false;
  const lines = text.split('\n').map((line) => {
    const forms = line.match(PRESENTATION_FORMS)?.length ?? 0;
    const arabic = line.match(ARABIC_ANY)?.length ?? 0;
    if (arabic >= 4 && forms / arabic > 0.3) {
      repaired = true;
      return [...line].reverse().join('').normalize('NFKC');
    }
    return line;
  });
  return { text: lines.join('\n'), repaired };
}

/** دفعات من صفحات متتالية — صفحات غير متتالية ما بتنجمع بدفعة وحدة */
export function consecutiveBatches(pages: number[], size: number): number[][] {
  const sorted = [...pages].sort((a, b) => a - b);
  const out: number[][] = [];
  let cur: number[] = [];
  for (const p of sorted) {
    if (cur.length && (cur.length >= size || p !== cur[cur.length - 1] + 1)) {
      out.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) out.push(cur);
  return out;
}
