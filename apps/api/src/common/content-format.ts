/**
 * صيغة المحتوى يلي بيعرضها الويب (apps/web/lib/richText + RichText):
 * KaTeX للمعادلات و\ce{} للكيمياء، ﴿…﴾ للآيات بخط المصحف، **عريض**.
 * كل prompt بيولّد محتوى للطالب بيضمّن هالقواعد حتى العرض يطلع صح بكل
 * المواد — أي تغيير هون لازم يقابله تغيير بالمحلّل هناك.
 */
export const CONTENT_FORMAT_RULES = `CONTENT FORMAT (the student app renders exactly this — follow it in every subject):
- Math, physics, statistics: LaTeX inside $...$ (inline) or $$...$$ (on its own line). Do not use \\( \\) or \\[ \\].
- Inside math, wrap Arabic letters and words in \\text{}: $\\text{ق}(\\text{س}) = 2\\text{س}^2$. Keep Arabic sentences outside $...$.
- Chemistry formulas and equations use mhchem: $\\ce{2H2 + O2 -> 2H2O}$.
- Quranic verses: copy them EXACTLY as in the Mushaf (Hafs) with full diacritics, wrapped in ﴿ ﴾ and followed by the reference, e.g. ﴿إِنَّ مَعَ الْعُسْرِ يُسْرًا﴾ [الشرح: 6]. Never paraphrase, shorten, or reconstruct a verse; if you are not certain of every word, give only the surah and verse number instead of the text.
- Hadith, poetry and quoted texts: keep the source wording and its diacritics unchanged.
- Grammar/morphology (النحو والصرف) items: fully diacritize the words being analysed.
- Use **bold** for key terms. No markdown headings (#) and no tables.`;

/** إضافة للـ prompts يلي ردها JSON: الشرطة بـ LaTeX لازم تنكتب مزدوجة */
export const JSON_LATEX_ESCAPING = `Inside JSON strings every backslash must be escaped: write "\\\\frac{a}{b}" and "\\\\times", never "\\frac" or "\\times".`;

/*
 * أوامر LaTeX بتبدأ بحرف هو نفسه رمز هروب بـ JSON: \t(imes) \r(ight) \f(rac)
 * \b(eta) \n(eq) \u(nderline). نموذج بيكتبها بشرطة وحدة، فـ JSON.parse
 * بيقرا tab أو سطر جديد بصمت ("2\times 3" → "2<TAB>imes 3")، أو بيوقع
 * (\underline مش \uXXXX صالح). منضاعف الشرطة قبل التحليل.
 *
 * \n لحاله شائع ومقصود (سطر جديد)، فمنصلّحه بس قبل أسماء أوامر معروفة.
 */
const LATEX_AFTER_N =
  'neq|ne|nabla|nu|not|ni|newline|normalsize|nolimits|notin';
const LATEX_ESCAPE_RE = new RegExp(
  `(?<!\\\\)((?:\\\\\\\\)*)\\\\(?=(?:[tbfr][a-zA-Z]{2,}|u(?![0-9a-fA-F]{4})[a-zA-Z]|(?:${LATEX_AFTER_N})(?![a-zA-Z])))`,
  'g',
);

export function repairLatexEscapes(json: string): string {
  return json.replace(LATEX_ESCAPE_RE, '$1\\\\');
}

/**
 * يستخرج نص الـ JSON من ردود النماذج، سواء كانت محاطة بأسوار ماركداون (```json)
 * أو مسبوقة/متبوعة بنصوص توضيحية، مع دعم إصلاح الـ JSON المقطوع.
 */
export function extractJsonFromText(text: string): string {
  let cleaned = (text ?? '').trim();

  // 1. إذا كان الرد محاطاً بأسوار ماركداون ```json ... ``` أو ``` ... ```
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if (fenceMatch) {
    cleaned = fenceMatch[1].trim();
  }

  // 2. إذا كان لا يزال هناك نص تمهيدي قبل أول { أو [
  const firstBrace = cleaned.indexOf('{');
  const firstBracket = cleaned.indexOf('[');
  let startIdx = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    startIdx = Math.min(firstBrace, firstBracket);
  } else if (firstBrace !== -1) {
    startIdx = firstBrace;
  } else if (firstBracket !== -1) {
    startIdx = firstBracket;
  }

  if (startIdx > 0) {
    cleaned = cleaned.slice(startIdx);
  }

  // 3. اقتطاع أي تعليقات أو نصوص لاحقة بعد آخر } أو ]
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const endIdx = Math.max(lastBrace, lastBracket);
  if (endIdx !== -1 && endIdx < cleaned.length - 1) {
    cleaned = cleaned.slice(0, endIdx + 1);
  }

  return cleaned.trim();
}

/**
 * محاولة إصلاح الـ JSON في حال انقطاعه المفاجئ (Unexpected end of JSON input)
 */
export function repairTruncatedJson(json: string): string {
  let trimmed = json.trim();
  if (!trimmed) return '{}';

  let inString = false;
  let isEscaped = false;
  const stack: ('{' | '[')[] = [];

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (isEscaped) {
      isEscaped = false;
      continue;
    }
    if (char === '\\') {
      isEscaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' && stack.length && stack[stack.length - 1] === '{') {
        stack.pop();
      } else if (char === ']' && stack.length && stack[stack.length - 1] === '[') {
        stack.pop();
      }
    }
  }

  // إذا انتهى النص وداخل نص نصي "
  if (inString) {
    trimmed += '"';
  }

  // إزالة أي فواصل معلقة في النهاية
  trimmed = trimmed.replace(/,\s*$/, '');

  // إغلاق أي أقواس متبقية بالترتيب المعاكس
  while (stack.length > 0) {
    const top = stack.pop();
    if (top === '{') trimmed += '}';
    else if (top === '[') trimmed += ']';
  }

  return trimmed;
}

/** JSON.parse بعد استخراج الـ JSON وإصلاح هروب LaTeX — لكل رد نموذج فيه معادلات */
export function parseModelJson<T>(text: string): T {
  const extracted = extractJsonFromText(text);
  const repaired = repairLatexEscapes(extracted);
  try {
    return JSON.parse(repaired) as T;
  } catch (initialErr) {
    try {
      const fixed = repairTruncatedJson(repaired);
      return JSON.parse(fixed) as T;
    } catch {
      throw initialErr;
    }
  }
}
