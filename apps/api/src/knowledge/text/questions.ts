/**
 * فحص الأسئلة المستخرجة من الامتحانات: كشف المكرر، وتنبيهات المراجع.
 */

interface QuestionLike {
  questionText: string;
  choices: { label: string; text: string }[];
  correctAnswer?: string | null;
  explanation?: string | null;
}

/**
 * توحيد النص للمقارنة: بدون تشكيل ولا تطويل، الألف والياء والتاء
 * المربوطة موحّدين، وبدون رموز LaTeX وعلامات الترقيم. هيك نفس السؤال
 * بطبعتين مختلفتين بيطلع نفس المفتاح.
 */
export function normalizeForCompare(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\\[a-z]+/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** نص المقارنة: نص السؤال + الخيارات مرتبة (الترتيب بيتغير بين النسخ) */
export function questionFingerprint(q: QuestionLike): string {
  const choices = (q.choices ?? [])
    .map((c) => normalizeForCompare(c.text))
    .sort()
    .join(' | ');
  return `${normalizeForCompare(q.questionText)} || ${choices}`;
}

function trigrams(s: string): Set<string> {
  const t = s.replace(/\s+/g, ' ');
  const out = new Set<string>();
  for (let i = 0; i < t.length - 2; i++) out.add(t.slice(i, i + 3));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  for (const x of small) if (big.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** حد التشابه يلي فوقه السؤالين بيعتبروا نفس السؤال */
export const DUPLICATE_THRESHOLD = 0.9;

/**
 * فهرس للأسئلة الموجودة. المطابقة التامة بعد التوحيد سريعة (Set)، والشبه
 * بالـ trigrams بيلقط فروق OCR الصغيرة (حرف غلط، مسافة زيادة).
 */
export class DuplicateIndex {
  private exact = new Map<string, string>();
  private grams: { id: string; grams: Set<string>; len: number }[] = [];

  add(id: string, q: QuestionLike) {
    const fp = questionFingerprint(q);
    this.exact.set(fp, id);
    this.grams.push({ id, grams: trigrams(fp), len: fp.length });
  }

  /** بيرجّع رقم السؤال المكرر إن وجد */
  find(q: QuestionLike): string | null {
    const fp = questionFingerprint(q);
    const hit = this.exact.get(fp);
    if (hit) return hit;
    const g = trigrams(fp);
    for (const other of this.grams) {
      // فرق كبير بالطول يعني مستحيل يوصلوا للحد — منوفّر الحساب
      const ratio =
        Math.min(fp.length, other.len) / Math.max(fp.length, other.len);
      if (ratio < DUPLICATE_THRESHOLD) continue;
      if (jaccard(g, other.grams) >= DUPLICATE_THRESHOLD) return other.id;
    }
    return null;
  }
}

/**
 * تنبيهات معلوماتية ما بتمنع الاعتماد التلقائي: أوراق الوزارة غالباً
 * بدون شرح، وغياب الشرح ما بيعني إن السؤال غلط.
 */
export const NON_BLOCKING_FLAGS = new Set(['بدون شرح']);

export function blocksAutoApprove(flags: string[]): boolean {
  return flags.some((f) => !NON_BLOCKING_FLAGS.has(f));
}

/**
 * تنبيهات للمراجع. أي تنبيه (غير المعلوماتية فوق) بيمنع الاعتماد التلقائي
 * حتى لو الثقة عالية، لأنها أشياء النموذج ما بيقيّمها بثقته (خيار ناقص،
 * LaTeX مكسور).
 */
export function questionFlags(
  q: QuestionLike,
  modelIssues: string[] = [],
): string[] {
  const flags: string[] = [];
  const labels = (q.choices ?? []).map((c) => c.label.trim().toUpperCase());
  const n = labels.length;

  if (n < 4) flags.push(n === 0 ? 'بدون خيارات' : `${n} خيارات فقط`);
  if (new Set(labels).size !== n) flags.push('تسميات خيارات مكررة');
  if ((q.choices ?? []).some((c) => !c.text?.trim())) flags.push('خيار فارغ');

  const answer = (q.correctAnswer ?? '').trim().toUpperCase();
  if (!answer) flags.push('الإجابة غير محددة');
  else if (!labels.includes(answer)) flags.push('الإجابة ليست بين الخيارات');

  if (!q.explanation?.trim()) flags.push('بدون شرح');

  const all = [
    q.questionText,
    ...(q.choices ?? []).map((c) => c.text),
    q.explanation ?? '',
  ].join(' ');
  // $$ بتنعد مرتين، فالعدد الكلي لازم يكون زوجي
  if ((all.match(/\$/g) ?? []).length % 2 !== 0)
    flags.push('صيغة LaTeX غير مكتملة');

  for (const issue of modelIssues) {
    const t = issue?.trim();
    if (t && !flags.includes(t)) flags.push(t.slice(0, 80));
  }
  return flags;
}
