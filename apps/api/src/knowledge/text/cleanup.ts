import type { ExtractedPage } from '../knowledge.types';

/**
 * تنظيف النص المستخرج قبل التقطيع. كل الدوال هون نقية (بدون I/O) حتى
 * تنفحص بسهولة وتنعاد على نفس الصفحات المحفوظة وقت إعادة التقطيع.
 */

// محارف غير مرئية: مسافات صفرية، وعلامات اتجاه (LRM/RLM والتضمين) يلي
// Tesseract بيحشرها حول الأرقام والإنجليزي جوّا النص العربي
const ZERO_WIDTH =
  /\u200B|\u200D|\uFEFF|\u00AD|\u200E|\u200F|[\u202A-\u202E]|[\u2066-\u2069]/g;

/**
 * NFKC بيرجّع أشكال العرض العربية (U+FB50–U+FEFF) لحروفها الأصلية —
 * طبقة النص بكتير ملفات PDF عربية بتطلع فيها، وبدونه البحث النصي
 * والتضمين بيشوفوا حروف غريبة.
 */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(ZERO_WIDTH, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00A0]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** سطر فيه رقم صفحة بس: "12"، "- 12 -"، "صفحة 12"، "Page 3 / 20"، "١٢" */
const PAGE_NUMBER_LINE =
  /^[\s\-–—|•.·()[\]]*(?:(?:صفحة|الصفحة|ص|page|p)\.?\s*)?[0-9٠-٩]{1,4}(?:\s*(?:\/|من|of)\s*[0-9٠-٩]{1,4})?[\s\-–—|•.·()[\]]*$/i;

export function isPageNumberLine(line: string): boolean {
  return PAGE_NUMBER_LINE.test(line.trim());
}

