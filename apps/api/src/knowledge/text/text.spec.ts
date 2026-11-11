import {
  cleanPages,
  latexToPlain,
  normalizeText,
  stripHeadersAndFooters,
  normalizeForSearch,
} from './cleanup';
import {
  chunkPages,
  detectHeading,
  estimateTokens,
  splitSentences,
} from './chunker';
import { DuplicateIndex, blocksAutoApprove, questionFlags } from './questions';
import { normalizeOptions } from '../knowledge.types';
import type { ExtractedPage } from '../knowledge.types';

const page = (n: number, text: string): ExtractedPage => ({
  page: n,
  text,
  source: 'text',
});

describe('cleanup', () => {
  it('maps Arabic presentation forms back to base letters', () => {
    // "سلام" بأشكال العرض
    expect(normalizeText('ﺳﻼﻡ')).toBe('سلام');
  });

  it('strips repeated headers and page numbers but keeps body lines', () => {
    const bodies = [
      'تعريف الحمض',
      'خصائص القاعدة',
      'مثال محلول',
      'أسئلة الفصل',
      'تجربة',
      'ملخص',
    ];
    const pages = bodies.map((b, i) =>
      page(
        i + 1,
        `كتاب الكيمياء - الصف الثاني عشر\n${b} الأول\n12\n${b} الثاني\n${b} الثالث\n- ${i + 10} -`,
      ),
    );
    const out = stripHeadersAndFooters(pages);
    // سطر "12" بنص الصفحة (مش بالطرف) بيضل — ممكن يكون خلية جدول أو جواب
    expect(out[0].text).toBe(
      'تعريف الحمض الأول\n12\nتعريف الحمض الثاني\nتعريف الحمض الثالث',
    );
  });

  it('does not treat a heading repeated on two pages as a header', () => {
    const pages = [
      page(1, 'الوحدة الأولى\nنص أ'),
      page(2, 'الوحدة الأولى\nنص ب'),
      page(3, 'الوحدة الثانية\nنص ج'),
      page(4, 'الوحدة الثانية\nنص د'),
      page(5, 'الوحدة الثالثة\nنص هـ'),
      page(6, 'الوحدة الثالثة\nنص و'),
      page(7, 'الوحدة الرابعة\nنص ز'),
    ];
    expect(stripHeadersAndFooters(pages)[0].text).toContain('الوحدة الأولى');
  });

  it('turns LaTeX into readable text when keepLatex is off', () => {
    expect(latexToPlain('ثابت $K_a = \\frac{[H_3O^+][A^-]}{[HA]}$ للحمض')).toBe(
      'ثابت K_a = ([H_3O^+][A^-])/([HA]) للحمض',
    );
    expect(latexToPlain('$$\\sqrt{x^{2}} \\times 3 \\leq 9$$')).toBe(
      '√(x^2) × 3 ≤ 9',
    );
  });

  it('keeps LaTeX when keepLatex is on', () => {
    const [p] = cleanPages([page(1, 'قيمة $x^2$')], {
      stripHeaders: false,
      keepLatex: true,
    });
    expect(p.text).toBe('قيمة $x^2$');
  });
});

