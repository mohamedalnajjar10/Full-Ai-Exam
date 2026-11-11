"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Flag,
  LogOut,
  Save,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import type {
  AssessmentQuestionPublic,
  AssessmentQuestionDetail,
  SubmitAssessmentResponse,
} from "@ai-exam/types";
import { Button } from "@/components/ui/Button";
import RichText from "@/components/ui/RichText";
import OfflineBanner from "@/components/ui/OfflineBanner";
import AiAssessmentLoader from "./AiAssessmentLoader";
import {
  BLOOM_LABELS,
  BLOOM_BADGE_STYLES,
  getStoredAssessmentDraft,
  setStoredAssessmentDraft,
  clearStoredAssessmentAnswers,
} from "@/lib/assessment";
import { formatDuration } from "@/lib/quiz";
import { submitAssessmentAttempt, describeError } from "@/lib/api";

interface AssessmentRunnerProps {
  attemptId: string;
  subjectName: string;
  difficultyLevel: string;
  questions: (AssessmentQuestionPublic | AssessmentQuestionDetail)[];
  onCompleted: (result: SubmitAssessmentResponse) => void;
}

export default function AssessmentRunner({
  attemptId,
  subjectName,
  difficultyLevel,
  questions,
  onCompleted,
}: AssessmentRunnerProps) {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [elapsed, setElapsed] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<"submit" | "exit" | null>(null);

  const startedAt = useRef(Date.now());

  // استرجاع الإجابات والمسودة المحفوظة محلياً عند البدء
  useEffect(() => {
    const draft = getStoredAssessmentDraft(attemptId);
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
  }, [attemptId, questions.length]);

  // حفظ التغييرات تلقائياً في المسودة المحلية للحماية من انقطاع الإنترنت أو إعادة التحميل
  useEffect(() => {
    if (!attemptId || !startedAt.current) return;
    setStoredAssessmentDraft(attemptId, {
      answers,
      current,
      startedAt: startedAt.current,
    });
  }, [attemptId, answers, current]);

  // عداد الوقت المنقضي
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const question = questions[current];
  const total = questions.length;
  const answeredCount = Object.values(answers).filter((a) => Boolean(a && a.trim())).length;
  const unansweredCount = total - answeredCount;
  const isLast = current === total - 1;

  // اختيار إجابة وحفظها في التخزين المحلي
  function chooseOption(label: string) {
    if (!question) return;
    setAnswers((prev) => ({ ...prev, [question.id]: label }));
  }

  // إرسال الإجابات والتسليم
  async function handleSubmit() {
    setConfirmModal(null);
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payloadAnswers = questions
        .map((q) => ({ questionId: q.id, answer: answers[q.id]?.trim() ?? "" }))
        .filter((a) => a.answer.length > 0);

      const res = await submitAssessmentAttempt(attemptId, {
        answers: payloadAnswers,
      });

      // مسح الإجابات المحلية بنجاح التسليم
      clearStoredAssessmentAnswers(attemptId);
      onCompleted(res);
    } catch (err) {
      setIsSubmitting(false);
      setSubmitError(describeError(err));
    }
  }

  // اختصارات لوحة المفاتيح: 1-4 أو a-d للاختيار، الأسهم للتنقل
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (confirmModal || isSubmitting) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const idx1234 = "1234".indexOf(e.key);
      const idxAbcd = "abcd".indexOf(e.key.toLowerCase());
      const selectedIndex = idx1234 >= 0 ? idx1234 : idxAbcd;

      if (question && selectedIndex >= 0 && question.options[selectedIndex]) {
        chooseOption(question.options[selectedIndex].label);
      } else if (e.key === "ArrowLeft") {
        setCurrent((c) => Math.min(total - 1, c + 1));
      } else if (e.key === "ArrowRight") {
        setCurrent((c) => Math.max(0, c - 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [question, total, confirmModal, isSubmitting]);

  if (isSubmitting) {
    return <AiAssessmentLoader mode="submit" subjectName={subjectName} />;
  }

  if (!question) {
    return (
      <div className="rounded-2xl border border-line bg-white p-8 text-center">
        <p className="text-muted">تعذر تحميل بيانات السؤال.</p>
      </div>
    );
  }

  const bloomInfo = BLOOM_LABELS[question.bloomTaxonomyLevel];
  const bloomStyle = BLOOM_BADGE_STYLES[question.bloomTaxonomyLevel] || {
    bg: "bg-navy-50",
    text: "text-navy-800",
    border: "border-navy-200",
    dot: "bg-navy-600",
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <OfflineBanner />

      {/* شريط التركيز العلوي (Focus Header) */}
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-white px-5 py-3.5 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setConfirmModal("exit")}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-canvas hover:text-navy-900"
          >
            <Save size={14} />
            حفظ ومغادرة
          </button>
          <div className="h-4 w-px bg-line" />
          <span className="font-bold text-sm text-navy-900">{subjectName}</span>
          <span className="hidden rounded-full bg-navy-50 px-2.5 py-0.5 text-xs text-navy-800 sm:inline">
            تقييم القدرات
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-navy-900">
            <Clock size={15} className="text-muted" />
            <span className="tabular font-bold" dir="ltr">
              {formatDuration(elapsed)}
            </span>
          </div>
          <div className="h-4 w-px bg-line" />
          <span className="text-xs text-muted">
            تمت الإجابة: <b className="font-bold text-teal-700 tabular">{answeredCount}</b>/{total}
          </span>
        </div>
      </header>

      {submitError && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-rose-600" />
            <span>{submitError} — إجاباتك محفوظة بأمان على جهازك، يمكنك إعادة التسليم فور استقرار الشبكة.</span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="danger"
            onClick={handleSubmit}
            className="w-full sm:w-auto shrink-0"
          >
            إعادة المحاولة الآن
          </Button>
        </div>
      )}

      {/* تخطيط السؤال ومصفوفة التنقل */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* بطاقة السؤال الأساسية */}
        <div className="flex flex-col gap-4">
          <div className="rounded-3xl border border-line bg-white p-6 shadow-raised sm:p-9">
            {/* مؤشر السؤال + وسم تصنيف بلوم */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-muted">
                السؤال <b className="font-bold text-navy-900 tabular text-sm">{current + 1}</b> من{" "}
                <span className="tabular">{total}</span>
              </span>

              {bloomInfo && (
                <div
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${bloomStyle.border} ${bloomStyle.bg} ${bloomStyle.text}`}
                  title={bloomInfo.desc}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${bloomStyle.dot}`} />
                  مستوى بلوم: {bloomInfo.name} ({bloomInfo.enName})
                </div>
              )}
            </div>

            {/* شريط التقدّم */}
            <div
              className="mb-8 h-2 overflow-hidden rounded-full bg-canvas"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={total}
              aria-valuenow={current + 1}
            >
              <div
                className="h-full rounded-full bg-teal-600 transition-all duration-300"
                style={{ width: `${((current + 1) / total) * 100}%` }}
              />
            </div>

            {/* نص السؤال ومعادلات KaTeX */}
            <h2 className="text-lg font-bold leading-9 text-navy-900 sm:text-xl sm:leading-10">
              <RichText text={question.questionText} />
            </h2>

            {/* الخيارات */}
            <div role="radiogroup" aria-label="خيارات الإجابة" className="mt-8 grid gap-3">
              {question.options.map((choice) => {
                const selected = answers[question.id] === choice.label;
                return (
                  <button
                    key={`${question.id}-${choice.label}`}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => chooseOption(choice.label)}
                    className={`group flex w-full items-center gap-4 rounded-2xl border p-4 text-start transition-all ${
                      selected
                        ? "border-teal-600 bg-teal-50/70 shadow-[0_0_0_1.5px_var(--color-teal-600)]"
                        : "border-line bg-white hover:border-navy-300 hover:bg-canvas/50"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
                        selected
                          ? "bg-teal-600 text-white shadow-sm"
                          : "bg-canvas text-muted group-hover:bg-navy-50 group-hover:text-navy-900"
                      }`}
                    >
                      {choice.label}
                    </span>
                    <div className="flex-1 text-[15px] leading-7 text-ink">
                      <RichText text={choice.text} />
                    </div>
                  </button>
                );
              })}
            </div>

            {/* شريط الإجراءات السفلي (التالي / السابق / تسليم) */}
            <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6">
              <Button
                variant="secondary"
                onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                disabled={current === 0}
                className="gap-2"
              >
                <ChevronRight size={17} />
                السابق
              </Button>

              {isLast ? (
                <Button
                  variant="accent"
                  onClick={() => setConfirmModal("submit")}
                  className="gap-2 font-bold px-6"
                >
                  <Flag size={16} />
                  تسليم التقييم وإنهاء
                </Button>
              ) : (
                <Button onClick={() => setCurrent((c) => c + 1)} className="gap-2">
                  التالي
                  <ChevronLeft size={17} />
                </Button>
              )}
            </div>
          </div>

          <p className="hidden text-center text-xs text-subtle sm:block">
            اختصارات: الأرقام 1–4 أو A–D لاختيار الإجابة · الأسهم للتنقل بين الأسئلة
          </p>
        </div>

        {/* العمود الجانبي (مصفوفة الانتقال السريع والمعلومات) */}
        <aside className="flex flex-col gap-4">
          <div className="rounded-3xl border border-line bg-white p-5 shadow-card">
            <h3 className="mb-3 text-xs font-bold text-navy-900">الانتقال السريع للأسئلة</h3>

            <div className="grid grid-cols-5 gap-2">
              {questions.map((q, idx) => {
                const isAnswered = Boolean(answers[q.id]);
                const isCurrent = idx === current;

                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setCurrent(idx)}
                    aria-label={`السؤال ${idx + 1}`}
                    className={`flex h-10 items-center justify-center rounded-xl text-xs font-bold tabular transition-all ${
                      isCurrent
                        ? "bg-navy-900 text-white shadow-sm ring-2 ring-navy-900/20"
                        : isAnswered
                          ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-700/20"
                          : "bg-canvas text-subtle hover:bg-navy-50 hover:text-navy-900"
                    }`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-line pt-3 text-[11px] text-muted">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-teal-600" />
                <span>تمت الإجابة ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-navy-200" />
                <span>متبقي ({unansweredCount})</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setConfirmModal("submit")}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-50 p-3.5 text-xs font-bold text-teal-800 transition-colors hover:bg-teal-100"
          >
            <Flag size={15} />
            إنهاء وتسليم الاختبار
          </button>
        </aside>
      </div>

      {/* النوافذ التأكيدية المنبثقة */}
      {confirmModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/40 p-4 backdrop-blur-[2px]"
          onClick={() => setConfirmModal(null)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md animate-toast-in rounded-3xl bg-white p-6 shadow-float sm:p-8"
          >
            {confirmModal === "exit" ? (
              <>
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-navy-50 text-navy-800">
                  <Save size={24} />
                </div>
                <h3 className="text-lg font-bold text-navy-900">حفظ ومغادرة التقييم؟</h3>
                <p className="mt-2 text-sm leading-7 text-muted">
                  تم حفظ إجاباتك الحالية على هذا الجهاز وستبقى المحاولة بحالة <b>قيد الحل (معلّق)</b>. يمكنك العودة
                  واستئناف الاختبار في أي وقت من هذا الجهاز عبر لوحة التحكم أو مركز التقييم.
                </p>
                <div className="mt-6 flex gap-3">
                  <Button
                    variant="primary"
                    onClick={() => router.push("/assessments")}
                    className="flex-1"
                  >
                    تأكيد الخروج
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmModal(null)}
                    className="flex-1"
                  >
                    متابعة الحل
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-2xl ${
                    unansweredCount > 0
                      ? "bg-amber-50 text-amber-700"
                      : "bg-teal-50 text-teal-700"
                  }`}
                >
                  {unansweredCount > 0 ? <AlertCircle size={24} /> : <CheckCircle2 size={24} />}
                </div>

                <h3 className="text-lg font-bold text-navy-900">
                  {unansweredCount > 0
                    ? "تنبيه: لم تجب على جميع الأسئلة!"
                    : "تأكيد تسليم اختبار التقييم"}
                </h3>

                <p className="mt-2 text-sm leading-7 text-muted">
                  {unansweredCount > 0
                    ? `لديك ${unansweredCount} سؤال بدون إجابة. سيتم احتساب الأسئلة المتروكة كإجابات خاطئة وسيقوم الذكاء الاصطناعي برصدها كفجوات تعلم. هل ترغب بالتسليم الآن؟`
                    : "أحسنت! أكملت الإجابة على جميع الأسئلة العشرة. سيقوم الذكاء الاصطناعي الآن بتدقيق الإجابات وإعداد تقريرك التشخيصي."}
                </p>

                <div className="mt-6 flex gap-3">
                  <Button
                    variant="accent"
                    onClick={handleSubmit}
                    className="flex-1 font-bold"
                  >
                    تأكيد التسليم والتحليل
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmModal(null)}
                    className="flex-1"
                  >
                    مراجعة الأسئلة
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