/** مفتاح مقارنة للترويسات: الأرقام بتتغير من صفحة لصفحة فمنوحّدها */
function headerKey(line: string): string {
  return line
    .replace(/[0-9٠-٩]+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

/** كم سطر من أول وآخر الصفحة منفحص كترويسة/تذييل */
const EDGE_LINES = 2;

/**
 * بيحذف الترويسات والتذييلات المتكررة وأرقام الصفحات.
 *
 * السطر بيعتبر ترويسة إذا تكرر (بعد توحيد الأرقام) بأطراف ٣٠٪ من
 * الصفحات أو أكتر، وبحد أدنى ٣ صفحات — هيك عنوان الكتاب بأعلى كل صفحة
 * بينشال، بس عنوان درس بيتكرر مرتين ما بيتأثر.
 */
export function stripHeadersAndFooters(
  pages: ExtractedPage[],
): ExtractedPage[] {
  const edges = (lines: string[]) => {
    const nonEmpty = lines
      .map((l, i) => ({ l: l.trim(), i }))
      .filter((x) => x.l);
    return [...nonEmpty.slice(0, EDGE_LINES), ...nonEmpty.slice(-EDGE_LINES)];
  };

  const counts = new Map<string, number>();
  const split = pages.map((p) => p.text.split('\n'));
  for (const lines of split) {
    const seen = new Set<string>();
    for (const { l } of edges(lines)) {
      const key = headerKey(l);
      if (key.length < 2 || seen.has(key)) continue;
      seen.add(key);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const minRepeats = Math.max(3, Math.ceil(pages.length * 0.3));
  const repeated = new Set(
    [...counts].filter(([, n]) => n >= minRepeats).map(([k]) => k),
  );

  return pages.map((p, idx) => {
    const lines = split[idx];
    const drop = new Set<number>();
    for (const { l, i } of edges(lines)) {
      if (isPageNumberLine(l) || repeated.has(headerKey(l))) drop.add(i);
    }
    const text = lines
      .filter((_, i) => !drop.has(i))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return { ...p, text };
  });
}

const LATEX_SYMBOLS: Record<string, string> = {
  times: '×',
  cdot: '·',
  div: '÷',
  pm: '±',
  mp: '∓',
  le: '≤',
  leq: '≤',
  ge: '≥',
  geq: '≥',
  neq: '≠',
  ne: '≠',
  approx: '≈',
  equiv: '≡',
  infty: '∞',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  Rightarrow: '⇒',
  rightleftharpoons: '⇌',
  leftrightarrow: '↔',
  circ: '°',
  degree: '°',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  Delta: 'Δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  Sigma: 'Σ',
  tau: 'τ',
  phi: 'φ',
  omega: 'ω',
  Omega: 'Ω',
  int: '∫',
  sum: 'Σ',
  partial: '∂',
  nabla: '∇',
  in: '∈',
  cup: '∪',
  cap: '∩',
  sin: 'sin',
  cos: 'cos',
  tan: 'tan',
  ln: 'ln',
  log: 'log',
  lim: 'lim',
};

/** بيحوّل تعبير LaTeX لنص مقروء: \frac{a}{b} → (a)/(b)، \sqrt{x} → √(x) */
export function latexExpressionToPlain(expr: string): string {
  let s = expr;
  // الأوامر المتداخلة بتنحل من جوّا لبرّا، فمنكرر لحد ما يثبت النص
  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s
      .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
      .replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, '$1√($2)')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)')
      .replace(
        /\\(?:text|mathrm|mathbf|operatorname|textbf|mathit)\s*\{([^{}]*)\}/g,
        '$1',
      )
      .replace(/\\(?:overline|vec|hat|bar)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\^\{([^{}]*)\}/g, '^$1')
      .replace(/_\{([^{}]*)\}/g, '_$1');
    if (s === before) break;
  }
  return s
    .replace(/\\(?:left|right|big|Big|bigg|Bigg)\b\s*/g, '')
    .replace(/\\[,;:!]|\\quad|\\qquad|~/g, ' ')
    .replace(/\\([A-Za-z]+)/g, (_, cmd: string) => LATEX_SYMBOLS[cmd] ?? cmd)
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** بيشيل صيغة LaTeX من النص كامل ($$...$$ و $...$) ويحط مكانها نص مقروء */
export function latexToPlain(text: string): string {
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, e: string) => latexExpressionToPlain(e))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, e: string) => latexExpressionToPlain(e))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, e: string) => latexExpressionToPlain(e))
    .replace(/\$([^$\n]+?)\$/g, (_, e: string) => latexExpressionToPlain(e));
}

/** التنظيف الكامل حسب الخيارات، بالترتيب يلي بيعتمد عليه التقطيع */
export function cleanPages(
  pages: ExtractedPage[],
  opts: { stripHeaders: boolean; keepLatex: boolean },
): ExtractedPage[] {
  let out = pages.map((p) => ({ ...p, text: normalizeText(p.text) }));
  if (opts.stripHeaders) out = stripHeadersAndFooters(out);
  if (!opts.keepLatex)
    out = out.map((p) => ({ ...p, text: latexToPlain(p.text) }));
  return out;
}

/**
 * توحيد للبحث فقط (مش للعرض): الكتب بتطلع من التعرّف الضوئي مشكّلة
 * («يَتَوَقَّعُ») والطالب بيكتب بدون تشكيل («يتوقع»). منشيل الحركات والتطويل
 * ومنوحّد أشكال الألف. نفس الحروف بالضبط بـ SEARCH_TRANSLATE_* تحت، يلي
 * بيستعملها فهرس البحث النصي بقاعدة البيانات.
 */
export const SEARCH_TRANSLATE_FROM =
  'أإآٱ\u064B\u064C\u064D\u064E\u064F\u0650\u0651\u0652\u0670\u0640';
export const SEARCH_TRANSLATE_TO = 'اااا';

export function normalizeForSearch(text: string): string {
  let out = '';
  for (const ch of text) {
    const i = SEARCH_TRANSLATE_FROM.indexOf(ch);
    if (i < 0) out += ch;
    else if (i < SEARCH_TRANSLATE_TO.length) out += SEARCH_TRANSLATE_TO[i];
  }
  return out;
}
