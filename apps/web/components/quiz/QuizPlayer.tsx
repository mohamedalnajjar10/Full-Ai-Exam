"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Flag, LogOut } from "lucide-react";
import type { GeneratedQuestion } from "@/lib/api";
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_STYLES,
  formatDuration,
  getStoredQuizDraft,
  setStoredQuizDraft,
  clearStoredQuizDraft,
  type QuizAttempt,
} from "@/lib/quiz";
import { Button } from "@/components/ui/Button";
import RichText from "@/components/ui/RichText";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { QUESTIONS, countAr } from "@/lib/plural";

export default function QuizPlayer({
  questions,
  subjectName,
  difficulty,
  onFinish,
  onExit,
}: {
  questions: GeneratedQuestion[];
  subjectName: string;
  difficulty: QuizAttempt["difficulty"];
  onFinish: (result: { answers: Record<string, string | null>; durationSec: number }) => void;
  onExit: () => void;
}) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [elapsed, setElapsed] = useState(0);
  const [confirm, setConfirm] = useState<"finish" | "exit" | null>(null);
  const startedAt = useRef(0);

  const quizKey = useMemo(() => {
    return questions.map((q, i) => q.id || `q-${i}`).slice(0, 5).join("_");
  }, [questions]);

  useEffect(() => {
    startedAt.current = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // استرجاع المسودة المؤقتة في حال انقطاع الاتصال أو تحديث الصفحة
  useEffect(() => {
    if (!quizKey) return;
    const draft = getStoredQuizDraft(quizKey);
    if (draft) {
      if (draft.answers && Object.keys(draft.answers).length > 0) {
        setAnswers(draft.answers);
      }
      if (typeof draft.current === "number" && draft.current >= 0 && draft.current < questions.length) {
        setCurrent(draft.current);
      }
      if (draft.startedAt) {
        startedAt.current = draft.startedAt;
      }
    }
  }, [quizKey, questions.length]);

  // حفظ التغييرات تلقائياً في المسودة المحلية للحماية من انقطاع الشبكة
  useEffect(() => {
    if (!quizKey || !startedAt.current) return;
    setStoredQuizDraft(quizKey, {
      answers,
      current,
      startedAt: startedAt.current,
    });
  }, [quizKey, answers, current]);

  const question = questions[current];
  const answeredCount = questions.filter((q) => answers[q.id]).length;
  const isLast = current === questions.length - 1;

  function choose(label: string) {
    setAnswers((prev) => ({ ...prev, [question.id]: label }));
  }

  function finish() {
    clearStoredQuizDraft(quizKey);
    const full: Record<string, string | null> = {};
    for (const q of questions) full[q.id] = answers[q.id] ?? null;
    onFinish({ answers: full, durationSec: Math.floor((Date.now() - startedAt.current) / 1000) });
  }

  function handleExit() {
    clearStoredQuizDraft(quizKey);
    onExit();
  }

  // اختصارات لوحة المفاتيح: 1-4 أو A-D للاختيار، الأسهم للتنقل
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (confirm) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      if (idx >= 0 && question.choices[idx]) {
        setAnswers((prev) => ({ ...prev, [question.id]: question.choices[idx].label }));
      } else if (e.key === "ArrowLeft") {
        setCurrent((c) => Math.min(questions.length - 1, c + 1));
      } else if (e.key === "ArrowRight") {
        setCurrent((c) => Math.max(0, c - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question, questions.length, confirm]);

  const unanswered = questions.length - answeredCount;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <OfflineBanner />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* بطاقة السؤال */}
        <div className="order-2 lg:order-1">
          <div className="rounded-2xl border border-line bg-white p-5 shadow-raised sm:p-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-navy-50 px-2.5 py-1 text-xs font-medium text-navy-800">{subjectName}</span>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${DIFFICULTY_STYLES[difficulty]}`}>
                {DIFFICULTY_LABELS[difficulty]}
              </span>
            </div>
            <span className="text-sm text-muted">
              السؤال <b className="font-semibold text-navy-900 tabular">{current + 1}</b> من <span className="tabular">{questions.length}</span>
            </span>
          </div>

          <div
            className="mb-7 h-1.5 overflow-hidden rounded-full bg-canvas"
            role="progressbar"
            aria-label="التقدّم في الكويز"
            aria-valuemin={1}
            aria-valuemax={questions.length}
            aria-valuenow={current + 1}
          >
            <div className="h-full rounded-full bg-teal-600 transition-[width] duration-500" style={{ width: `${((current + 1) / questions.length) * 100}%` }} />
          </div>

          <h2 key={question.id || `q-head-${current}`} className="animate-toast-in text-lg font-semibold leading-8 text-navy-900 sm:text-xl sm:leading-9">
            <RichText text={question.questionText} />
          </h2>

          <div role="radiogroup" aria-label="الخيارات" className="mt-7 grid gap-3">
            {question.choices.map((choice, i) => {
              const selected = answers[question.id] === choice.label;
              const choiceKey = `choice-${question.id || current}-${choice.label || i}-${i}`;
              return (
                <button
                  key={choiceKey}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => choose(choice.label)}
                  style={{ animationDelay: `${i * 40}ms` }}
                  className={`group flex w-full animate-toast-in items-center gap-4 rounded-xl border px-4 py-3.5 text-start transition-[border-color,background-color,box-shadow] [animation-fill-mode:backwards] ${
                    selected
                      ? "border-teal-600 bg-teal-50/60 shadow-[0_0_0_1px_var(--color-teal-600)]"
                      : "border-line bg-white hover:border-navy-200 hover:bg-canvas/60"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold transition-colors ${
                      selected ? "bg-teal-600 text-white" : "bg-canvas text-muted group-hover:text-navy-900"
                    }`}
                  >
                    {choice.label}
                  </span>
                  <RichText text={choice.text} className="flex-1 text-[15px] leading-7 text-ink" />
                </button>
              );
            })}
          </div>

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-6">
            <Button variant="secondary" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0}>
              <ChevronRight size={17} />
              السابق
            </Button>

            {isLast ? (
              <Button variant="accent" onClick={() => (unanswered > 0 ? setConfirm("finish") : finish())}>
                <Flag size={16} />
                إنهاء وتصحيح
              </Button>
            ) : (
              <Button onClick={() => setCurrent((c) => c + 1)}>
                التالي
                <ChevronLeft size={17} />
              </Button>
            )}
          </div>
        </div>
        <p className="mt-3 hidden text-center text-xs text-subtle sm:block">
          اختصارات: الأرقام 1–4 للاختيار، والأسهم للتنقل بين الأسئلة
        </p>
      </div>

      {/* اللوحة الجانبية */}
      <aside className="order-1 flex flex-col gap-4 lg:order-2">
        <div className="flex items-center justify-between rounded-2xl border border-line bg-white p-4 shadow-card lg:flex-col lg:items-stretch lg:gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-50 text-navy-900">
              <Clock size={19} strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-xs text-muted">الوقت المنقضي</p>
              <p className="text-lg font-bold text-navy-900 tabular" dir="ltr">
                {formatDuration(elapsed)}
              </p>
            </div>
          </div>
          <div className="text-end lg:text-start">
            <p className="text-xs text-muted">تمت الإجابة</p>
            <p className="text-lg font-bold text-teal-700 tabular">
              {answeredCount}/{questions.length}
            </p>
          </div>
        </div>

        <div className="hidden rounded-2xl border border-line bg-white p-4 shadow-card lg:block">
          <p className="mb-3 text-xs font-semibold text-muted">الانتقال السريع</p>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((q, i) => (
              <button
                key={q.id || `qnav-btn-${i}`}
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`السؤال ${i + 1}${answers[q.id] ? " (مُجاب)" : ""}`}
                aria-current={i === current ? "step" : undefined}
                className={`h-9 rounded-lg text-sm font-semibold tabular transition-colors ${
                  i === current
                    ? "bg-navy-900 text-white"
                    : answers[q.id]
                      ? "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-700/15"
                      : "bg-canvas text-subtle hover:bg-navy-50"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => (answeredCount > 0 ? setConfirm("exit") : handleExit())}
          className="hidden items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-muted transition-colors hover:bg-rose-50 hover:text-rose-600 lg:flex"
        >
          <LogOut size={15} />
          الخروج من الكويز
        </button>
      </aside>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-[2px]" onClick={() => setConfirm(null)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="quiz-confirm-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm animate-toast-in rounded-2xl bg-white p-6 shadow-float"
          >
            <span className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${confirm === "exit" ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"}`}>
              {confirm === "exit" ? <LogOut size={22} /> : <Flag size={22} />}
            </span>
            <h3 id="quiz-confirm-title" className="text-lg font-semibold text-navy-900">
              {confirm === "exit" ? "الخروج من الكويز؟" : "لم تجب على كل الأسئلة"}
            </h3>
            <p className="mt-2 text-sm leading-7 text-muted">
              {confirm === "exit"
                ? "لن تُحفظ إجاباتك في هذه المحاولة."
                : `بقي ${countAr(unanswered, QUESTIONS)} بدون إجابة وستُحتسب خاطئة. هل تريد الإنهاء؟`}
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant={confirm === "exit" ? "danger" : "primary"} onClick={confirm === "exit" ? handleExit : finish} className="flex-1">
                {confirm === "exit" ? "خروج" : "إنهاء الآن"}
              </Button>
              <Button variant="secondary" onClick={() => setConfirm(null)} className="flex-1" autoFocus>
                متابعة الحل
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  </div>
  );
}
