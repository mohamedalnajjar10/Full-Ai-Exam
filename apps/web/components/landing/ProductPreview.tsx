import { Check, CheckCircle2, Lightbulb, Timer } from "lucide-react";

/**
 * معاينة حقيقية الشكل للمنتج — نفس عناصر شاشة الكويز وخطة اليوم.
 * HTML وCSS بس: ولا صورة ولا فيديو، فبتنرسم مع الصفحة وبتضل حادة.
 * السؤال محلول صح: ط.ح = ½ × 2 × 3² = 9 جول.
 */
const CHOICES = [
  { label: "أ", text: "3 جول" },
  { label: "ب", text: "6 جول" },
  { label: "ج", text: "9 جول", correct: true },
  { label: "د", text: "18 جول" },
];

export default function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] select-none" aria-hidden>
      {/* بطاقة السؤال */}
      <div className="relative rounded-2xl border border-line bg-white p-5 shadow-float sm:p-6">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-800">الفيزياء</span>
          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">متوسط</span>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-xs font-medium text-muted">السؤال 3 من 10</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
            <div className="h-full w-[30%] rounded-full bg-teal-600" />
          </div>
          <span className="flex items-center gap-1 text-xs text-muted">
            <Timer size={13} />
            <span className="tabular" dir="ltr">04:12</span>
          </span>
        </div>

        <p className="mt-5 text-[17px] font-semibold leading-8 text-navy-900">
          جسم كتلته 2 كغ يتحرك بسرعة 3 م/ث. ما مقدار طاقته الحركية؟
        </p>

        <ul className="mt-4 grid gap-2.5">
          {CHOICES.map((c) => (
            <li
              key={c.label}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${
                c.correct ? "border-teal-600 bg-teal-50 text-teal-900" : "border-line text-ink"
              }`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold ${
                  c.correct ? "bg-teal-600 text-white" : "bg-canvas text-muted"
                }`}
              >
                {c.correct ? <Check size={14} strokeWidth={3} /> : c.label}
              </span>
              <span className="flex-1">{c.text}</span>
              {c.correct && <span className="text-xs font-semibold text-teal-700">إجابة صحيحة</span>}
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2.5 rounded-xl bg-gold-50 p-3 text-[13px] leading-6 text-ink">
          <Lightbulb size={16} className="mt-0.5 shrink-0 text-gold-600" />
          <p>
            ط.ح = ½ ك ع² = ½ × 2 × 3² = <b className="font-semibold">9 جول</b>
          </p>
        </div>
      </div>

      {/* المعدل */}
      <div className="absolute -end-4 -top-10 hidden rounded-2xl border border-line bg-white p-3.5 shadow-raised sm:flex sm:items-center sm:gap-3 lg:-end-10">
        <svg width="44" height="44" viewBox="0 0 44 44" className="-rotate-90">
          <circle cx="22" cy="22" r="18" fill="none" strokeWidth="5" className="stroke-canvas" />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={113.1}
            strokeDashoffset={113.1 * 0.14}
            className="stroke-teal-600"
          />
        </svg>
        <div>
          <p className="text-lg font-bold leading-none text-navy-900 tabular">86%</p>
          <p className="mt-1 text-xs text-muted">معدلك هذا الأسبوع</p>
        </div>
      </div>

      {/* خطة اليوم */}
      <div className="absolute -bottom-10 -end-3 hidden w-56 rounded-2xl border border-line bg-white p-4 shadow-raised sm:block lg:-end-8">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-navy-900">خطة اليوم</p>
          <span className="text-xs text-muted tabular">2/3</span>
        </div>
        <ul className="mt-3 flex flex-col gap-2 text-[13px]">
          {[
            { t: "كويز الفيزياء", done: true },
            { t: "مراجعة الأخطاء", done: true },
            { t: "25 دقيقة قراءة", done: false },
          ].map((x) => (
            <li key={x.t} className="flex items-center gap-2">
              {x.done ? (
                <CheckCircle2 size={16} className="text-teal-600" />
              ) : (
                <span className="h-4 w-4 rounded-full border-2 border-navy-200" />
              )}
              <span className={x.done ? "text-muted line-through" : "text-ink"}>{x.t}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
