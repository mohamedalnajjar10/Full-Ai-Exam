import {
  IngestionPipelineService,
  isAccountError,
  partialPagesKey,
} from './ingestion-pipeline.service';
import type { OcrBatchResult } from './document-extractor.service';
import {
  DEFAULT_INGESTION_OPTIONS,
  type ExtractedPage,
} from '../knowledge.types';

const page = (n: number): ExtractedPage => ({
  page: n,
  text: `نص الصفحة ${n}`,
  source: 'ocr',
});

describe('IngestionPipelineService — OCR of a book', () => {
  let prisma: any;
  let storage: any;
  let extractor: any;
  let logs: string[];
  let service: IngestionPipelineService;
  const doc = { id: 'doc-1', mimeType: 'application/pdf' } as any;

  beforeEach(() => {
    logs = [];
    prisma = {
      knowledgeDocument: { update: jest.fn() },
      // log() بيكتب بـ $executeRaw — منلتقط الرسالة من البارامترات
      $executeRaw: jest.fn(
        (_strings: TemplateStringsArray, ...values: unknown[]) => {
          const line = values.find(
            (v) => typeof v === 'string' && v.startsWith('[{'),
          );
          if (line) logs.push(JSON.parse(line as string)[0].message);
        },
      ),
    };
    storage = { getFileBuffer: jest.fn(), uploadFile: jest.fn() };
    extractor = { ocr: jest.fn() };
    service = new IngestionPipelineService(
      prisma,
      storage,
      {} as any,
      extractor,
      {} as any,
    );
  });

  const ocrBook = (seed?: ExtractedPage[]) =>
    (service as any).ocrBook(
      doc,
      DEFAULT_INGESTION_OPTIONS,
      Buffer.from(''),
      8,
      seed,
    ) as Promise<ExtractedPage[]>;

  it('resumes from the checkpoint, retries a failed batch once, and saves after every success', async () => {
    // السيرفر رجع قام بعد ما خلصت الصفحات ١–٤
    storage.getFileBuffer.mockResolvedValue(
      Buffer.from(JSON.stringify([1, 2, 3, 4].map(page))),
    );
    let calls = 0;
    extractor.ocr.mockImplementation(
      async (
        _b: Buffer,
        _m: string,
        opts: { pages: number[] },
        onBatch: (r: OcrBatchResult) => Promise<void>,
      ) => {
        calls++;
        // أول دورة: النموذج علّق؛ التانية: نجح
        await onBatch(
          calls === 1
            ? {
                pages: opts.pages,
                ok: false,
                extracted: [],
                error: 'AiTimeoutError',
              }
            : { pages: opts.pages, ok: true, extracted: opts.pages.map(page) },
        );
      },
    );

    const pages = await ocrBook();

    expect(extractor.ocr.mock.calls.map((c: any[]) => c[2].pages)).toEqual([
      [5, 6, 7, 8],
      [5, 6, 7, 8],
    ]);
    expect(pages.map((p) => p.page)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(storage.uploadFile).toHaveBeenCalledWith(
      partialPagesKey('doc-1'),
      expect.any(Buffer),
      'application/json',
    );
    expect(logs).toEqual([
      expect.stringContaining('OCR resume: 4/8 pages already done, 4 left'),
      expect.stringMatching(/^pages 5–8 failed, will retry/),
      'retrying 4 page(s) that failed: 5, 6, 7, 8',
      'pages 5–8 ok (8/8)',
    ]);
  });

  it('never reports a failed batch as ok, and leaves out pages that fail twice', async () => {
    storage.getFileBuffer.mockRejectedValue(new Error('no checkpoint'));
    extractor.ocr.mockImplementation(
      async (
        _b: Buffer,
        _m: string,
        opts: { pages: number[] },
        onBatch: (r: OcrBatchResult) => Promise<void>,
      ) => {
        const good = opts.pages.filter((p) => p <= 4);
        const bad = opts.pages.filter((p) => p > 4);
        if (good.length)
          await onBatch({ pages: good, ok: true, extracted: good.map(page) });
        if (bad.length)
          await onBatch({
            pages: bad,
            ok: false,
            extracted: [],
            error: 'timeout',
          });
      },
    );

    const pages = await ocrBook();

    expect(pages.map((p) => p.page)).toEqual([1, 2, 3, 4]);
    expect(logs.filter((l) => l.startsWith('pages 5–8'))).toEqual([
      expect.stringMatching(/failed, will retry/),
      expect.stringMatching(/^pages 5–8 failed: /),
    ]);
    expect(logs.at(-1)).toMatch(
      /OCR failed twice on 4 page\(s\): 5, 6, 7, 8 — left out/,
    );
  });

  it('fills only the gaps when given the pages from an earlier run', async () => {
    extractor.ocr.mockImplementation(
      async (
        _b: Buffer,
        _m: string,
        opts: { pages: number[] },
        onBatch: (r: OcrBatchResult) => Promise<void>,
      ) => {
        await onBatch({
          pages: opts.pages,
          ok: true,
          extracted: opts.pages.map(page),
        });
      },
    );

    const pages = await ocrBook([1, 2, 3, 4, 6, 7, 8].map(page));

    expect(extractor.ocr.mock.calls[0][2].pages).toEqual([5]);
    expect(pages).toHaveLength(8);
    // البذرة جاية من pages.json — ما منقرأ نقطة الحفظ
    expect(storage.getFileBuffer).not.toHaveBeenCalled();
  });

  it('fails the stage when no page could be read at all', async () => {
    storage.getFileBuffer.mockRejectedValue(new Error('no checkpoint'));
    extractor.ocr.mockImplementation(
      async (
        _b: Buffer,
        _m: string,
        opts: { pages: number[] },
        onBatch: (r: OcrBatchResult) => Promise<void>,
      ) => {
        await onBatch({
          pages: opts.pages,
          ok: false,
          extracted: [],
          error: 'down',
        });
      },
    );
    await expect(ocrBook()).rejects.toThrow('OCR failed on all 8 pages');
  });

  it('redoes pages that an earlier run saved with empty text', async () => {
    const saved = [1, 2, 3, 4, 5, 6, 7, 8].map((n) =>
      n >= 5 ? { ...page(n), text: '' } : page(n),
    );
    storage.getFileBuffer.mockResolvedValue(Buffer.from(JSON.stringify(saved)));
    extractor.ocr.mockImplementation(
      async (
        _b: Buffer,
        _m: string,
        opts: { pages: number[] },
        onBatch: (r: OcrBatchResult) => Promise<void>,
      ) => {
        await onBatch({
          pages: opts.pages,
          ok: true,
          extracted: opts.pages.map(page),
        });
      },
    );

    const pages = await ocrBook();

    expect(extractor.ocr.mock.calls[0][2].pages).toEqual([5, 6, 7, 8]);
    expect(pages.every((p) => p.text)).toBe(true);
  });

  it('stops at the first account error instead of sending the whole book', async () => {
    storage.getFileBuffer.mockRejectedValue(new Error('no checkpoint'));
    const billing =
      'Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';
    extractor.ocr.mockImplementation(
      async (
        _b: Buffer,
        _m: string,
        opts: { pages: number[] },
        onBatch: (r: OcrBatchResult) => Promise<void>,
      ) => {
        for (let i = 0; i < opts.pages.length; i += 4) {
          await onBatch({
            pages: opts.pages.slice(i, i + 4),
            ok: false,
            extracted: [],
            error: billing,
          });
        }
      },
    );

    await expect(ocrBook()).rejects.toThrow(
      /rejected the account: .*credit balance/,
    );
    expect(extractor.ocr).toHaveBeenCalledTimes(1);
    // توقّف عند أول دفعة: ولا دفعة تانية انبعتت، وما في دورة إعادة
    expect(logs.some((l) => l.startsWith('retrying'))).toBe(false);
    expect(storage.uploadFile).not.toHaveBeenCalled();
  });

  it('keeps retrying ordinary overload errors', () => {
    expect(isAccountError('OpenRouter 429: Rate limit exceeded')).toBe(false);
    expect(isAccountError('Model timed out after 150000ms')).toBe(false);
    expect(isAccountError('401 {"type":"authentication_error"}')).toBe(true);
  });
});
