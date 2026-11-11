"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Check, CheckCircle2, Lightbulb, Loader2, Sparkles, Wand2 } from "lucide-react";
import { describeError, generateQuestions, ApiError, notifyQuotaChanged, type Difficulty, type GeneratedQuestion } from "@/lib/api";
import { fetchWithAuth } from "@/lib/apiClient";
import {
  DIFFICULTY_LABELS,
  formatDate,
  scorePercent,
  scoreTone,
  takeQuizHandoff,
  useQuizHistory,
  queuePendingQuizSubmission,
  type QuizAttempt,
} from "@/lib/quiz";
import { useBranchSubjects } from "@/lib/subjects";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import Alert from "@/components/ui/Alert";
import SubjectGlyph from "@/components/ui/SubjectGlyph";
import { QUESTIONS, countAr } from "@/lib/plural";
import QuizPlayer from "./QuizPlayer";
import QuizResult from "./QuizResult";
import QuotaCard from "./QuotaCard";
import QuotaExceededModal from "@/components/subscriptions/QuotaExceededModal";

type Stage =
  | { name: "setup" }
  | { name: "generating" }
  | { name: "playing"; quiz: ActiveQuiz; runId: number }
  | { name: "result"; quiz: ActiveQuiz; attempt: QuizAttempt };

interface ActiveQuiz {
  subjectId: string;
  subjectName: string;
  difficulty: QuizAttempt["difficulty"];
  source: QuizAttempt["source"];
  questions: GeneratedQuestion[];
}

const COUNTS = [5, 10, 15, 20];

const DIFFICULTIES: { value: Difficulty; hint: string; dot: string }[] = [
  { value: "EASY", hint: "مراجعة المفاهيم الأساسية", dot: "bg-teal-500" },
  { value: "MEDIUM", hint: "بمستوى امتحان التوجيهي", dot: "bg-amber-500" },
  { value: "HARD", hint: "أسئلة تحليلية للمتفوقين", dot: "bg-rose-500" },
];

const GENERATION_STEPS = [
  {
    title: "تحليل المنهاج والبحث في بنك الأسئلة المعتمد",
    hint: "استرجاع الموضوعات والأسئلة المرجعية لضبط المعايير الوزارية",
  },
  {
    title: "صياغة الأسئلة والبدائل الخاطئة بذكاء",
    hint: "ضبط مستوى الصعوبة وصياغة خيارات مقنعة ومطابقة للنمط الوزاري",
  },
  {
    title: "تدقيق الإجابات النموذجية وإعداد الشروحات",
    hint: "التحقق من صحة مفتاح الإجابة وصياغة شرح توضيحي شامل لكل سؤال",
  },
  {
    title: "تجهيز ورقة الاختبار وبدء الجلسة",
    hint: "اللمسات الأخيرة وتنظيم ترتيب الأسئلة وبدء المؤقت",
  },
];

const LOADING_TIPS = [
  "نبحث في بنك الامتحانات الوزارية عن أسئلة مرجعية…",
  "نصمم أسئلة جديدة بنفس أسلوب امتحانات التوجيهي…",
  "نجهّز الشرح لكل إجابة…",
];

