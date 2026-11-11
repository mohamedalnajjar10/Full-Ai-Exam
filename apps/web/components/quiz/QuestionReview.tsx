import { Check, Lightbulb, MinusCircle, X } from "lucide-react";
import type { GeneratedQuestion } from "@/lib/api";
import RichText from "@/components/ui/RichText";

// مراجعة سؤال بعد انتهاء الكويز: الإجابة الصحيحة + إجابة الطالب + الشرح
export default function QuestionReview({
  question,
  index,
  selected,
}: {
  question: GeneratedQuestion;
  index: number;
  selected: string | null;
}) {
  const isCorrect = selected === question.correctAnswer;
  const status = selected == null ? "skipped" : isCorrect ? "correct" : "wrong";
  const statusLabel = status === "correct" ? "إجابة صحيحة" : status === "wrong" ? "إجابة خاطئة" : "بدون إجابة";

  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            status === "correct" ? "bg-teal-50 text-teal-700" : status === "wrong" ? "bg-rose-50 text-rose-600" : "bg-canvas text-muted"
          }`}
          aria-label={statusLabel}
        >
          {status === "correct" ? <Check size={16} strokeWidth={2.5} /> : status === "wrong" ? <X size={16} strokeWidth={2.5} /> : <MinusCircle size={16} />}
        </span>
        <div className="flex-1">
          <p className="mb-1 text-xs font-medium text-subtle">
            السؤال {index + 1} · {statusLabel}
          </p>
          <h4 className="text-[15px] font-semibold leading-7 text-navy-900">
            <RichText text={question.questionText} />
          </h4>
        </div>
      </header>

      <ul className="grid gap-2 sm:grid-cols-2">
        {question.choices.map((choice) => {
          const correct = choice.label === question.correctAnswer;
          const picked = choice.label === selected;
          return (
            <li
              key={choice.label}
              className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm ${
                correct ? "border-teal-200 bg-teal-50 text-teal-900" : picked ? "border-rose-200 bg-rose-50 text-rose-900" : "border-line text-ink"
              }`}
            >
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                  correct ? "bg-teal-600 text-white" : picked ? "bg-rose-500 text-white" : "bg-canvas text-muted"
                }`}
              >
                {choice.label}
              </span>
              <RichText text={choice.text} className="flex-1 leading-6" />
              {picked && <span className="shrink-0 text-[11px] font-medium opacity-70">إجابتك</span>}
            </li>
          );
        })}
      </ul>

      {question.explanation && (
        <div className="mt-4 flex gap-2.5 rounded-xl bg-gold-50 p-3.5 text-sm leading-7 text-ink">
          <Lightbulb size={17} className="mt-1 shrink-0 text-gold-600" />
          <RichText text={question.explanation} className="flex-1" />
        </div>
      )}
    </article>
  );
}
