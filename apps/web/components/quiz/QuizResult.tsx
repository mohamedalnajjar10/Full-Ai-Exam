"use client";
import { useState } from "react";
import { Archive, CheckCircle2, Clock, MinusCircle, RotateCcw, Sparkles, XCircle } from "lucide-react";
import ScoreRing from "./ScoreRing";
import QuestionReview from "./QuestionReview";
import { Button, ButtonLink } from "@/components/ui/Button";
import { formatDuration, scorePercent, type QuizAttempt } from "@/lib/quiz";

export default function QuizResult({
  attempt,
  onRetake,
  onNewQuiz,
}: {
  attempt: QuizAttempt;
  onRetake?: () => void;
  onNewQuiz?: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "wrong">("all");
  const percent = scorePercent(attempt);
  const skipped = attempt.questions.filter((q) => !attempt.answers[q.id]).length;
  const wrong = attempt.total - attempt.correct - skipped;

  const visible = attempt.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q }) => filter === "all" || attempt.answers[q.id] !== q.correctAnswer);

  const message =
    percent >= 85
      ? "أداء رائع! أنت جاهز لمستوى أعلى."
      : percent >= 70
        ? "عمل جيد جداً — راجع الأخطاء القليلة وستصل للقمة."
        : percent >= 50
          ? "بداية جيدة. ركّز على الشروحات أدناه لتحسين نتيجتك."
          : "لا بأس، كل محاولة خطوة للأمام. راجع الشروحات وأعد المحاولة.";

  const tiles = [
    { icon: CheckCircle2, label: "صحيحة", value: attempt.correct, cls: "text-teal-700 bg-teal-50" },
    { icon: XCircle, label: "خاطئة", value: wrong, cls: "text-rose-600 bg-rose-50" },
    { icon: MinusCircle, label: "بدون إجابة", value: skipped, cls: "text-muted bg-canvas" },
    { icon: Clock, label: "المدة", value: formatDuration(attempt.durationSec), cls: "text-navy-900 bg-navy-50" },
  ];

  return (
    <div className="mx-auto max-w-4xl">
      <section className="rounded-2xl border border-line bg-white p-6 shadow-raised sm:p-10">
        <div className="flex flex-col items-center gap-8 md:flex-row">
          <ScoreRing percent={percent} size={168} stroke={14} />
          <div className="flex-1 text-center md:text-start">
            <p className="text-sm font-medium text-muted">{attempt.subjectName}</p>
            <h2 className="mt-1 text-2xl font-bold text-navy-900">
              أجبت بشكل صحيح على {attempt.correct} من {attempt.total}
            </h2>
            <p className="mt-2 text-muted">{message}</p>

            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {tiles.map(({ icon: Icon, label, value, cls }) => (
                <div key={label} className="rounded-xl border border-line p-3 text-center">
                  <span className={`mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded-lg ${cls}`}>
                    <Icon size={16} />
                  </span>
                  <dd className="text-lg font-bold text-navy-900 tabular" dir="ltr">
                    {value}
                  </dd>
                  <dt className="text-xs text-muted">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3 border-t border-line pt-6 md:justify-start">
          {onRetake && (
            <Button onClick={onRetake}>
              <RotateCcw size={16} />
              أعد نفس الأسئلة
            </Button>
          )}
          {onNewQuiz && (
            <Button variant="accent" onClick={onNewQuiz}>
              <Sparkles size={16} />
              كويز جديد
            </Button>
          )}
          <ButtonLink href="/exams/archive" variant="secondary">
            <Archive size={16} />
            أرشيف الاختبارات
          </ButtonLink>
        </div>
      </section>

      <section className="mt-10">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-navy-900">مراجعة الإجابات</h3>
          <div role="tablist" aria-label="تصفية الأسئلة" className="flex rounded-xl border border-line bg-white p-1">
            {(
              [
                ["all", `الكل (${attempt.total})`],
                ["wrong", `الأخطاء (${attempt.total - attempt.correct})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                onClick={() => setFilter(key)}
                className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                  filter === key ? "bg-navy-900 text-white" : "text-muted hover:text-navy-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center font-medium text-teal-800">لا توجد أخطاء — كل إجاباتك صحيحة!</p>
        ) : (
          <div className="flex flex-col gap-4">
            {visible.map(({ q, i }) => (
              <QuestionReview key={q.id} question={q} index={i} selected={attempt.answers[q.id] ?? null} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
