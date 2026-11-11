"use client";
import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, ArrowRight, BarChart3, ChevronLeft, Clock, FileQuestion, Search, Trash2 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import QuizResult from "@/components/quiz/QuizResult";
import { ATTEMPTS, countAr } from "@/lib/plural";
import {
  DIFFICULTY_LABELS,
  DIFFICULTY_STYLES,
  formatDate,
  formatDuration,
  scorePercent,
  scoreTone,
  useQuizHistory,
  type QuizAttempt,
} from "@/lib/quiz";

const SOURCE_LABELS: Record<QuizAttempt["source"], string> = {
  GENERATED: "كويز مولّد",
  CHAT: "من المساعد الذكي",
  RETAKE: "إعادة محاولة",
};

export default function ExamsArchivePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
        <ArchiveContent />
      </Suspense>
    </AppShell>
  );
}

function ArchiveContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { attempts, removeAttempt } = useQuizHistory();
  const attemptId = params.get("attempt");

  if (attemptId) {
    const attempt = attempts.find((a) => a.id === attemptId);
    return (
      <>
        <Link href="/exams/archive" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-navy-900">
          <ArrowRight size={16} />
          العودة للأرشيف
        </Link>
        {attempt ? (
          <>
            <p className="mb-4 text-center text-sm text-muted">
              {SOURCE_LABELS[attempt.source]} · {formatDate(attempt.finishedAt, true)}
            </p>
            <QuizResult attempt={attempt} onRetake={() => router.push(`/quizzes?retake=${attempt.id}`)} />
          </>
        ) : (
          <EmptyState
            icon={FileQuestion}
            title="المحاولة غير موجودة"
            description="ربما حُذفت، أو أنها محفوظة على متصفح أو جهاز آخر."
            actionHref="/exams/archive"
            actionLabel="عرض الأرشيف"
          />
        )}
      </>
    );
  }

  return <ArchiveList attempts={attempts} onRemove={removeAttempt} />;
}

function ArchiveList({ attempts, onRemove }: { attempts: QuizAttempt[]; onRemove: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [sort, setSort] = useState<"newest" | "best" | "worst">("newest");

  const subjects = useMemo(() => Array.from(new Map(attempts.map((a) => [a.subjectId, a.subjectName])).entries()), [attempts]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const list = attempts.filter(
      (a) => (subject === "all" || a.subjectId === subject) && (!q || a.subjectName.includes(q) || a.questions.some((x) => x.questionText.includes(q))),
    );
    if (sort === "best") return [...list].sort((a, b) => scorePercent(b) - scorePercent(a));
    if (sort === "worst") return [...list].sort((a, b) => scorePercent(a) - scorePercent(b));
    return list;
  }, [attempts, query, subject, sort]);

  const select = inputClass(false, "h-11 w-full cursor-pointer md:w-44");

  return (
    <>
      <PageHeader
        eyebrow="الاختبارات السابقة"
        icon={Archive}
        title="أرشيف الاختبارات"
        description="كل الكويزات التي حللتها محفوظة هنا — راجع إجاباتك وشروحاتها، أو أعد المحاولة بنفس الأسئلة دون استهلاك رصيدك."
        actions={
          <ButtonLink href="/exams/results" variant="secondary">
            <BarChart3 size={16} />
            نتائجي
          </ButtonLink>
        }
      />

      {attempts.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={Archive}
            title="الأرشيف فارغ حالياً"
            description="عندما تُنهي أول كويز ستجده محفوظاً هنا مع كل الإجابات والشروحات."
            actionHref="/quizzes"
            actionLabel="ابدأ أول كويز"
          />
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <span className="sr-only">بحث</span>
              <Search size={17} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-subtle" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث باسم المادة أو نص سؤال…"
                className={inputClass(false, "h-11 ps-11")}
              />
            </label>
            <select value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="تصفية حسب المادة" className={select}>
              <option value="all">كل المواد</option>
              {subjects.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="الترتيب" className={select}>
              <option value="newest">الأحدث أولاً</option>
              <option value="best">الأعلى درجة</option>
              <option value="worst">الأقل درجة</option>
            </select>
          </div>

          <p className="mb-3 mt-6 text-sm text-muted" aria-live="polite">
            {countAr(filtered.length, ATTEMPTS)}
          </p>

          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="لا توجد نتائج مطابقة" description="جرّب كلمات بحث أخرى أو غيّر التصفية." />
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
              {filtered.map((a) => {
                const p = scorePercent(a);
                const tone = scoreTone(p);
                return (
                  <li key={a.id} className="group flex items-center gap-2 border-b border-line last:border-0">
                    <Link href={`/exams/archive?attempt=${a.id}`} className="flex min-w-0 flex-1 items-center gap-4 p-4 transition-colors hover:bg-canvas/60 sm:p-5">
                      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold tabular ${tone.soft} ${tone.text}`}>
                        {p}%
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-navy-900">{a.subjectName}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${DIFFICULTY_STYLES[a.difficulty]}`}>
                            {DIFFICULTY_LABELS[a.difficulty]}
                          </span>
                          <span className="hidden rounded-full bg-canvas px-2 py-0.5 text-[11px] text-muted sm:inline">{SOURCE_LABELS[a.source]}</span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                          <span className="tabular">
                            {a.correct}/{a.total} صحيحة
                          </span>
                          <span className="flex items-center gap-1 tabular">
                            <Clock size={12} />
                            {formatDuration(a.durationSec)}
                          </span>
                          <span>{formatDate(a.finishedAt, true)}</span>
                        </span>
                      </span>
                      <ChevronLeft size={18} className="shrink-0 text-navy-200 transition-transform group-hover:-translate-x-0.5 group-hover:text-navy-900" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("حذف هذه المحاولة من الأرشيف؟")) onRemove(a.id);
                      }}
                      aria-label={`حذف محاولة ${a.subjectName}`}
                      className="me-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