export default function QuizFlow({
  initialSubjectId,
  retakeAttemptId,
  fromHandoff,
}: {
  initialSubjectId?: string | null;
  retakeAttemptId?: string | null;
  fromHandoff?: boolean;
}) {
  const { subjects, isLoading: subjectsLoading, error: subjectsError, branchTitle } = useBranchSubjects();
  const { attempts, saveAttempt } = useQuizHistory();

  const [stage, setStage] = useState<Stage>({ name: "setup" });
  const [subjectId, setSubjectId] = useState<string | null>(initialSubjectId ?? null);
  const [difficulty, setDifficulty] = useState<Difficulty>("MEDIUM");
  const [count, setCount] = useState(10);
  const [error, setError] = useState("");
  const [tip, setTip] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(15);
  const [quotaKey, setQuotaKey] = useState(0);
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaModalMessage, setQuotaModalMessage] = useState<string | undefined>();
  const [quotaModalResetAt, setQuotaModalResetAt] = useState<string | undefined>();
  const runCounter = useRef(0);
  const autoStarted = useRef(false);

  function play(quiz: ActiveQuiz) {
    runCounter.current += 1;
    const normalizedQuiz: ActiveQuiz = {
      ...quiz,
      questions: (quiz.questions || []).map((q, idx) => ({
        ...q,
        id: q.id || `quiz-q-${idx + 1}-${runCounter.current}`,
      })),
    };
    setStage({ name: "playing", quiz: normalizedQuiz, runId: runCounter.current });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // بدء مباشر: أسئلة من المحادثة أو إعادة محاولة من الأرشيف (بدون استهلاك الرصيد)
  useEffect(() => {
    if (autoStarted.current) return;
    let quiz: ActiveQuiz | null = null;
    if (fromHandoff) {
      quiz = takeQuizHandoff();
    } else if (retakeAttemptId) {
      // السجل يُقرأ من التخزين المحلي بعد الـ hydration — ننتظر وصوله
      const old = attempts.find((a) => a.id === retakeAttemptId);
      if (!old) return;
      quiz = { ...old, source: "RETAKE" };
    }
    autoStarted.current = true;
    if (quiz?.questions.length) play(quiz);
  }, [fromHandoff, retakeAttemptId, attempts]);

  useEffect(() => {
    if (stage.name !== "generating") {
      setCurrentStep(0);
      setProgress(15);
      return;
    }
    const id = setInterval(() => setTip((t) => (t + 1) % LOADING_TIPS.length), 2600);

    const t1 = setTimeout(() => {
      setCurrentStep(1);
      setProgress(45);
    }, 1800);

    const t2 = setTimeout(() => {
      setCurrentStep(2);
      setProgress(75);
    }, 3800);

    const t3 = setTimeout(() => {
      setCurrentStep(3);
      setProgress(95);
    }, 6000);

    return () => {
      clearInterval(id);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [stage.name]);

  const selectedSubject = subjects.find((s) => s.id === subjectId);

  async function start() {
    if (!selectedSubject || stage.name !== "setup") return;
    setError("");
    setStage({ name: "generating" });
    try {
      const res = await generateQuestions({ subjectId: selectedSubject.id, difficulty, count });
      if (!res.questions?.length) throw new Error("empty");
      play({
        subjectId: selectedSubject.id,
        subjectName: selectedSubject.name,
        difficulty,
        source: "GENERATED",
        questions: res.questions,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setQuotaModalMessage(err.message);
        setQuotaModalResetAt(err.payload?.resetAt);
        setQuotaModalOpen(true);
      }
      setError(err instanceof Error && err.message === "empty" ? "لم يتم توليد أي أسئلة، حاول مرة أخرى." : describeError(err));
      setStage({ name: "setup" });
    } finally {
      setQuotaKey((k) => k + 1);
    }
  }

  function handleFinish(quiz: ActiveQuiz, answers: Record<string, string | null>, durationSec: number) {
    const correct = quiz.questions.filter((q) => answers[q.id] === q.correctAnswer).length;

    // البحث عن المحاولة السابقة لنفس المادة للمقارنة في حال الإعادة
    const prevAttempt = attempts.find(
      (a) => a.subjectId === quiz.subjectId || a.subjectName === quiz.subjectName,
    );
    const previousScore = prevAttempt ? scorePercent(prevAttempt) : undefined;

    const attempt: QuizAttempt = {
      id: crypto.randomUUID(),
      subjectId: quiz.subjectId,
      subjectName: quiz.subjectName,
      difficulty: quiz.difficulty,
      source: quiz.source,
      questions: quiz.questions,
      answers,
      correct,
      total: quiz.questions.length,
      durationSec,
      finishedAt: new Date().toISOString(),
    };
    saveAttempt(attempt);

    // مزامنة فورية مع السيرفر لبث التحديث لحظياً لداشبورد ولي الأمر وحفظ المحاولة سحابياً
    const cloudPayload = {
      subjectId: quiz.subjectId,
      subjectName: quiz.subjectName,
      correct,
      total: quiz.questions.length,
      durationSec,
      source: quiz.source,
      difficulty: quiz.difficulty,
      previousScore,
      questions: quiz.questions,
      answers,
    };

    fetchWithAuth("/questions/submit-quiz-attempt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cloudPayload),
    }).catch((err) => {
      console.warn("تعذر إرسال نتيجة الكويز للباك إند (تمت إضافتها لطابور المزامنة التلقائية):", err);
      queuePendingQuizSubmission(cloudPayload);
    });

    notifyQuotaChanged({ feature: "quiz" });
    setQuotaKey((k) => k + 1);

    setStage({ name: "result", quiz, attempt });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (stage.name === "playing") {
    const { quiz } = stage;
    return (
      <QuizPlayer
        key={stage.runId}
        questions={quiz.questions}
        subjectName={quiz.subjectName}
        difficulty={quiz.difficulty}
        onFinish={({ answers, durationSec }) => handleFinish(quiz, answers, durationSec)}
        onExit={() => setStage({ name: "setup" })}
      />
    );
  }

  if (stage.name === "result") {
    return (
      <QuizResult
        attempt={stage.attempt}
        onRetake={() => play({ ...stage.quiz, source: "RETAKE" })}
        onNewQuiz={() => {
          notifyQuotaChanged({ feature: "quiz" });
          setQuotaKey((k) => k + 1);
          setStage({ name: "setup" });
        }}
      />
    );
  }

  if (stage.name === "generating") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-line bg-white p-6 sm:p-10 shadow-raised"
      >
        <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-teal-600/15" />
          <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900 text-teal-400 shadow-md">
            <Sparkles size={30} className="animate-pulse" />
          </span>
        </div>

        <h2 className="text-xl font-bold text-navy-900 sm:text-2xl">
          جاري توليد الكويز بواسطة الذكاء الاصطناعي
        </h2>
        <p className="mt-1.5 text-xs text-muted sm:text-sm">
          {selectedSubject?.name} · {DIFFICULTY_LABELS[difficulty]} · {countAr(count, QUESTIONS)}
        </p>

        {/* شريط التقدم المرئي */}
        <div className="mt-6 w-full space-y-1.5">
          <div className="flex justify-between text-xs font-semibold text-navy-800">
            <span>التقدم في المعالجة</span>
            <span dir="ltr">{progress}%</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 p-0.5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-600 to-navy-900 transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* مراحل التوليد بالترتيب */}
        <div className="mt-6 w-full space-y-2.5 rounded-xl border border-line/60 bg-canvas/60 p-4 text-start">
          {GENERATION_STEPS.map((step, idx) => {
            const isDone = currentStep > idx;
            const isCurrent = currentStep === idx;
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 rounded-lg p-2.5 transition-all ${
                  isCurrent
                    ? "bg-white shadow-xs border border-teal-200"
                    : isDone
                      ? "opacity-80"
                      : "opacity-40"
                }`}
              >
                <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {isDone ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                      <Check size={13} strokeWidth={2.5} />
                    </span>
                  ) : isCurrent ? (
                    <Loader2 size={16} className="animate-spin text-teal-600" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-xs font-medium ${
                      isCurrent
                        ? "font-semibold text-navy-900"
                        : isDone
                          ? "text-teal-900 line-through decoration-teal-500/50"
                          : "text-muted"
                    }`}
                  >
                    {step.title}
                  </p>
                  {isCurrent && (
                    <p className="mt-0.5 text-[11px] text-teal-700 animate-fade">
                      {step.hint}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          ⚡ يستغرق التوليد الدقيق بضع ثوانٍ لمطابقة المنهاج الوزاري الفلسطيني وتدقيق مفاتيح الإجابة. يرجى الانتظار دون إغلاق الصفحة.
        </p>
      </div>
    );
  }

  const recent = attempts.slice(0, 4);

  return (
    <>
      <QuotaExceededModal
        isOpen={quotaModalOpen}
        onClose={() => setQuotaModalOpen(false)}
        feature="quiz"
        message={quotaModalMessage}
        resetAt={quotaModalResetAt}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        {error && (
          <Alert
            tone="error"
            action={
              <button type="button" onClick={() => setError("")} className="shrink-0 text-xs font-semibold underline underline-offset-4">
                إخفاء
              </button>
            }
          >
            {error}
          </Alert>
        )}

        <Card>
          <StepTitle step={1} title="اختر المادة" subtitle={branchTitle ? `مواد ${branchTitle}` : undefined} />
          {subjectsLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-[72px] animate-pulse rounded-xl bg-canvas" />
              ))}
            </div>
          ) : subjectsError || subjects.length === 0 ? (
            <p className="rounded-xl bg-canvas p-5 text-center text-sm text-muted">{subjectsError ?? "لا توجد مواد لهذا الفرع حالياً"}</p>
          ) : (
            <div role="radiogroup" aria-label="المادة" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {subjects.map((s) => {
                const active = s.id === subjectId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSubjectId(s.id)}
                    className={`relative flex items-center gap-3 rounded-xl border p-3 text-start transition-[border-color,background-color,box-shadow] ${
                      active ? "border-teal-600 bg-teal-50/50 shadow-[0_0_0_1px_var(--color-teal-600)]" : "border-line hover:border-navy-200 hover:bg-canvas/60"
                    }`}
                  >
                    <SubjectGlyph name={s.name} size="sm" tone={active ? "teal" : "navy"} />
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-5 text-navy-900">{s.name}</span>
                    {active && (
                      <span className="absolute -end-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white ring-2 ring-white">
                        <Check size={11} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <StepTitle step={2} title="حدد المستوى وعدد الأسئلة" />
          <div role="radiogroup" aria-label="مستوى الصعوبة" className="grid gap-3 sm:grid-cols-3">
            {DIFFICULTIES.map((d) => {
              const active = d.value === difficulty;
              return (
                <button
                  key={d.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDifficulty(d.value)}
                  className={`rounded-xl border p-4 text-start transition-[border-color,background-color,box-shadow] ${
                    active ? "border-navy-900 bg-navy-50/60 shadow-[0_0_0_1px_var(--color-navy-900)]" : "border-line hover:border-navy-200"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold text-navy-900">
                    <span className={`h-2.5 w-2.5 rounded-full ${d.dot}`} />
                    {DIFFICULTY_LABELS[d.value]}
                  </span>
                  <span className="mt-1 block text-[13px] text-muted">{d.hint}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <span id="count-label" className="text-sm font-medium text-muted">
              عدد الأسئلة
            </span>
            <div role="radiogroup" aria-labelledby="count-label" className="flex gap-2">
              {COUNTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={n === count}
                  onClick={() => setCount(n)}
                  className={`h-10 w-12 rounded-lg text-sm font-semibold tabular transition-colors ${
                    n === count ? "bg-navy-900 text-white" : "border border-line bg-white text-muted hover:border-navy-200 hover:text-navy-900"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <Button size="xl" onClick={start} disabled={!selectedSubject}>
          {selectedSubject ? `ابدأ كويز ${selectedSubject.name}` : "اختر مادة للبدء"}
          <ArrowLeft size={18} />
        </Button>
      </div>

      <aside className="flex flex-col gap-5">
        <QuotaCard refreshKey={quotaKey} />

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm font-semibold text-navy-900">آخر محاولاتك</p>
            <Link href="/exams/archive" className="text-sm font-semibold text-teal-700 hover:underline">
              عرض الكل
            </Link>
          </div>
          {recent.length === 0 ? (
            <p className="rounded-xl bg-canvas p-4 text-center text-sm text-muted">لم تحلّ أي كويز بعد — ابدأ الآن!</p>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {recent.map((a) => {
                const p = scorePercent(a);
                const tone = scoreTone(p);
                return (
                  <li key={a.id}>
                    <Link href={`/exams/archive?attempt=${a.id}`} className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-canvas">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular ${tone.soft} ${tone.text}`}>
                        {p}%
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-navy-900">{a.subjectName}</span>
                        <span className="block text-xs text-muted">
                          {DIFFICULTY_LABELS[a.difficulty]} · {formatDate(a.finishedAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="flex gap-3 rounded-2xl border border-gold-100 bg-gold-50 p-5">
          <Lightbulb size={19} className="mt-0.5 shrink-0 text-gold-600" />
          <p className="text-[13px] leading-6 text-ink">
            الأسئلة تُولّد بالذكاء الاصطناعي اعتماداً على امتحانات التوجيهي السابقة. راجع شرح كل إجابة خاطئة قبل المحاولة التالية.
          </p>
        </div>
      </aside>
    </div>
    </>
  );
}

function StepTitle({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) {
  return (
    <div className="mb-5 flex items-center gap-3">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-900 text-sm font-bold text-white tabular">{step}</span>
      <div>
        <h2 className="font-semibold text-navy-900">{title}</h2>
        {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
      </div>
    </div>
  );
}
