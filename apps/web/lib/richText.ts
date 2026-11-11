/**
 * تحليل نصوص المحتوى التعليمي (أسئلة، شروحات، ردود المساعد، مقاطع الكتب)
 * لكتل جاهزة للعرض — نفس المحلّل لكل المواد:
 *
 *   - رياضيات/فيزياء/كيمياء: $…$ و$$…$$ و\(…\) و\[…\] (والكيمياء \ce{…})
 *   - آيات قرآنية: ﴿…﴾ — بتنعرض بخط المصحف وما بينلمس تشكيلها
 *   - نص مشكول بكثافة (شعر، أمثلة نحو): بخط نسخ بيوضّح الحركات
 *   - **عريض**
 *
 * اتجاه كل فقرة بيتحدد من كلماتها بس، مش من المعادلات — وإلا سؤال عربي
 * بيبدأ بـ $\mathbf{A}$ كان ينقلب لليسار ويتلخبط ترتيبه.
 *
 * هالملف بدون React حتى ينفحص لحاله؛ العرض بـ components/ui/RichText.
 */

export type Inline =
  | { kind: "text"; text: string; bold?: boolean; diacritized?: boolean }
  | { kind: "math"; tex: string }
  | { kind: "quran"; text: string };

export type Block =
  | { kind: "para"; dir: "rtl" | "ltr"; inlines: Inline[] }
  | { kind: "math"; tex: string };

/*
 * محتوى قديم انحفظ قبل إصلاح تحليل JSON: النموذج كتب "\times" بشرطة وحدة،
 * فـ JSON.parse قرأ \t كـ tab وضل "imes". هالمحارف ما بتطلع بنص سليم
 * لاصقة بحرف لاتيني، فمنرجّعها أوامر LaTeX.
 */
const CORRUPTED_ESCAPES: Record<string, string> = {
  "\t": "\\t",
  "\r": "\\r",
  "\f": "\\f",
  "\b": "\\b",
};

export function repairEscapes(s: string): string {
  return s.replace(/[\t\r\f\b](?=[a-zA-Z])/g, (c) => CORRUPTED_ESCAPES[c]);
}

/*
 * المعادلات. $ المفردة بقاعدة pandoc: ما بعد الفتحة ولا قبل الإغلاق مسافة،
 * وما بعد الإغلاق رقم — حتى "السعر $5 أو $10" ما ينقرأ معادلة.
 */
const MATH_RE =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$])\$(?=\S)([^$\n]*?\S)\$(?!\d)/g;

const ARABIC_LETTER = /[ء-يٱ-ۓ]/g;
const HARAKA = /[ً-ْٰ]/g;
const LATIN_LETTER = /[A-Za-z]/;
const ARABIC_ANY = /[؀-ۿ]/;

/** نسبة الحركات للحروف — نص مشكول بالكامل حوالي ٠٫٨، ونص عادي قريب من الصفر */
function isDiacritized(text: string): boolean {
  const letters = text.match(ARABIC_LETTER)?.length ?? 0;
  if (letters < 8) return false;
  const marks = text.match(HARAKA)?.length ?? 0;
  return marks / letters > 0.35;
}

/** **عريض** و﴿آية﴾ داخل نص عادي */
function parseText(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*\n]+)\*\*|﴿[^﴾]*﴾/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) pushText(out, text.slice(last, m.index));
    if (m[1] !== undefined) pushText(out, m[1], true);
    else out.push({ kind: "quran", text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) pushText(out, text.slice(last));
  return out;
}

function pushText(out: Inline[], text: string, bold = false) {
  if (!text) return;
  out.push({ kind: "text", text, bold: bold || undefined, diacritized: isDiacritized(text) || undefined });
}

/** أول حرف قوي بكلمات الفقرة (بدون المعادلات) بيحدد اتجاهها */
function paragraphDir(inlines: Inline[]): "rtl" | "ltr" {
  for (const i of inlines) {
    if (i.kind === "quran") return "rtl";
    if (i.kind !== "text") continue;
    for (const ch of i.text) {
      if (ARABIC_ANY.test(ch)) return "rtl";
      if (LATIN_LETTER.test(ch)) return "ltr";
    }
  }
  // فقرة كلها معادلات — المنصة عربية
  return "rtl";
}

export function parseRichText(input: string): Block[] {
  const source = repairEscapes(input ?? "");
  const blocks: Block[] = [];
  let para: Inline[] = [];

  const flush = () => {
    // سطر فاضي بين فقرتين بيضل فقرة فاضية حتى تبيّن المسافة
    blocks.push({ kind: "para", dir: paragraphDir(para), inlines: para });
    para = [];
  };

  const addText = (text: string) => {
    const lines = text.split("\n");
    lines.forEach((line, i) => {
      if (i > 0) flush();
      para.push(...parseText(line));
    });
  };

  let last = 0;
  for (const m of source.matchAll(MATH_RE)) {
    addText(source.slice(last, m.index));
    const display = m[1] ?? m[2];
    if (display !== undefined) {
      if (para.length) flush();
      blocks.push({ kind: "math", tex: display.trim() });
      // السطر الجديد يلي بعد الكتلة مباشرة جزء منها، مش فقرة فاضية
      last = m.index + m[0].length;
      if (source[last] === "\n") last++;
      continue;
    }
    para.push({ kind: "math", tex: (m[3] ?? m[4]).trim() });
    last = m.index + m[0].length;
  }
  addText(source.slice(last));
  if (para.length || !blocks.length) flush();
  return blocks;
}

/*
 * KaTeX بيرسم كل حرف بوضع الرياضيات لحاله، فالكلمات العربية بتطلع حروف
 * مقطّعة. منلفّ كل سلسلة عربية بـ \text{} حتى تنرسم كلمة متصلة — إلا إذا
 * كانت أصلاً جوا \text{…}.
 */
export function wrapArabicInMath(tex: string): string {
  return tex.replace(
    /(\\(?:text|textbf|textrm|mathrm|mbox|operatorname)\s*\{[^{}]*\})|([؀-ۿ][؀-ۿً-ْ\s]*)/g,
    (m, group: string | undefined, arabic: string | undefined) => {
      if (group) return group;
      const run = arabic!.trimEnd();
      return `\\text{${run}}${arabic!.slice(run.length)}`;
    },
  );
}

/** نص بدون تنسيق — للبحث والـ aria-label والمعاينات المقصوصة */
export function toPlainText(input: string): string {
  return repairEscapes(input ?? "")
    .replace(MATH_RE, (_m, a?: string, b?: string, c?: string, d?: string) => ` ${(a ?? b ?? c ?? d ?? "").trim()} `)
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
