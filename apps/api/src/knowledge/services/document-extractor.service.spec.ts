import { PDFDocument } from 'pdf-lib';
import {
  DocumentExtractorService,
  consecutiveBatches,
  repairVisualArabic,
} from './document-extractor.service';

describe('DocumentExtractorService', () => {
  const service = new DocumentExtractorService({} as never);

  async function pdfWith(pages: number) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
    return Buffer.from(await doc.save());
  }

  it('splits a PDF into small PDFs of consecutive pages', async () => {
    const out: { pages: number[]; count: number; total: number }[] = [];
    for await (const b of service.pdfBatches(await pdfWith(7), 3)) {
      out.push({
        pages: b.pages,
        count: (await PDFDocument.load(b.bytes)).getPageCount(),
        total: b.totalPages,
      });
    }
    expect(out).toEqual([
      { pages: [1, 2, 3], count: 3, total: 7 },
      { pages: [4, 5, 6], count: 3, total: 7 },
      { pages: [7], count: 1, total: 7 },
    ]);
  });

  it('batches only the requested pages and never joins non-consecutive ones', () => {
    expect(consecutiveBatches([9, 1, 2, 5, 6, 7, 8], 3)).toEqual([
      [1, 2],
      [5, 6, 7],
      [8, 9],
    ]);
  });

  it('reverses visual-order Arabic lines and leaves logical text alone', () => {
    // "سلام سلام" مخزّنة بأشكال العرض وبالترتيب المعكوس
    const visual = '\uFEE1\uFEFC\uFEB3 \uFEE1\uFEFC\uFEB3';
    expect(repairVisualArabic(visual).text).toBe('سلام سلام');
    // أقل من ٤ حروف عربية: ما في دليل كافي إنه مقلوب
    expect(repairVisualArabic('\uFEE1\uFEFC\uFEB3').repaired).toBe(false);
    expect(repairVisualArabic('نص عربي عادي').repaired).toBe(false);
  });

  it('treats an empty model reply as a failed batch so it gets retried', async () => {
    const ai = {
      transcribePages: jest.fn().mockResolvedValue([{ page: 1, text: '  ' }]),
      documentPagesPerRequest: () => 4,
    };
    const svc = new DocumentExtractorService(ai as never);
    const results: { ok: boolean; error?: string }[] = [];
    await svc.ocr(
      await pdfWith(1),
      'application/pdf',
      { engine: 'ai', ocrLang: 'ara', keepLatex: true },
      async (r) => {
        results.push({ ok: r.ok, error: r.error });
      },
    );
    expect(results).toEqual([
      { ok: false, error: expect.stringContaining('empty transcription') },
    ]);
  });
});
