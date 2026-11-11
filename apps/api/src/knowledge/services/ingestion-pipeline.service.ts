import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BloomTaxonomyLevel,
  DifficultyLevel,
  IngestionStage,
  KnowledgeDocument,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import {
  EMBEDDING_BATCH_SIZE,
  ExtractedQuestionWithMeta,
  ExtractionOptions,
  GeminiService,
} from '../../gemini/gemini.service';
import {
  DocumentExtractorService,
  LOCAL_OCR_LOW_CONFIDENCE,
} from './document-extractor.service';
import { cleanPages, normalizeForSearch } from '../text/cleanup';
import { chunkPages } from '../text/chunker';
import {
  DuplicateIndex,
  blocksAutoApprove,
  questionFlags,
} from '../text/questions';
import {
  ExtractedPage,
  IngestionOptions,
  normalizeOptions,
} from '../knowledge.types';

export interface LogLine {
  at: string;
  level: 'info' | 'warn' | 'error';
  step: string;
  message: string;
}

const MAX_LOG_LINES = 200;
/** أطول من هيك غالباً كتاب انرفع كامتحان بالغلط */
export const EXAM_BOOK_LIKE_PAGES = 24;
const DIFFICULTIES = new Set<string>(Object.values(DifficultyLevel));
const BLOOMS = new Set<string>(Object.values(BloomTaxonomyLevel));

/** مفتاح الصفحات المستخرجة بالتخزين — إعادة التقطيع بتقرأ منه بدل ما تعيد الاستخراج */
export function pagesKey(documentId: string) {
  return `knowledge/${documentId}/pages.json`;
}

/**
 * نقطة حفظ أثناء التعرّف الضوئي: الصفحات يلي خلصت لحد هلق. إذا السيرفر
 * رجع قام، أو المهمة فشلت وانعادت، منكمّل من هون بدل صفحة 1.
 */
export function partialPagesKey(documentId: string) {
  return `knowledge/${documentId}/pages.partial.json`;
}

/**
 * أخطاء حساب ما بتتصلّح بإعادة المحاولة: رصيد خالص، مفتاح غلط أو مش تابع
 * لـ workspace، صلاحيات ناقصة. بخلاف الضغط والمهلة يلي بيعدّوا لحالهم.
 */
export function isAccountError(message?: string): boolean {
  return /credit balance|not scoped to a workspace|invalid x-api-key|authentication_error|permission_error|\b40[13]\b/i.test(
    message ?? '',
  );
}

/** دورات التعرّف الضوئي: الأولى على كل الصفحات، والتانية على يلي فشل بس */
const OCR_PASSES = 2;

/** مراحل الملف وهو بالطابور أو قيد المعالجة */
export const RUNNING_STAGES: IngestionStage[] = [
  'UPLOADED',
  'EXTRACTING',
  'CHUNKING',
  'EMBEDDING',
];

/**
 * منطق خط المعالجة. الـ processor بيستدعيه، وهون كل شي بيتعلق بالمراحل
 * والتقدّم والسجل، حتى ينفحص بدون BullMQ.
 */
@Injectable()
export class IngestionPipelineService {
  private readonly logger = new Logger(IngestionPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: GeminiService,
    private readonly extractor: DocumentExtractorService,
    private readonly events: EventEmitter2,
  ) {}

  /* ───────── السجل والمراحل ───────── */

  async log(
    docId: string,
    step: string,
    message: string,
    level: LogLine['level'] = 'info',
  ) {
    const line: LogLine = {
      at: new Date().toISOString(),
      level,
      step,
      message,
    };
    // إلحاق بـ jsonb بالقاعدة مباشرة — ما منقرا السجل كامل ومنكتبه
    await this.prisma.$executeRaw`
      UPDATE "KnowledgeDocument"
      SET log = (CASE WHEN jsonb_array_length(log) >= ${MAX_LOG_LINES} THEN log - 0 ELSE log END) || ${JSON.stringify([line])}::jsonb
      WHERE id = ${docId}`;
    this.logger.log(`[${docId}] ${step}: ${message}`);
  }

  private stageStartedAt = new Map<string, number>();

