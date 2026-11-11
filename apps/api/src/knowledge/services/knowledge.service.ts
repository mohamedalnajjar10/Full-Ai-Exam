import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { IngestionStage, KnowledgeSourceKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { GeminiService } from '../../gemini/gemini.service';
import {
  QUEUES_DISABLED_MESSAGE,
  decodeUploadName,
  resolveExamMimeType,
} from '../../common';
import {
  INGESTION_QUEUE,
  IngestionJobName,
  IngestionOptions,
  normalizeOptions,
} from '../knowledge.types';
import { IngestionSettingsService } from './ingestion-settings.service';
import {
  pagesKey,
  partialPagesKey,
  RUNNING_STAGES as RUNNING,
} from './ingestion-pipeline.service';

export const MAX_EXAM_BYTES = 20 * 1024 * 1024;
export const MAX_BOOK_BYTES = 200 * 1024 * 1024;

export interface UploadMeta {
  kind: KnowledgeSourceKind;
  subjectId: string;
  year?: number;
  term?: string;
  bookPart?: string;
  bookEdition?: number;
  options?: Partial<IngestionOptions>;
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly ai: GeminiService,
    private readonly settings: IngestionSettingsService,
    @Optional() @InjectQueue(INGESTION_QUEUE) private readonly queue?: Queue,
    @Optional()
    @InjectQueue('question-embedding')
    private readonly bankEmbeddingQueue?: Queue,
  ) {}

  private requireQueue(): Queue {
    if (!this.queue)
      throw new ServiceUnavailableException(QUEUES_DISABLED_MESSAGE);
    return this.queue;
  }

  private async enqueue(name: IngestionJobName, documentId: string) {
    await this.requireQueue().add(
      name,
      { documentId },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 200,
        removeOnFail: 500,
      },
    );
  }

  /* ───────── الرفع ───────── */

  async upload(file: Express.Multer.File, meta: UploadMeta, userId: string) {
    this.requireQueue();
    const originalName = decodeUploadName(file.originalname);

    const mime = resolveExamMimeType(file);
    if (!mime || !/^(application\/pdf|image\/(png|jpeg))$/.test(mime)) {
      throw new BadRequestException('الصيغ المدعومة: PDF أو صور (PNG, JPG).');
    }
    const max = meta.kind === 'EXAM' ? MAX_EXAM_BYTES : MAX_BOOK_BYTES;
    if (file.size > max) {
      throw new BadRequestException(
        `حجم الملف يتجاوز ${max / 1048576} ميجابايت.`,
      );
    }
    if (meta.kind === 'EXAM' && (!meta.year || !meta.term)) {
      throw new BadRequestException(
        'السنة والدورة مطلوبتان لملفات الامتحانات.',
      );
    }

    const subject = await this.prisma.subject.findUnique({
      where: { id: meta.subjectId },
    });
    if (!subject) throw new NotFoundException('المادة غير موجودة.');

    // خيارات الدفعة = الافتراضية المحفوظة + يلي أرسلها المشرف؛ ومنحفظها
    // كافتراضية للجاية
    const options = normalizeOptions(meta.options, await this.settings.get());
    await this.settings.save(options, userId);

    const safeName = originalName.replace(/[^\p{L}\p{N}._-]/gu, '_');
    const prefix = meta.kind === 'EXAM' ? 'exam-files' : 'knowledge/books';
    const s3Key = `${prefix}/${Date.now()}-${safeName}`;
    await this.storage.uploadFile(s3Key, file.buffer, mime);

    const doc = await this.prisma.$transaction(async (tx) => {
      const examFile =
        meta.kind === 'EXAM'
          ? await tx.examFile.create({
              data: {
                originalName,
                s3Key,
                mimeType: mime,
                fileSize: file.size,
                branchId: subject.branchId,
                subjectId: subject.id,
                year: meta.year!,
                term: meta.term!,
                uploadedBy: userId,
              },
            })
          : null;
      if (meta.kind === 'BOOK' && tx.subject) {
        await tx.subject.update({
          where: { id: subject.id },
          data: {
            bookPdfKey: s3Key,
            bookPdfOriginalName: originalName,
            bookPdfSize: file.size,
          },
        });
      }

      return tx.knowledgeDocument.create({
        data: {
          kind: meta.kind,
          originalName,
          s3Key,
          mimeType: mime,
          fileSize: file.size,
          subjectId: subject.id,
          branchId: subject.branchId,
          examFileId: examFile?.id,
          bookPart: meta.kind === 'BOOK' ? (meta.bookPart ?? 'all') : null,
          bookEdition: meta.kind === 'BOOK' ? (meta.bookEdition ?? null) : null,
          options: options as unknown as Prisma.InputJsonValue,
          uploadedBy: userId,
          log: [
            {
              at: new Date().toISOString(),
              level: 'info',
              step: 'upload',
              message: `ok ${originalName} (${(file.size / 1048576).toFixed(1)} MB) → ${s3Key}`,
            },
          ],
        },
      });
    });

    await this.enqueue('process', doc.id);
    return this.getJob(doc.id);
  }

  /* ───────── المهام ───────── */

  async listJobs(params: {
    status?: string;
    kind?: KnowledgeSourceKind;
    limit?: number;
  }) {
    const where: Prisma.KnowledgeDocumentWhereInput = {};
    if (params.kind) where.kind = params.kind;
    if (params.status === 'running')
      where.stage = { in: [...RUNNING, 'CHUNKED'] };
    else if (params.status === 'done') where.stage = 'INDEXED';
    else if (params.status === 'failed') where.stage = 'FAILED';

    const [rows, counts] = await Promise.all([
      this.prisma.knowledgeDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(params.limit ?? 50, 200),
        select: JOB_SELECT,
      }),
      this.prisma.knowledgeDocument.groupBy({
        by: ['stage'],
        _count: true,
        ...(params.kind ? { where: { kind: params.kind } } : {}),
      }),
    ]);
    const c = Object.fromEntries(
      counts.map((x) => [x.stage, x._count]),
    ) as Record<string, number>;
    const sum = (stages: string[]) =>
      stages.reduce((s, k) => s + (c[k] ?? 0), 0);
    return {
      data: rows.map(toJob),
      counts: {
        all: sum(Object.keys(c)),
        running: sum([...RUNNING, 'CHUNKED']),
        done: c.INDEXED ?? 0,
        failed: c.FAILED ?? 0,
      },
      paused: await this.isPaused(),
    };
  }

  async getJob(id: string) {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
      select: { ...JOB_SELECT, log: true, stageTimings: true, options: true },
    });
    if (!doc) throw new NotFoundException('المهمة غير موجودة.');
    return {
      ...toJob(doc),
      log: doc.log,
      stageTimings: doc.stageTimings,
      options: normalizeOptions(doc.options as Partial<IngestionOptions>),
    };
  }

  /** عيّنة من مقاطع الملف (أو أسئلته المستخرجة للامتحانات) لدرج التفاصيل */
  async jobChunks(id: string, limit = 20) {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('المهمة غير موجودة.');
    if (doc.kind === 'EXAM') {
      const qs = await this.prisma.stagedQuestion.findMany({
        where: { examFileId: doc.examFileId ?? '' },
        orderBy: [{ number: 'asc' }, { createdAt: 'asc' }],
        take: limit,
      });
      return qs.map((q) => ({
        id: q.id,
        page: null,
        tokens: null,
        section: q.number ? `السؤال ${q.number}` : 'سؤال',
        text: q.questionText,
        status:
          q.status === 'APPROVED'
            ? 'INDEXED'
            : q.status === 'REJECTED'
              ? 'FAILED'
              : 'PENDING',
        confidence: q.confidence,
      }));
    }
    const chunks = await this.prisma.knowledgeChunk.findMany({
      where: { documentId: id },
      orderBy: { ordinal: 'asc' },
      take: limit,
      select: {
        id: true,
        pageStart: true,
        tokens: true,
        section: true,
        text: true,
        embeddingStatus: true,
      },
    });
    return chunks.map((c) => ({
      id: c.id,
      page: c.pageStart,
      tokens: c.tokens,
      section: c.section,
      text: c.text,
      status: c.embeddingStatus,
    }));
  }

  private async assertIdle(id: string) {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('المهمة غير موجودة.');
    // UPLOADED = بالطابور ولسا ما بدأ — كمان مشغول، وإلا ضغطتين بيعملوا مهمتين
    if (RUNNING.includes(doc.stage)) {
      throw new ConflictException('المهمة قيد التنفيذ حالياً.');
    }
    return doc;
  }

  async retry(id: string) {
    const doc = await this.assertIdle(id);
    if (doc.stage !== 'FAILED')
      throw new ConflictException('لا يمكن إعادة المحاولة إلا لمهمة فاشلة.');
    await this.enqueue('process', id);
    return this.getJob(id);
  }

  /**
   * إعادة التقطيع بخيارات جديدة (حجم المقطع، التداخل، الطريقة...) من
   * الصفحات المحفوظة — بدون استخراج جديد إلا إذا الصفحات مش موجودة.
   */
  async rechunk(
    id: string,
    options: Partial<IngestionOptions> | undefined,
    userId: string,
  ) {
    const doc = await this.assertIdle(id);
    if (doc.kind !== 'BOOK')
      throw new BadRequestException('إعادة التقطيع للكتب فقط.');
    const merged = normalizeOptions(
      options,
      normalizeOptions(doc.options as Partial<IngestionOptions>),
    );
    await this.prisma.knowledgeDocument.update({
      where: { id },
      data: {
        options: merged as unknown as Prisma.InputJsonValue,
        stage: 'UPLOADED',
        progress: 0,
        error: null,
      },
    });
    this.logger.log(`Rechunk ${id} by ${userId}: ${JSON.stringify(merged)}`);
    await this.enqueue('rechunk', id);
    return this.getJob(id);
  }

  async reembed(id: string) {
    await this.assertIdle(id);
    if (!this.ai.embeddingInfo().enabled) {
      throw new ServiceUnavailableException(
        'التضمين غير مفعّل: تحقق من EMBEDDING_PROVIDER ومفتاحه.',
      );
    }
    await this.prisma.knowledgeDocument.update({
      where: { id },
      data: { stage: 'UPLOADED', progress: 0 },
    });
    await this.enqueue('embed', id);
    return this.getJob(id);
  }

  /** إعادة تضمين كل كتب مادة (زر «إعادة التضمين» ببطاقة المكتبة) */
  async reembedSubject(subjectId: string) {
    const docs = await this.prisma.knowledgeDocument.findMany({
      where: {
        subjectId,
        kind: 'BOOK',
        stage: { in: ['INDEXED', 'CHUNKED', 'FAILED'] },
      },
      select: { id: true },
    });
    for (const d of docs) await this.reembed(d.id);
    return { queued: docs.length };
  }

  /**
   * حذف الملف مع مقاطعه ومتجهاته. للامتحانات: الأسئلة المعتمدة بالبنك
   * بتضل، بس بتفقد رابطها بالمصدر؛ والمسودّات المعلّقة بتنحذف.
   */
  async remove(id: string) {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('الملف غير موجود.');
    await this.prisma.$transaction(async (tx) => {
      if (doc.examFileId) {
        await tx.examBankQuestion.updateMany({
          where: { sourceFileId: doc.examFileId },
          data: { sourceFileId: null },
        });
      }

      if (tx.subject) {
        const subject = await tx.subject.findUnique({
          where: { id: doc.subjectId },
          select: { bookPdfKey: true },
        });
        if (subject?.bookPdfKey === doc.s3Key) {
          const nextBook = await tx.knowledgeDocument.findFirst({
            where: {
              subjectId: doc.subjectId,
              kind: 'BOOK',
              id: { not: id },
            },
            orderBy: { createdAt: 'desc' },
          });

          await tx.subject.update({
            where: { id: doc.subjectId },
            data: {
              bookPdfKey: nextBook ? nextBook.s3Key : null,
              bookPdfOriginalName: nextBook ? nextBook.originalName : null,
              bookPdfSize: nextBook ? nextBook.fileSize : null,
            },
          });
        }
      }

      await tx.knowledgeDocument.delete({ where: { id } });
      if (doc.examFileId)
        await tx.examFile.delete({ where: { id: doc.examFileId } });
    });
    await Promise.all([
      this.storage.deleteFile(doc.s3Key).catch(() => undefined),
      this.storage.deleteFile(pagesKey(id)).catch(() => undefined),
      this.storage.deleteFile(partialPagesKey(id)).catch(() => undefined),
    ]);
    return { deleted: true };
  }

  async removeSubjectBooks(subjectId: string) {
    const docs = await this.prisma.knowledgeDocument.findMany({
      where: { subjectId, kind: 'BOOK' },
      select: { id: true },
    });
    for (const d of docs) await this.remove(d.id);

    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { bookPdfKey: true },
    });
    if (subject?.bookPdfKey) {
      try {
        await this.storage.deleteFile(subject.bookPdfKey);
      } catch (err) {
        this.logger.warn(
          `Failed to delete book PDF from storage for subject ${subjectId}: ${subject.bookPdfKey}`,
          err,
        );
      }
      await this.prisma.subject.update({
        where: { id: subjectId },
        data: {
          bookPdfKey: null,
          bookPdfOriginalName: null,
          bookPdfSize: null,
        },
      });
    }

    return { deleted: docs.length + (subject?.bookPdfKey ? 1 : 0) };
  }

  async downloadUrl(id: string) {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('الملف غير موجود.');
    return {
      url: await this.storage.getPresignedUrl(doc.s3Key, doc.originalName, 600),
    };
  }

  async fileBuffer(id: string) {
    const doc = await this.prisma.knowledgeDocument.findUnique({
      where: { id },
    });
    if (!doc) throw new NotFoundException('الملف غير موجود.');
    return { doc, buffer: await this.storage.getFileBuffer(doc.s3Key) };
  }

  /* ───────── إيقاف القوائم ───────── */

  async isPaused(): Promise<boolean> {
    return this.queue ? this.queue.isPaused() : false;
  }

  async setPaused(paused: boolean) {
    const queues = [this.requireQueue(), this.bankEmbeddingQueue].filter(
      Boolean,
    ) as Queue[];
    await Promise.all(queues.map((q) => (paused ? q.pause() : q.resume())));
    return { paused };
  }

  /* ───────── المكتبة ───────── */

  /** بطاقات المواد: الكتب ومقاطعها وحالة الفهرسة وأسئلة البنك */
  async librarySubjects() {
    const [subjects, docs, chunkStats, units, bank] = await Promise.all([
      this.prisma.subject.findMany({
        include: { branch: { select: { name: true } } },
        orderBy: [{ branch: { name: 'asc' } }, { name: 'asc' }],
      }),
      this.prisma.knowledgeDocument.findMany({
        where: { kind: 'BOOK' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          subjectId: true,
          originalName: true,
          pageCount: true,
          fileSize: true,
          stage: true,
          progress: true,
          bookPart: true,
          bookEdition: true,
          options: true,
          chunkCount: true,
        },
      }),
      this.prisma.knowledgeChunk.groupBy({
        by: ['subjectId', 'embeddingStatus'],
        _count: true,
        _avg: { tokens: true },
      }),
      this.prisma.knowledgeChunk.findMany({
        distinct: ['subjectId', 'unit'],
        where: { unit: { not: null } },
        select: { subjectId: true, unit: true },
      }),
      this.prisma.examBankQuestion.groupBy({
        by: ['subjectId'],
        where: { deletedAt: null },
        _count: true,
      }),
    ]);

    return subjects.map((s) => {
      const stats = chunkStats.filter((c) => c.subjectId === s.id);
      const total = stats.reduce((n, c) => n + c._count, 0);
      const indexed =
        stats.find((c) => c.embeddingStatus === 'INDEXED')?._count ?? 0;
      const failed =
        stats.find((c) => c.embeddingStatus === 'FAILED')?._count ?? 0;
      const avgTokens = total
        ? Math.round(
            stats.reduce((n, c) => n + (c._avg.tokens ?? 0) * c._count, 0) /
              total,
          )
        : 0;
      const books = docs.filter((d) => d.subjectId === s.id);
      const mappedBooks =
        books.length > 0
          ? books.map((b) => ({
              id: b.id,
              name: decodeUploadName(b.originalName),
              pages: b.pageCount,
              sizeMb: +(b.fileSize / 1048576).toFixed(1),
              stage: b.stage,
              progress: b.progress,
              part: b.bookPart,
              edition: b.bookEdition,
              chunks: b.chunkCount,
              options: normalizeOptions(b.options as Partial<IngestionOptions>),
            }))
          : s.bookPdfKey
            ? [
                {
                  id: `subject-book-${s.id}`,
                  name: decodeUploadName(s.bookPdfOriginalName ?? 'book.pdf'),
                  pages: null,
                  sizeMb: s.bookPdfSize
                    ? +(s.bookPdfSize / 1048576).toFixed(1)
                    : 0,
                  stage: IngestionStage.INDEXED,
                  progress: 100,
                  part: 'all',
                  edition: null,
                  chunks: total,
                  options: normalizeOptions({}),
                },
              ]
            : [];

      return {
        id: s.id,
        name: s.name,
        branch: s.branch.name,
        branchId: s.branchId,
        units: units.filter((u) => u.subjectId === s.id).map((u) => u.unit!),
        bankQuestions: bank.find((b) => b.subjectId === s.id)?._count ?? 0,
        hasBook: Boolean(s.bookPdfKey || books.length > 0),
        bookPdfOriginalName: s.bookPdfOriginalName
          ? decodeUploadName(s.bookPdfOriginalName)
          : null,
        bookPdfSize: s.bookPdfSize,
        books: mappedBooks,
        chunks: { total, indexed, failed, avgTokens },
      };
    });
  }

  async subjectChunks(
    subjectId: string,
    params: { q?: string; unit?: string; page?: number; limit?: number },
  ) {
    const limit = Math.min(params.limit ?? 30, 100);
    const page = Math.max(1, params.page ?? 1);
    const where: Prisma.KnowledgeChunkWhereInput = { subjectId };
    if (params.unit) where.unit = params.unit;
    if (params.q?.trim()) {
      where.OR = [
        { text: { contains: params.q.trim(), mode: 'insensitive' } },
        { section: { contains: params.q.trim(), mode: 'insensitive' } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.knowledgeChunk.findMany({
        where,
        orderBy: [{ documentId: 'asc' }, { ordinal: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          documentId: true,
          ordinal: true,
          pageStart: true,
          pageEnd: true,
          section: true,
          unit: true,
          text: true,
          tokens: true,
          embeddingStatus: true,
        },
      }),
      this.prisma.knowledgeChunk.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  /** ملفات الامتحانات مع عدد المستخرج والمعتمد */
  async examFiles(params: { branch?: string; q?: string }) {
    const files = await this.prisma.examFile.findMany({
      where: {
        ...(params.branch ? { branch: { name: params.branch } } : {}),
        ...(params.q?.trim()
          ? {
              OR: [
                {
                  originalName: {
                    contains: params.q.trim(),
                    mode: 'insensitive',
                  },
                },
                {
                  subject: {
                    name: { contains: params.q.trim(), mode: 'insensitive' },
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        subject: { select: { name: true } },
        branch: { select: { name: true } },
        document: { select: { id: true, stage: true } },
      },
    });
    const counts = await this.prisma.stagedQuestion.groupBy({
      by: ['examFileId', 'status'],
      where: { examFileId: { in: files.map((f) => f.id) } },
      _count: true,
    });
    return files.map((f) => {
      const c = counts.filter((x) => x.examFileId === f.id);
      return {
        id: f.id,
        documentId: f.document?.id ?? null,
        name: decodeUploadName(f.originalName),
        subject: f.subject.name,
        branch: f.branch.name,
        year: f.year,
        term: f.term,
        status: f.status,
        sizeMb: +(f.fileSize / 1048576).toFixed(1),
        extracted: c.reduce((n, x) => n + x._count, 0),
        approved: c.find((x) => x.status === 'APPROVED')?._count ?? 0,
        pending: c.find((x) => x.status === 'PENDING')?._count ?? 0,
      };
    });
  }

  /**
   * في عملية worker متصلة بطابور المعالجة؟ BullMQ بيعدّ العمّال المتصلين
   * بـ Redis — بيشمل الـ API نفسه لو INGESTION_WORKER=inline.
   */
  private async workerOnline(): Promise<boolean> {
    if (!this.queue) return false;
    try {
      return (await this.queue.getWorkersCount()) > 0;
    } catch {
      return false;
    }
  }

  /** عدّادات القائمة الجانبية ولوحة المعالجة */
  async summary() {
    const [running, pendingReview] = await Promise.all([
      this.prisma.knowledgeDocument.count({
        where: { stage: { in: RUNNING } },
      }),
      this.prisma.stagedQuestion.count({ where: { status: 'PENDING' } }),
    ]);
    return {
      runningJobs: running,
      pendingReview,
      embedding: this.ai.embeddingInfo(),
      queuesEnabled: Boolean(this.queue),
      paused: await this.isPaused(),
      // عملية بتعالج الملفات شغّالة؟ (نبضها بيتجدد كل ~7 ث)
      workerOnline: await this.workerOnline(),
    };
  }
}

const JOB_SELECT = {
  id: true,
  kind: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  pageCount: true,
  stage: true,
  progress: true,
  failedStage: true,
  error: true,
  chunkCount: true,
  questionCount: true,
  examFileId: true,
  bookPart: true,
  bookEdition: true,
  createdAt: true,
  finishedAt: true,
  subject: { select: { id: true, name: true } },
  branch: { select: { name: true } },
  uploader: { select: { name: true, email: true } },
  examFile: { select: { year: true, term: true } },
} satisfies Prisma.KnowledgeDocumentSelect;

type JobRow = Prisma.KnowledgeDocumentGetPayload<{ select: typeof JOB_SELECT }>;

function toJob(d: JobRow) {
  return {
    id: d.id,
    name: decodeUploadName(d.originalName),
    kind: d.kind,
    subjectId: d.subject.id,
    subject: d.subject.name,
    branch: d.branch.name,
    year: d.examFile?.year ?? null,
    term: d.examFile?.term ?? null,
    bookPart: d.bookPart,
    bookEdition: d.bookEdition,
    sizeMb: +(d.fileSize / 1048576).toFixed(1),
    pages: d.pageCount,
    stage: d.stage,
    failedStage: d.failedStage,
    progress: d.progress,
    chunks: d.chunkCount,
    questions: d.questionCount,
    error: d.error,
    startedAt: d.createdAt,
    finishedAt: d.finishedAt,
    by: d.uploader.name ?? d.uploader.email,
  };
}