describe('chunker', () => {
  it('estimates more tokens per character for Arabic than English', () => {
    expect(estimateTokens('مرحبا بالعالم')).toBeGreaterThan(
      estimateTokens('hello world!'),
    );
  });

  it('detects Arabic, English and Markdown headings', () => {
    expect(detectHeading('الوحدة الثالثة: الحموض والقواعد')).toEqual({
      level: 1,
      title: 'الوحدة الثالثة: الحموض والقواعد',
    });
    expect(detectHeading('## ثابت التأين')).toEqual({
      level: 2,
      title: 'ثابت التأين',
    });
    expect(detectHeading('Unit 2 Achievements')?.level).toBe(1);
    expect(detectHeading('الدرس الأول الأملاح')?.level).toBe(3);
    // جملة عادية بتنتهي بنقطة مش عنوان
    expect(detectHeading('الوحدة هي أساس القياس.')).toBeNull();
  });

  it('never splits a sentence inside a math expression', () => {
    expect(splitSentences('احسب $a. b$ الآن. ثم تابع.')).toEqual([
      'احسب $a. b$ الآن.',
      'ثم تابع.',
    ]);
  });

  const body = (topic: string, n: number) =>
    Array.from(
      { length: n },
      (_, i) => `هذه جملة رقم ${i + 1} عن ${topic} وتشرح المفهوم بالتفصيل.`,
    ).join(' ');

  const book = [
    page(
      1,
      `# الوحدة 1 الحموض\n\n## ثابت التأين\n\n${body('ثابت التأين', 30)}`,
    ),
    page(2, `## الأملاح\n\n${body('الأملاح', 30)}`),
  ];

  it('structure: chunks never cross a heading and carry the section path', () => {
    const chunks = chunkPages(book, {
      strategy: 'structure',
      chunkSize: 2048,
      overlap: 0,
    });
    expect(chunks.map((c) => c.section)).toEqual([
      'الوحدة 1 الحموض › ثابت التأين',
      'الوحدة 1 الحموض › الأملاح',
    ]);
    expect(chunks.every((c) => c.unit === 'الوحدة 1 الحموض')).toBe(true);
    expect(chunks[1].pageStart).toBe(2);
  });

  it('structure: a short section tail never merges into the next lesson', () => {
    // من اختبار حقيقي: "الحل: ..." ذيل قصير بالدرس الأول كان ينضم للدرس التاني
    const pages = [
      page(
        1,
        `# الوحدة 3 الحموض\n\n## الدرس الأول ثابت التأين\n\n${body('ثابت التأين', 6)} الحل: نحسب التركيز.`,
      ),
      // النموذج علّم الدرس بـ # بصفحة لحالها — المستوى لازم يضل مستوى درس
      page(2, `# الدرس الثاني الأملاح\n\n${body('الأملاح', 4)}`),
    ];
    const chunks = chunkPages(pages, {
      strategy: 'structure',
      chunkSize: 128,
      overlap: 16,
    });
    for (const c of chunks) {
      const lesson2 = c.text.includes('الأملاح');
      expect(c.section).toBe(
        lesson2
          ? 'الوحدة 3 الحموض › الدرس الثاني الأملاح'
          : 'الوحدة 3 الحموض › الدرس الأول ثابت التأين',
      );
      if (lesson2) expect(c.text).not.toContain('ثابت التأين');
    }
    expect(
      chunks.some(
        (c) =>
          c.text.includes('الحل: نحسب التركيز.') &&
          c.section!.includes('الدرس الأول'),
      ),
    ).toBe(true);
    // الدمج بيشيل الجمل المكررة من التداخل
    for (const c of chunks)
      expect(new Set(splitSentences(c.text)).size).toBe(
        splitSentences(c.text).length,
      );
  });

  it('respects chunk size and repeats the overlap at the start of the next chunk', () => {
    const chunks = chunkPages(book, {
      strategy: 'fixed',
      chunkSize: 128,
      overlap: 32,
    });
    expect(chunks.length).toBeGreaterThan(4);
    for (const c of chunks) expect(c.tokens).toBeLessThanOrEqual(128 + 20);
    const firstOfNext = splitSentences(chunks[1].text)[0];
    expect(chunks[0].text.endsWith(firstOfNext)).toBe(false);
    expect(chunks[0].text).toContain(firstOfNext);
  });

  it('fixed: zero overlap means no repeated text', () => {
    const chunks = chunkPages(book, {
      strategy: 'fixed',
      chunkSize: 128,
      overlap: 0,
    });
    const joined = chunks.map((c) => c.text).join(' ');
    expect((joined.match(/جملة رقم 1 عن ثابت/g) ?? []).length).toBe(1);
  });

  it('semantic: cuts where the vocabulary changes', () => {
    const text = `${body('التفاعل الكيميائي وسرعة التفاعل', 12)} ${Array.from({ length: 12 }, (_, i) => `الخلية العصبية ${i} تنقل السيال العصبي عبر المحور والتشابك.`).join(' ')}`;
    const chunks = chunkPages([page(1, text)], {
      strategy: 'semantic',
      chunkSize: 2048,
      overlap: 0,
    });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0].text).toContain('التفاعل');
    expect(chunks[0].text).not.toContain('العصبية');
  });
});

