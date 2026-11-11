import type {
  ChunkDraft,
  ChunkStrategy,
  ExtractedPage,
} from '../knowledge.types';

/**
 * تقطيع الصفحات المنظّفة لمقاطع.
 *
 * - structure: المقطع ما بيعدّي حدود عنوان (وحدة/فصل/درس)، وجوّا القسم
 *   بيتجمّع لحد حجم المقطع.
 * - semantic: حدود المقاطع وين ما يتغير الموضوع — TextTiling: تشابه
 *   المفردات بين نافذتين متجاورتين من الجمل، والحد عند الهبوط الحاد.
 *   بدون استدعاء أي نموذج، فالتقطيع مجاني وسريع وقابل للتكرار.
 * - fixed: نوافذ بعدد توكنات ثابت بغض النظر عن العناوين.
 *
 * بالتلات، التقسيم على مستوى الجمل (والكلمات لجملة أطول من المقطع)،
 * والتداخل هو آخر جمل المقطع السابق بحدود عدد التوكنات المطلوب.
 */

/* ───────── عدّ التوكنات ───────── */

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿ]/g;

/**
 * تقدير عدد التوكنات. ما في tokenizer واحد لكل النماذج، والعربي بياخد
 * توكنات أكتر للحرف من الإنجليزي: تقريباً ٢٫٨ حرف للتوكن بالعربي و٤
 * بالإنجليزي. الغلط بحدود ١٥٪ ومقبول لتحديد حجم المقطع.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const arabic = text.match(ARABIC)?.length ?? 0;
  const other = text.replace(/\s+/g, '').length - arabic;
  return Math.max(1, Math.ceil(arabic / 2.8 + Math.max(0, other) / 4));
}

/* ───────── العناوين ───────── */

interface Heading {
  level: number;
  title: string;
}

const HEADING_PATTERNS: [RegExp, number][] = [
  [/^(?:الوحدة|الوحده|الباب)\s+\S+/, 1],
  [/^unit\s+[\dIVX]+/i, 1],
  [/^(?:الفصل|الفصل الدراسي)\s+\S+/, 2],
  [/^chapter\s+[\dIVX]+/i, 2],
  [/^(?:الدرس|الموضوع)\s+\S+/, 3],
  [/^lesson\s+\d+/i, 3],
  // ترقيم أقسام: "3-2 الأملاح" أو "٣.٢ الأملاح"
  [/^[0-9٠-٩]{1,2}\s*[-.]\s*[0-9٠-٩]{1,2}\s+\S+/, 3],
];