  async enterStage(doc: KnowledgeDocument, stage: IngestionStage) {
    await this.closeStage(doc.id);
    this.stageStartedAt.set(doc.id, Date.now());
    await this.prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { stage, progress: 0, error: null, failedStage: null },
    });
    doc.stage = stage;
  }

  /** بيسجّل مدة المرحلة الحالية قبل ما ننتقل */
  private async closeStage(docId: string) {
    const started = this.stageStartedAt.get(docId);
    if (!started) return;
    this.stageStartedAt.delete(docId);
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: docId },
      select: { stage: true, stageTimings: true },
    });
    if (!doc) return;
    const timings = { ...((doc.stageTimings as Record<string, number>) ?? {}) };
    timings[doc.stage] = (timings[doc.stage] ?? 0) + (Date.now() - started);
    await this.prisma.knowledgeDocument.update({
      where: { id: docId },
      data: { stageTimings: timings },
    });
  }

  async progress(docId: string, pct: number) {
    await this.prisma.knowledgeDocument.update({
      where: { id: docId },
      data: { progress: Math.max(0, Math.min(100, Math.round(pct))) },
    });
  }

  async finish(doc: KnowledgeDocument, stage: 'INDEXED' | 'CHUNKED') {
    await this.closeStage(doc.id);
    await this.prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { stage, progress: 100, finishedAt: new Date() },
    });
    if (doc.examFileId) {
      await this.prisma.examFile.update({
        where: { id: doc.examFileId },
        data: { status: 'COMPLETED', errorLog: null },
      });
    }
  }

  /**
   * فشل نهائي من الطابور نفسه بدون ما يوصل للخط — أهمها «stalled»: العملية
   * ماتت (إعادة تشغيل، kill) أكتر من المسموح، فـ BullMQ بيفشّل المهمة وما
   * حدا بيحدّث الملف. بدون هاد بيضل «قيد المعالجة» للأبد وزر إعادة
   * المحاولة بيرفضه.
   */
  async failIfRunning(docId: string, err: unknown) {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: docId },
      select: { stage: true },
    });
    if (doc && RUNNING_STAGES.includes(doc.stage)) await this.fail(docId, err);
  }

  async fail(docId: string, err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    await this.closeStage(docId).catch(() => undefined);
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: docId },
    });
    if (!doc) return;
    await this.prisma.knowledgeDocument.update({
      where: { id: docId },
      data: {
        failedStage: doc.stage === 'FAILED' ? doc.failedStage : doc.stage,
        stage: 'FAILED',
        error: message.slice(0, 2000),
      },
    });
    if (doc.examFileId) {
      await this.prisma.examFile
        .update({
          where: { id: doc.examFileId },
          data: { status: 'FAILED', errorLog: message },
        })
        .catch(() => undefined);
    }
    await this.log(
      docId,
      'pipeline',
      `FAIL ${message.slice(0, 300)}`,
      'error',
    ).catch(() => undefined);
  }

  private async load(docId: string) {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id: docId },
      include: { subject: { select: { name: true } } },
    });
    if (!doc) throw new Error(`Knowledge document ${docId} not found`);
    return {
      doc,
      options: normalizeOptions(doc.options as Partial<IngestionOptions>),
    };
  }

  /* ───────── نقاط الدخول (من الـ processor) ───────── */

  /**
   * المعالجة الكاملة. بعد فشل، بتكمّل من المرحلة يلي فشلت فيها: الصفحات
   * المستخرجة محفوظة، فالكتاب ما بيرجع يتفرّغ من أوله.
   */
  async process(docId: string) {
    const { doc } = await this.load(docId);
    try {
      if (doc.kind === 'EXAM') {
        await this.processExam(docId);
      } else {
        const resumeFrom = doc.stage === 'FAILED' ? doc.failedStage : null;
        const skipExtract =
          (resumeFrom === 'CHUNKING' || resumeFrom === 'EMBEDDING') &&
          (await this.loadPages(docId)) !== null;
        if (resumeFrom === 'EMBEDDING') await this.embedBook(docId);
        else await this.processBook(docId, { skipExtract });
      }
    } catch (err) {
      await this.fail(docId, err);
      throw err;
    }
  }

  async rechunk(docId: string) {
    try {
      await this.processBook(docId, {
        skipExtract: (await this.loadPages(docId)) !== null,
      });
    } catch (err) {
      await this.fail(docId, err);
      throw err;
    }
  }

  async embed(docId: string) {
    const { doc } = await this.load(docId);
    try {
      if (doc.kind === 'EXAM') await this.reembedExam(docId);
      else await this.embedBook(docId, { all: true });
    } catch (err) {
      await this.fail(docId, err);
      throw err;
    }
  }

  /* ───────── الكتب ───────── */

  private async loadPages(
    docId: string,
    key = pagesKey(docId),
  ): Promise<ExtractedPage[] | null> {
    try {
      const buf = await this.storage.getFileBuffer(key);
      return JSON.parse(buf.toString('utf8')) as ExtractedPage[];
    } catch {
      return null;
    }
  }

  private savePages(key: string, pages: ExtractedPage[]) {
    return this.storage.uploadFile(
      key,
      Buffer.from(JSON.stringify(pages)),
      'application/json',
    );
  }

  private async processBook(docId: string, opts: { skipExtract: boolean }) {
    const { doc, options } = await this.load(docId);

    // ── الاستخراج ──
    let pages: ExtractedPage[];
    const saved = opts.skipExtract ? await this.loadPages(docId) : null;
    const hasGaps =
      saved &&
      options.ocr &&
      doc.pageCount &&
      saved.filter((p) => p.text.trim()).length < doc.pageCount;
    if (saved && !hasGaps) {
      pages = saved;
      await this.log(docId, 'extract', `reuse ${pages.length} extracted pages`);
    } else {
      // صفحات فشلت بالمرة الماضية؟ منكمّلها بس، مش الكتاب كامل
      await this.enterStage(doc, 'EXTRACTING');
      pages = await this.extractBook(doc, options, saved ?? undefined);
      await this.savePages(pagesKey(docId), pages);
      await this.storage
        .deleteFile(partialPagesKey(docId))
        .catch(() => undefined);
    }

    // ── التقطيع ──
    await this.enterStage(doc, 'CHUNKING');
    const cleaned = cleanPages(pages, options);
    const drafts = chunkPages(cleaned, options);
    if (drafts.length === 0) {
      throw new Error(
        'No text was extracted from this file — try enabling OCR',
      );
    }
    await this.progress(docId, 50);

    await this.prisma.$transaction(async (tx) => {
      await tx.knowledgeChunk.deleteMany({ where: { documentId: docId } });
      await tx.knowledgeChunk.createMany({
        data: drafts.map((c, i) => ({
          documentId: docId,
          subjectId: doc.subjectId,
          ordinal: i,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          section: c.section,
          unit: c.unit,
          text: c.text,
          tokens: c.tokens,
        })),
      });
      await tx.knowledgeDocument.update({
        where: { id: docId },
        data: { chunkCount: drafts.length },
      });
    });
    const avg = Math.round(
      drafts.reduce((s, c) => s + c.tokens, 0) / drafts.length,
    );
    await this.log(
      docId,
      'chunk',
      `strategy=${options.strategy} size=${options.chunkSize} overlap=${options.overlap} stripHeaders=${options.stripHeaders} latex=${options.keepLatex} → ${drafts.length} chunks (avg ${avg} tokens)`,
    );

    // ── التضمين ──
    if (!options.embedNow) {
      await this.log(
        docId,
        'embed',
        'skipped (embed immediately is off) — chunks are keyword-searchable only',
      );
      await this.finish(doc, 'CHUNKED');
      return;
    }
    await this.embedBook(docId);
  }

  private async extractBook(
    doc: KnowledgeDocument,
    options: IngestionOptions,
    seed?: ExtractedPage[],
  ): Promise<ExtractedPage[]> {
    const file = await this.storage.getFileBuffer(doc.s3Key);
    const isPdf = this.extractor.isPdf(doc.mimeType);
    const pageCount = await this.extractor.pageCount(file, doc.mimeType);
    await this.prisma.knowledgeDocument.update({
      where: { id: doc.id },
      data: { pageCount },
    });
    await this.log(
      doc.id,
      'validate',
      `${doc.mimeType} · ${pageCount} pages · ${(doc.fileSize / 1048576).toFixed(1)} MB`,
    );

    // صورة ما إلها طبقة نص — التعرّف الضوئي إجباري
    if (!options.ocr && isPdf) {
      const { pages, visualPages } =
        await this.extractor.extractTextLayer(file);
      if (visualPages.length) {
        await this.log(
          doc.id,
          'extract',
          `${visualPages.length} page(s) store Arabic in visual order; repaired approximately — use OCR for exact Arabic text`,
          'warn',
        );
      }
      const empty = this.extractor.emptyPages(pages);
      await this.progress(doc.id, 100);
      await this.log(doc.id, 'extract', `text layer · ${pages.length} pages`);
      if (empty.length) {
        await this.log(
          doc.id,
          'extract',
          `${empty.length} page(s) have no text layer (scanned?): ${empty.slice(0, 15).join(', ')}${empty.length > 15 ? '…' : ''} — enable OCR to read them`,
          'warn',
        );
      }
      if (empty.length === pages.length) {
        throw new Error(
          'The PDF has no text layer (scanned document) — retry with OCR enabled',
        );
      }
      return pages;
    }

    if (!options.ocr) {
      await this.log(
        doc.id,
        'extract',
        'image file: OCR is required and was used anyway',
        'warn',
      );
    }
    return this.ocrBook(doc, options, file, pageCount, seed);
  }

  /**
   * تعرّف ضوئي على كتاب كامل، بحفظ بعد كل دفعة ودورة تانية للصفحات يلي
   * فشلت (النماذج المجانية بتنضغط وبتعلق، والضغط عادة مؤقت). صفحات فشلت
   * بالدورتين بتنترك وبتنسجّل؛ «إعادة التقطيع» أو «إعادة المحاولة»
   * بيكمّلوها بعدين بدون ما يعيدوا الباقي.
   */
  private async ocrBook(
    doc: KnowledgeDocument,
    options: IngestionOptions,
    file: Buffer,
    pageCount: number,
    seed?: ExtractedPage[],
  ): Promise<ExtractedPage[]> {
    const partialKey = partialPagesKey(doc.id);
    const have = new Map<number, ExtractedPage>();
    for (const p of seed ?? (await this.loadPages(doc.id, partialKey)) ?? []) {
      // صفحة محفوظة فاضية = رد فاضي من النموذج (قبل ما نعتبره فشل) — منعيدها
      if (p.text.trim()) have.set(p.page, p);
    }
    const all = Array.from({ length: pageCount }, (_, i) => i + 1);
    let todo = all.filter((p) => !have.has(p));

    await this.log(
      doc.id,
      'extract',
      have.size
        ? `OCR resume: ${have.size}/${pageCount} pages already done, ${todo.length} left (engine=${options.ocrEngine} lang=${options.ocrLang} latex=${options.keepLatex})`
        : `OCR engine=${options.ocrEngine} lang=${options.ocrLang} latex=${options.keepLatex}`,
    );
    await this.progress(doc.id, (have.size / pageCount) * 100);

    for (let pass = 1; pass <= OCR_PASSES && todo.length; pass++) {
      if (pass > 1) {
        await this.log(
          doc.id,
          'extract',
          `retrying ${todo.length} page(s) that failed: ${todo.slice(0, 20).join(', ')}${todo.length > 20 ? '…' : ''}`,
        );
      }
      const failed: number[] = [];
      await this.extractor.ocr(
        file,
        doc.mimeType,
        { ...options, engine: options.ocrEngine, pages: todo },
        async (b) => {
          const range =
            b.pages.length > 1
              ? `${b.pages[0]}–${b.pages.at(-1)}`
              : String(b.pages[0]);
          if (b.ok) {
            for (const p of b.extracted) have.set(p.page, p);
            await this.savePages(partialKey, [...have.values()]);
          } else {
            // رصيد، مفتاح، صلاحيات: كل الدفعات الجاية رح تفشل بنفس السبب —
            // منوقف فوراً بدل ما نبعت الكتاب كله ونستنى
            if (isAccountError(b.error)) {
              throw new Error(
                `AI provider rejected the account: ${(b.error ?? '').slice(0, 300)}`,
              );
            }
            failed.push(...b.pages);
          }
          await this.progress(doc.id, (have.size / pageCount) * 100);
          await this.log(
            doc.id,
            'extract',
            b.ok
              ? `pages ${range} ok (${have.size}/${pageCount})`
              : `pages ${range} failed${pass < OCR_PASSES ? ', will retry' : ''}: ${(b.error ?? '').slice(0, 300)}`,
            b.ok ? 'info' : 'warn',
          );
          // Tesseract بيقول قديش هو واثق — صفحة ضعيفة (مسح سيئ، تشكيل كثيف،
          // معادلات) بتنسجّل حتى المشرف يعيدها بمحرك الذكاء الاصطناعي
          const weak = b.extracted.filter(
            (p) =>
              typeof p.confidence === 'number' &&
              p.confidence < LOCAL_OCR_LOW_CONFIDENCE,
          );
          if (weak.length) {
            await this.log(
              doc.id,
              'extract',
              `low OCR confidence on page(s) ${weak.map((p) => `${p.page} (${Math.round(p.confidence!)})`).join(', ')} — Tesseract also scores fully diacritized text (Quran, poetry) low even when it reads it well; check these pages, or use the AI engine for them`,
              'warn',
            );
          }
        },
      );
      todo = failed;
    }

    if (have.size === 0) {
      throw new Error(`OCR failed on all ${pageCount} pages`);
    }
    if (todo.length) {
      await this.log(
        doc.id,
        'extract',
        `OCR failed twice on ${todo.length} page(s): ${todo.slice(0, 20).join(', ')}${todo.length > 20 ? '…' : ''} — left out; use «إعادة التقطيع» later to fill them in`,
        'warn',
      );
    }
    const pages = [...have.values()];
    return pages.sort((a, b) => a.page - b.page);
  }

  /**
   * تضمين المقاطع على دفعات. دفعة فاشلة بتتعلّم FAILED وبنكمّل؛ إذا فشلت
   * كلها، المرحلة بتفشل (غالباً المفتاح أو النموذج).
   */
  private async embedBook(docId: string, opts: { all?: boolean } = {}) {
    const { doc } = await this.load(docId);
    const info = this.ai.embeddingInfo();
    if (!info.enabled) {
      throw new Error(
        'Embeddings are disabled: check EMBEDDING_PROVIDER and its API key',
      );
    }
    await this.enterStage(doc, 'EMBEDDING');

    const where: Prisma.KnowledgeChunkWhereInput = opts.all
      ? { documentId: docId }
      : { documentId: docId, embeddingStatus: { not: 'INDEXED' } };
    if (opts.all) {
      await this.prisma.knowledgeChunk.updateMany({
        where: { documentId: docId },
        data: { embeddingStatus: 'PENDING' },
      });
    }
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where,
      select: { id: true, section: true, text: true },
      orderBy: { ordinal: 'asc' },
    });
    await this.log(
      docId,
      'embed',
      `run ${info.provider}:${info.model} dims=${info.dimensions} batch=${EMBEDDING_BATCH_SIZE} · ${chunks.length} chunks`,
    );

    let ok = 0;
    let failed = 0;
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
      try {
        // مسار القسم مع النص بيحسّن الاسترجاع: السؤال عن «ثابت التأين» بيلاقي
        // مقاطع هالقسم حتى لو الكلمة مش بالنص نفسه
        const vectors = await this.ai.generateEmbeddings(
          batch.map((c) =>
            normalizeForSearch(c.section ? `${c.section}\n${c.text}` : c.text),
          ),
        );
        await this.prisma.$transaction(
          batch.map((c, j) =>
            this.prisma.knowledgeChunk.update({
              where: { id: c.id },
              data: {
                embedding: vectors[j],
                embeddingStatus: 'INDEXED',
                embeddingModel: info.model,
              },
            }),
          ),
        );
        ok += batch.length;
      } catch (err) {
        failed += batch.length;
        await this.prisma.knowledgeChunk.updateMany({
          where: { id: { in: batch.map((c) => c.id) } },
          data: { embeddingStatus: 'FAILED' },
        });
        await this.log(
          docId,
          'embed',
          `batch ${i / EMBEDDING_BATCH_SIZE + 1} failed: ${String(err).slice(0, 200)}`,
          'warn',
        );
      }
      await this.progress(docId, ((i + batch.length) / chunks.length) * 100);
    }

    if (chunks.length > 0 && ok === 0) {
      throw new Error(`Embedding failed for all ${failed} chunks`);
    }
    await this.log(
      docId,
      'embed',
      `ok ${ok} indexed${failed ? `, ${failed} failed` : ''}`,
    );
    await this.finish(doc, 'INDEXED');
  }

  /* ───────── الامتحانات ───────── */

  private async processExam(docId: string) {
    const { doc, options } = await this.load(docId);
    if (!doc.examFileId) throw new Error('Exam document has no exam file');

    await this.prisma.examFile.update({
      where: { id: doc.examFileId },
      data: { status: 'PROCESSING' },
    });

    // ── الاستخراج: النموذج بيقرا الورقة ويطلّع الأسئلة ──
    await this.enterStage(doc, 'EXTRACTING');
    const file = await this.storage.getFileBuffer(doc.s3Key);
    const pageCount = await this.extractor
      .pageCount(file, doc.mimeType)
      .catch(() => null);
    if (pageCount) {
      await this.prisma.knowledgeDocument.update({
        where: { id: docId },
        data: { pageCount },
      });
    }
    const units = await this.subjectUnits(doc.subjectId);
    await this.log(
      docId,
      'extract',
      `run model=parser lang=${options.ocrLang} latex=${options.keepLatex}`,
    );
    const extractOpts = {
      ocrLang: options.ocrLang,
      keepLatex: options.keepLatex,
      subjectName: doc.subject.name,
      units,
    };
    if ((pageCount ?? 1) > EXAM_BOOK_LIKE_PAGES) {
      await this.log(
        docId,
        'extract',
        `${pageCount} pages is long for an exam paper — if this is a textbook, delete it and upload it as a book`,
        'warn',
      );
    }
    const extracted = await this.extractExamQuestions(
      docId,
      file,
      doc.mimeType,
      pageCount ?? 1,
      extractOpts,
    );
    const avgConf = extracted.length
      ? extracted.reduce((s, q) => s + (q.confidence ?? 0), 0) /
        extracted.length
      : 0;
    await this.log(
      docId,
      'extract',
      `ok ${extracted.length} questions · avg confidence ${avgConf.toFixed(2)}`,
    );

    // ── التقطيع: سؤال لكل مقطع + فحص وتكرار ──
    await this.enterStage(doc, 'CHUNKING');
    const { kept, skipped } = await this.dedupe(
      doc.subjectId,
      doc.examFileId,
      extracted,
      options.dedupe,
    );
    if (skipped)
      await this.log(
        docId,
        'dedupe',
        `skipped ${skipped} question(s) already in the bank`,
      );

    const staged = kept.map((q) => {
      const flags = questionFlags(q, q.issues);
      return {
        q,
        flags,
        auto:
          options.autoApprove &&
          (q.confidence ?? 0) >= options.threshold &&
          !blocksAutoApprove(flags) &&
          DIFFICULTIES.has(q.suggestedDifficulty ?? '') &&
          BLOOMS.has(q.suggestedBloom ?? ''),
      };
    });

    const examFileId = doc.examFileId;
    await this.prisma.$transaction(async (tx) => {
      // إعادة المحاولة بتمسح المسودّات المعلّقة بس — المعتمدة والمرفوضة بتضل
      await tx.stagedQuestion.deleteMany({
        where: { examFileId, status: 'PENDING' },
      });
      if (staged.length) {
        await tx.stagedQuestion.createMany({
          data: staged.map(({ q, flags }, i) => ({
            examFileId,
            questionText: q.questionText,
            choices: q.choices,
            correctAnswer: q.correctAnswer ?? '',
            explanation: q.explanation ?? null,
            // النموذج أحياناً ما بيرجّع الرقم — ترتيب الاستخراج هو ترتيب الورقة
            number: Number.isInteger(q.number) ? q.number : i + 1,
            confidence:
              typeof q.confidence === 'number'
                ? Math.max(0, Math.min(1, q.confidence))
                : null,
            flags,
            suggestedDifficulty: DIFFICULTIES.has(q.suggestedDifficulty ?? '')
              ? (q.suggestedDifficulty as DifficultyLevel)
              : null,
            suggestedBloom: BLOOMS.has(q.suggestedBloom ?? '')
              ? (q.suggestedBloom as BloomTaxonomyLevel)
              : null,
            suggestedUnit: q.suggestedUnit?.trim() || null,
          })),
        });
      }
      await tx.knowledgeDocument.update({
        where: { id: docId },
        data: { questionCount: staged.length, chunkCount: staged.length },
      });
    });
    const flagged = staged.filter((s) => blocksAutoApprove(s.flags)).length;
    await this.log(
      docId,
      'chunk',
      `staged ${staged.length} questions (${flagged} need a reviewer's attention)`,
    );

    // ── التضمين: الأسئلة الواثقة بتنعتمد وبتدخل البنك ──
    await this.enterStage(doc, 'EMBEDDING');
    const autoCount = staged.filter((s) => s.auto).length;
    if (autoCount) {
      const approved = await this.autoApprove(doc, options);
      await this.log(
        docId,
        'approve',
        `auto-approved ${approved.length} question(s) with confidence ≥ ${options.threshold}`,
      );
      await this.embedBankQuestions(docId, approved, options.embedNow);
    } else {
      await this.log(
        docId,
        'approve',
        staged.length === 0
          ? 'nothing new to review'
          : options.autoApprove
            ? `no question reached confidence ${options.threshold} without blocking flags — all sent to review`
            : 'auto-approve off — all sent to review',
      );
    }
    await this.finish(doc, 'INDEXED');
  }

  /**
   * بيشيل الأسئلة المكررة: مقابل البنك (نفس المادة) ومقابل بعضها بنفس
   * الملف. بدون dedupe، بس التكرار داخل الملف نفسه بينشال — هاد غلط
   * استخراج (نفس السؤال مرتين)، مش قرار محتوى.
   */
  private async dedupe(
    subjectId: string,
    examFileId: string,
    questions: ExtractedQuestionWithMeta[],
    againstBank: boolean,
  ) {
    const index = new DuplicateIndex();
    if (againstBank) {
      const [bank, staged] = await Promise.all([
        this.prisma.examBankQuestion.findMany({
          where: { subjectId, deletedAt: null },
          select: { id: true, questionText: true, choices: true },
        }),
        // أسئلة معلّقة من ملفات تانية لنفس المادة (نفس الورقة انرفعت مرتين)
        this.prisma.stagedQuestion.findMany({
          where: {
            status: 'PENDING',
            examFileId: { not: examFileId },
            examFile: { subjectId },
          },
          select: { id: true, questionText: true, choices: true },
        }),
      ]);
      for (const q of [...bank, ...staged]) {
        index.add(q.id, {
          questionText: q.questionText,
          choices: q.choices as { label: string; text: string }[],
        });
      }
    }
    const kept: ExtractedQuestionWithMeta[] = [];
    let skipped = 0;
    const local = new DuplicateIndex();
    questions.forEach((q, i) => {
      if (!q?.questionText?.trim()) return;
      q.choices = Array.isArray(q.choices) ? q.choices : [];
      if (local.find(q) || (againstBank && index.find(q))) {
        skipped++;
        return;
      }
      local.add(String(i), q);
      kept.push(q);
    });
    return { kept, skipped };
  }

  private async autoApprove(doc: KnowledgeDocument, options: IngestionOptions) {
    const examFile = await this.prisma.examFile.findUniqueOrThrow({
      where: { id: doc.examFileId! },
    });
    const candidates = await this.prisma.stagedQuestion.findMany({
      where: {
        examFileId: examFile.id,
        status: 'PENDING',
        confidence: { gte: options.threshold },
        suggestedDifficulty: { not: null },
        suggestedBloom: { not: null },
      },
    });
    const eligible = candidates.filter((s) => !blocksAutoApprove(s.flags));
    const ids: string[] = [];
    for (const s of eligible) {
      const [, bank] = await this.prisma.$transaction([
        this.prisma.stagedQuestion.update({
          where: { id: s.id },
          data: {
            status: 'APPROVED',
            reviewedAt: new Date(),
            reviewedBy: null,
          },
        }),
        this.prisma.examBankQuestion.create({
          data: {
            questionText: s.questionText,
            choices: s.choices as Prisma.InputJsonValue,
            correctAnswer: s.correctAnswer,
            explanation: s.explanation,
            branchId: examFile.branchId,
            subjectId: examFile.subjectId,
            year: examFile.year,
            term: examFile.term,
            difficulty: s.suggestedDifficulty!,
            bloomTaxonomy: s.suggestedBloom!,
            topicId: s.suggestedUnit,
            sourceFileId: examFile.id,
          },
        }),
      ]);
      ids.push(bank.id);
    }
    return ids;
  }

  /** تضمين أسئلة البنك مباشرة (بدل طابور question-embedding) حتى المرحلة تعكس الحقيقة */
  private async embedBankQuestions(docId: string, ids: string[], now: boolean) {
    if (!ids.length) return;
    if (!now) {
      await this.log(
        docId,
        'embed',
        `skipped (embed immediately is off) — ${ids.length} bank question(s) left PENDING`,
      );
      return;
    }
    if (!this.ai.embeddingInfo().enabled) {
      await this.log(
        docId,
        'embed',
        'embeddings are disabled — approved questions stay PENDING',
        'warn',
      );
      return;
    }
    const rows = await this.prisma.examBankQuestion.findMany({
      where: { id: { in: ids } },
      select: { id: true, questionText: true, explanation: true },
    });
    let done = 0;
    for (let i = 0; i < rows.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = rows.slice(i, i + EMBEDDING_BATCH_SIZE);
      try {
        const vectors = await this.ai.generateEmbeddings(
          batch.map((q) =>
            [q.questionText, q.explanation].filter(Boolean).join('\n\n'),
          ),
        );
        await this.prisma.$transaction(
          batch.map((q, j) =>
            this.prisma.examBankQuestion.update({
              where: { id: q.id },
              data: { embedding: vectors[j], embeddingStatus: 'INDEXED' },
            }),
          ),
        );
        done += batch.length;
      } catch (err) {
        await this.prisma.examBankQuestion.updateMany({
          where: { id: { in: batch.map((q) => q.id) } },
          data: { embeddingStatus: 'FAILED' },
        });
        await this.log(
          docId,
          'embed',
          `batch failed: ${String(err).slice(0, 200)}`,
          'warn',
        );
      }
      await this.progress(docId, ((i + batch.length) / rows.length) * 100);
    }
    await this.log(
      docId,
      'embed',
      `ok ${done}/${rows.length} bank questions indexed`,
    );
  }

  /** «إعادة التضمين» لملف امتحان: الأسئلة المعتمدة منه بالبنك */
  private async reembedExam(docId: string) {
    const { doc } = await this.load(docId);
    await this.enterStage(doc, 'EMBEDDING');
    const rows = await this.prisma.examBankQuestion.findMany({
      where: { sourceFileId: doc.examFileId ?? '__none__', deletedAt: null },
      select: { id: true },
    });
    await this.embedBankQuestions(
      docId,
      rows.map((r) => r.id),
      true,
    );
    await this.finish(doc, 'INDEXED');
  }

  /**
   * استخراج الأسئلة على دفعات صفحات. ورقة امتحان بصفحتين بتروح بطلب واحد؛
   * أطول من هيك بتنقسم، حتى ما يعلق النموذج على ملف كامل (كتاب انرفع
   * بالغلط كامتحان كان ينتظر 120 ثانية ويسقط). سؤال بيمتد على حد دفعة
   * ممكن ينقرأ مرتين — فحص التكرار بعدها بيشيله.
   */
  private async extractExamQuestions(
    docId: string,
    file: Buffer,
    mimeType: string,
    pageCount: number,
    opts: ExtractionOptions,
  ): Promise<ExtractedQuestionWithMeta[]> {
    if (
      !this.extractor.isPdf(mimeType) ||
      pageCount <= this.ai.documentPagesPerRequest('exam')
    ) {
      return this.ai.extractQuestionsFromFile(file, mimeType, opts);
    }
    const out: ExtractedQuestionWithMeta[] = [];
    const failed: number[] = [];
    let done = 0;
    for await (const { pages, bytes, totalPages } of this.extractor.pdfBatches(
      file,
      this.ai.documentPagesPerRequest('exam'),
    )) {
      try {
        const qs = await this.ai.extractQuestionsFromFile(
          bytes,
          'application/pdf',
          opts,
        );
        out.push(...qs);
        await this.log(
          docId,
          'extract',
          `pages ${pages[0]}–${pages.at(-1)}: ${qs.length} questions`,
        );
      } catch (err) {
        failed.push(...pages);
        await this.log(
          docId,
          'extract',
          `pages ${pages[0]}–${pages.at(-1)} failed: ${String(err).slice(0, 160)}`,
          'warn',
        );
      }
      done += pages.length;
      await this.progress(docId, (done / totalPages) * 100);
    }
    if (failed.length === pageCount) {
      throw new Error(`Question extraction failed on all ${pageCount} pages`);
    }
    return out;
  }

  /** الوحدات المعروفة للمادة: من عناوين الكتاب ومن وسوم أسئلة البنك */
  /**
   * وحدات المادة: القائمة المنسّقة من «الفروع والمواد» إذا موجودة (مرتبة
   * ونظيفة)، وإلا المستنتجة من عناوين الكتاب ووسوم البنك.
   */
  async subjectUnits(subjectId: string): Promise<string[]> {
    const curated = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { units: true },
    });
    if (curated?.units.length) return curated.units;

    const [chunkUnits, bankUnits] = await Promise.all([
      this.prisma.knowledgeChunk.findMany({
        where: { subjectId, unit: { not: null } },
        distinct: ['unit'],
        select: { unit: true },
        orderBy: { unit: 'asc' },
      }),
      this.prisma.examBankQuestion.findMany({
        where: { subjectId, deletedAt: null, topicId: { not: null } },
        distinct: ['topicId'],
        select: { topicId: true },
      }),
    ]);
    return Array.from(
      new Set([
        ...chunkUnits.map((c) => c.unit!),
        ...bankUnits.map((b) => b.topicId!),
      ]),
    ).filter(Boolean);
  }
}