describe('question checks', () => {
  const q = {
    questionText: "قيمة $f'(2)$ تساوي:",
    choices: [
      { label: 'A', text: '0' },
      { label: 'B', text: '2' },
      { label: 'C', text: '-2' },
      { label: 'D', text: '12' },
    ],
    correctAnswer: 'A',
    explanation: 'مشتقة',
  };

  it('finds duplicates despite diacritics, alef forms and choice order', () => {
    const idx = new DuplicateIndex();
    idx.add('bank-1', q);
    expect(
      idx.find({
        ...q,
        questionText: "قِيمة $f'(2)$ تُساوي",
        choices: [...q.choices].reverse(),
      }),
    ).toBe('bank-1');
    expect(
      idx.find({
        ...q,
        questionText: "قيمة $f'(3)$ تساوي:",
        choices: [{ label: 'A', text: '9' }],
      }),
    ).toBeNull();
  });

  it('flags structural problems; a missing explanation alone does not block auto-approve', () => {
    expect(questionFlags(q)).toEqual([]);
    const noExplanation = questionFlags({ ...q, explanation: '' });
    expect(noExplanation).toEqual(['بدون شرح']);
    expect(blocksAutoApprove(noExplanation)).toBe(false);

    const bad = questionFlags(
      { ...q, choices: q.choices.slice(0, 3), correctAnswer: 'D' },
      ['الإجابة لا تطابق الشرح'],
    );
    expect(bad).toEqual([
      '3 خيارات فقط',
      'الإجابة ليست بين الخيارات',
      'الإجابة لا تطابق الشرح',
    ]);
    expect(blocksAutoApprove(bad)).toBe(true);
  });
});

describe('options', () => {
  it('clamps limits and keeps overlap under half the chunk size', () => {
    const o = normalizeOptions({
      chunkSize: 5000,
      overlap: 999,
      threshold: 0.5,
      strategy: 'bogus' as never,
    });
    expect(o.chunkSize).toBe(2048);
    expect(o.overlap).toBe(256);
    expect(o.threshold).toBe(0.8);
    expect(o.strategy).toBe('structure');
    expect(normalizeOptions({ chunkSize: 128, overlap: 128 }).overlap).toBe(64);
  });

  it('ignores fields that are present but undefined (partial DTOs)', () => {
    const stored = normalizeOptions({
      stripHeaders: true,
      keepLatex: true,
      embedNow: true,
      chunkSize: 512,
    });
    const merged = normalizeOptions(
      { chunkSize: 256, stripHeaders: undefined, embedNow: undefined },
      stored,
    );
    expect(merged).toMatchObject({
      chunkSize: 256,
      stripHeaders: true,
      keepLatex: true,
      embedNow: true,
    });
  });
});

describe('search normalization', () => {
  it('drops harakat and tatweel and unifies alef, so undiacritized queries match OCR text', () => {
    expect(
      normalizeForSearch('يَتَوَقَّعُ مِنَ الطَّلَبَةِ أَنْ يَكُونُوا'),
    ).toBe('يتوقع من الطلبة ان يكونوا');
    expect(normalizeForSearch('إِنَّ الـعِلْمَ آيَةٌ')).toBe('ان العلم اية');
    expect(normalizeForSearch('ثابت $K_a$')).toBe('ثابت $K_a$');
  });
});