/** بيرجّع عنوان إذا السطر عنوان، وإلا null */
export function detectHeading(line: string): Heading | null {
  const t = line.trim();
  if (!t || t.length > 90) return null;

  // عناوين Markdown — التعرّف الضوئي بالنموذج بيطلعها هيك
  // مستوى # من النموذج مش ثابت بين الصفحات (بيشوف كل دفعة لحالها)، فإذا
  // العنوان فيه كلمة معروفة (الوحدة/الدرس...) منعتمد مستواها هي
  const md = t.match(/^(#{1,4})\s+(.+)$/);
  if (md) {
    const title = clean(md[2]);
    const known = HEADING_PATTERNS.find(([re]) => re.test(title));
    return { level: known ? known[1] : Math.min(md[1].length, 3), title };
  }

  // سطر بينتهي بعلامة ترقيم جملة غالباً مش عنوان
  if (/[.؟?!،,;:]$/.test(t)) return null;

  for (const [re, level] of HEADING_PATTERNS) {
    if (re.test(t)) return { level, title: clean(t) };
  }
  return null;
}

function clean(title: string) {
  return title
    .replace(/[*_#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ───────── التقسيم لقطع صغيرة ───────── */

interface Piece {
  text: string;
  tokens: number;
  page: number;
  /** مسار العناوين وقت هالجملة */
  path: string[];
  /** بداية قسم جديد (عنوان) أو حد موضوع (semantic) */
  boundary: boolean;
}

// المعادلات ما لازم تنقسم بنصها، فمنبدّلها بعلامات مؤقتة قبل التقسيم
const MATH = /\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g;

function protectMath(text: string) {
  const saved: string[] = [];
  const masked = text.replace(MATH, (m) => {
    saved.push(m);
    return `\uE000${saved.length - 1}\uE001`;
  });
  const restore = (s: string) =>
    s.replace(/\uE000(\d+)\uE001/g, (_, i: string) => saved[Number(i)]);
  return { masked, restore };
}

export function splitSentences(paragraph: string): string[] {
  const { masked, restore } = protectMath(paragraph);
  return masked
    .split(/(?<=[.!?؟۔])\s+/)
    .map((s) => restore(s).trim())
    .filter(Boolean);
}

/** جملة أطول من المقطع بتنقسم على الكلمات */
function splitLong(text: string, maxTokens: number): string[] {
  if (estimateTokens(text) <= maxTokens) return [text];
  const { masked, restore } = protectMath(text);
  const words = masked.split(/\s+/);
  const out: string[] = [];
  let cur: string[] = [];
  for (const w of words) {
    cur.push(w);
    if (estimateTokens(restore(cur.join(' '))) >= maxTokens) {
      out.push(restore(cur.join(' ')));
      cur = [];
    }
  }
  if (cur.length) out.push(restore(cur.join(' ')));
  return out;
}

/**
 * بيحوّل الصفحات لقائمة جمل مع رقم الصفحة ومسار العناوين. الأسطر
 * المتتالية بدون سطر فاضي بينهم بتنضم لفقرة وحدة (طبقة النص بالـ PDF
 * بتكسر الفقرة على أسطر حسب عرض الصفحة).
 */
export function toPieces(pages: ExtractedPage[], maxTokens: number): Piece[] {
  const pieces: Piece[] = [];
  const path: string[] = [];
  let pendingBoundary = true;

  for (const page of pages) {
    const blocks = page.text.split(/\n\s*\n/);
    for (const block of blocks) {
      const lines = block
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      let para: string[] = [];

      const flushPara = () => {
        if (!para.length) return;
        for (const sentence of splitSentences(para.join(' '))) {
          for (const part of splitLong(sentence, maxTokens)) {
            pieces.push({
              text: part,
              tokens: estimateTokens(part),
              page: page.page,
              path: [...path],
              boundary: pendingBoundary,
            });
            pendingBoundary = false;
          }
        }
        para = [];
      };

      for (const line of lines) {
        const h = detectHeading(line);
        if (h) {
          flushPara();
          path.length = Math.min(path.length, h.level - 1);
          while (path.length < h.level - 1) path.push('');
          path.push(h.title);
          pendingBoundary = true;
        } else {
          para.push(line);
        }
      }
      flushPara();
    }
  }
  return pieces;
}

/* ───────── TextTiling للتقطيع الدلالي ───────── */

const STOPWORDS = new Set(
  (
    'في من على إلى الى عن مع هذا هذه ذلك تلك التي الذي الذين أن إن كان كانت ' +
    'هو هي هم ثم أو و أي كل بين عند قد لا ما لم لن إذا اذا حيث كما بعد قبل ' +
    'the a an of to in on for and or is are was were be by with as at from that this it'
  ).split(/\s+/),
);

function termVector(text: string): Map<string, number> {
  const v = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  for (const w of words) {
    // جذع تقريبي: أداة التعريف بالعربي بتخلّي نفس الكلمة تبين مختلفة
    const stem = w.replace(/^(?:وال|بال|كال|فال|لل|ال)/, '');
    v.set(stem, (v.get(stem) ?? 0) + 1);
  }
  return v;
}

function cosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, x] of a) {
    na += x * x;
    const y = b.get(k);
    if (y) dot += x * y;
  }
  for (const y of b.values()) nb += y * y;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * بيعلّم حدود المواضيع على الجمل (Hearst 1997): لكل فجوة بين جملتين
 * منقارن نافذة قبلها ونافذة بعدها، ومنحسب «عمق» الهبوط بالتشابه نسبةً
 * للقمم المحيطة. الحد وين ما يكون العمق أكبر من (المتوسط − نص الانحراف).
 */
export function markTopicBoundaries(pieces: Piece[], window = 3): void {
  const n = pieces.length;
  if (n < window * 2 + 1) return;

  const vectors = pieces.map((p) => termVector(p.text));
  const merge = (from: number, to: number) => {
    const m = new Map<string, number>();
    for (let i = Math.max(0, from); i < Math.min(n, to); i++) {
      for (const [k, x] of vectors[i]) m.set(k, (m.get(k) ?? 0) + x);
    }
    return m;
  };

  // gap[i] = التشابه بين الجمل قبل i والجمل من i وطالع
  const gaps: number[] = Array.from({ length: n }, () => 1);
  for (let i = 1; i < n; i++) {
    gaps[i] = cosine(merge(i - window, i), merge(i, i + window));
  }

  const depth: number[] = Array.from({ length: n }, () => 0);
  for (let i = 1; i < n; i++) {
    let l = gaps[i];
    for (let j = i - 1; j >= 1 && gaps[j] >= l; j--) l = gaps[j];
    let r = gaps[i];
    for (let j = i + 1; j < n && gaps[j] >= r; j++) r = gaps[j];
    depth[i] = l - gaps[i] + (r - gaps[i]);
  }

  const scores = depth.slice(1);
  const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
  const sd = Math.sqrt(
    scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length,
  );
  const cutoff = mean - sd / 2;

  for (let i = 1; i < n; i++) pieces[i].boundary = false;
  // قرب الأطراف النافذة ناقصة فالتشابه بيهبط بدون ما يتغير الموضوع
  for (let i = window; i <= n - window; i++) {
    // حدود قريبة كتير من بعض بتعطي مقاطع من جملة وحدة
    const localMax =
      depth[i] >= (depth[i - 1] ?? 0) && depth[i] >= (depth[i + 1] ?? 0);
    pieces[i].boundary = depth[i] > cutoff && depth[i] > 0 && localMax;
  }
  pieces[0].boundary = true;
}

/* ───────── التجميع ───────── */

function sectionOf(path: string[]) {
  const parts = path.filter(Boolean);
  return parts.length ? parts.join(' › ') : null;
}

/**
 * بيجمّع الجمل بمقاطع لحد chunkSize، ومع كل مقطع جديد بيعيد آخر جمل من
 * السابق بحدود overlap. على حد قسم (respectBoundaries) ما في تداخل —
 * ما بدنا نص من درس يبين كإنه من الدرس يلي بعده.
 *
 * minTokens: بعد التجميع، مقطع أصغر من هيك (ذيل قسم، جملة وحدة) بينضم
 * للمقطع يلي قبله بنفس القسم، أو يلي بعده بنفس القسم — وما بيعدّي حد
 * قسم أبداً. الدمج على مستوى الجمل، فالتداخل ما بيتكرر.
 */
function pack(
  pieces: Piece[],
  chunkSize: number,
  overlap: number,
  respectBoundaries: boolean,
  minTokens: number,
): ChunkDraft[] {
  // كل مقطع = أرقام جمل (مش نص) حتى الدمج بعدين يشيل المكرر
  const groups: number[][] = [];
  let cur: number[] = [];
  let curTokens = 0;
  const tokensOf = (g: number[]) => g.reduce((n, i) => n + pieces[i].tokens, 0);

  const carry = () => {
    const tail: number[] = [];
    let t = 0;
    for (let k = cur.length - 1; k > 0; k--) {
      const tok = pieces[cur[k]].tokens;
      if (t + tok > overlap) break;
      tail.unshift(cur[k]);
      t += tok;
    }
    return { tail, t };
  };

  pieces.forEach((piece, i) => {
    if (respectBoundaries && piece.boundary && cur.length) {
      groups.push(cur);
      cur = [];
      curTokens = 0;
    }
    if (curTokens + piece.tokens > chunkSize && cur.length) {
      groups.push(cur);
      const { tail, t } = overlap > 0 ? carry() : { tail: [], t: 0 };
      cur = tail;
      curTokens = t;
    }
    cur.push(i);
    curTokens += piece.tokens;
  });
  if (cur.length) groups.push(cur);

  // دمج المقاطع الصغيرة ضمن نفس القسم
  const sectionKey = (g: number[]) => sectionOf(pieces[g[0]].path) ?? '';
  const merge = (a: number[], b: number[]) =>
    Array.from(new Set([...a, ...b])).sort((x, y) => x - y);
  const limit = Math.round(chunkSize * 1.25);
  for (let k = 0; k < groups.length; k++) {
    const g = groups[k];
    if (groups.length < 2 || tokensOf(g) >= minTokens) continue;
    const prev = groups[k - 1];
    const next = groups[k + 1];
    if (
      prev &&
      sectionKey(prev) === sectionKey(g) &&
      tokensOf(merge(prev, g)) <= limit
    ) {
      groups[k - 1] = merge(prev, g);
      groups.splice(k--, 1);
    } else if (
      next &&
      sectionKey(next) === sectionKey(g) &&
      tokensOf(merge(g, next)) <= limit
    ) {
      groups[k + 1] = merge(g, next);
      groups.splice(k--, 1);
    }
  }

  return groups.map((g) => {
    const first = pieces[g[0]];
    const text = g.map((i) => pieces[i].text).join(' ');
    return {
      pageStart: first.page,
      pageEnd: pieces[g[g.length - 1]].page,
      section: sectionOf(first.path),
      unit: first.path.find(Boolean) ?? null,
      text,
      tokens: estimateTokens(text),
    };
  });
}

export function chunkPages(
  pages: ExtractedPage[],
  opts: { strategy: ChunkStrategy; chunkSize: number; overlap: number },
): ChunkDraft[] {
  const { strategy, chunkSize, overlap } = opts;
  const pieces = toPieces(pages, chunkSize);
  if (!pieces.length) return [];

  switch (strategy) {
    case 'structure':
      return pack(pieces, chunkSize, overlap, true, 40);
    case 'semantic':
      markTopicBoundaries(pieces);
      // الموضوع الواحد ممكن يكون أقصر من المقطع بكتير؛ الحد الأدنى بيمنع
      // مقاطع من جملة أو جملتين بس ما بيدمج مواضيع كاملة
      return pack(
        pieces,
        chunkSize,
        overlap,
        true,
        Math.min(96, Math.floor(chunkSize / 4)),
      );
    case 'fixed':
      return pack(pieces, chunkSize, overlap, false, 0);
  }
}
