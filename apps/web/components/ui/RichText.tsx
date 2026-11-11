import katex from "katex";
import "katex/contrib/mhchem";
import "katex/dist/katex.min.css";
import { parseRichText, wrapArabicInMath, type Inline } from "@/lib/richText";

/*
 * عرض موحّد لمحتوى المواد كلها: أسئلة، خيارات، شروحات، ردود المساعد،
 * مقاطع الكتب. المعادلات بـ KaTeX (والكيمياء \ce{…})، الآيات بخط المصحف،
 * والنص المشكول بخط نسخ. التفاصيل بـ lib/richText.
 *
 * بدون hooks حتى يشتغل بمكونات السيرفر والعميل.
 */

// KaTeX أسرع من إنه يحتاج useMemo، بس QuizPlayer بيعيد الرسم كل ثانية
// (العدّاد)، فمنخزّن الناتج. السقف بيمنع الذاكرة تكبر بجلسة طويلة.
const cache = new Map<string, string>();
const CACHE_LIMIT = 500;

function renderMath(tex: string, displayMode: boolean): string {
  const key = `${displayMode ? "D" : "I"}${tex}`;
  let html = cache.get(key);
  if (html === undefined) {
    html = katex.renderToString(wrapArabicInMath(tex), {
      displayMode,
      // معادلة غلط من النموذج بتنعرض مصدرها بالأحمر بدل ما توقع الصفحة
      throwOnError: false,
      strict: "ignore",
      trust: false,
      maxExpand: 500,
    });
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, html);
  }
  return html;
}

function InlineNode({ node }: { node: Inline }) {
  switch (node.kind) {
    case "math":
      // bdi بيعزل المعادلة: بدونه رموزها اللاتينية بتنخلط باتجاه النص العربي حولها
      return <bdi dir="ltr" className="rich-math" dangerouslySetInnerHTML={{ __html: renderMath(node.tex, false) }} />;
    case "quran":
      return (
        <span lang="ar" dir="rtl" className="font-quran text-[1.18em] leading-[2.4]">
          {node.text}
        </span>
      );
    case "text": {
      const cls = node.diacritized ? "font-naskh text-[1.08em] leading-[2.1]" : undefined;
      return node.bold ? (
        <strong className={`font-semibold ${cls ?? ""}`}>{node.text}</strong>
      ) : cls ? (
        <span className={cls}>{node.text}</span>
      ) : (
        node.text
      );
    }
  }
}

export default function RichText({
  text,
  className = "",
  inline = false,
}: {
  text: string;
  className?: string;
  /** سطر واحد (معاينات مقصوصة بـ line-clamp): الفقرات بتنضم بمسافة والمعادلات الكبيرة بتصير مضمّنة */
  inline?: boolean;
}) {
  const blocks = parseRichText(text);

  if (inline) {
    return (
      <span className={className} dir={blocks.find((b) => b.kind === "para")?.dir}>
        {blocks.map((b, i) => (
          <span key={i}>
            {i > 0 && " "}
            {b.kind === "math" ? (
              <bdi dir="ltr" className="rich-math" dangerouslySetInnerHTML={{ __html: renderMath(b.tex, false) }} />
            ) : (
              b.inlines.map((n, j) => <InlineNode key={j} node={n} />)
            )}
          </span>
        ))}
      </span>
    );
  }

  // spans مش divs: المكوّن بينحط جوا <button> و<h2> وما بيصير فيهم عناصر كتلية
  return (
    <span className={`block break-words ${className}`}>
      {blocks.map((b, i) =>
        b.kind === "math" ? (
          <span
            key={i}
            dir="ltr"
            className="rich-math-block my-2 block overflow-x-auto overflow-y-hidden"
            dangerouslySetInnerHTML={{ __html: renderMath(b.tex, true) }}
          />
        ) : b.inlines.length ? (
          <span key={i} dir={b.dir} className="block">
            {b.inlines.map((n, j) => (
              <InlineNode key={j} node={n} />
            ))}
          </span>
        ) : (
          // سطر فاضي بالنص الأصلي = مسافة بين فقرتين
          <span key={i} className="block h-[0.6em]" aria-hidden />
        ),
      )}
    </span>
  );
}
