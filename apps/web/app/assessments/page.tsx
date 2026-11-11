"use client";
import { Suspense, useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Target,
  Sparkles,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Zap,
} from "lucide-react";
import type {
  AssessmentHistoryItem,
  DifficultyLevel,
  AssessmentAttemptStatus,
} from "@ai-exam/types";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button, ButtonLink } from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";
import SubjectGlyph from "@/components/ui/SubjectGlyph";
import QuotaCard from "@/components/quiz/QuotaCard";
import QuotaExceededModal from "@/components/subscriptions/QuotaExceededModal";
import AiAssessmentLoader from "@/components/assessment/AiAssessmentLoader";
import { useBranchSubjects } from "@/lib/subjects";
import { subscribeToQuotaChanges } from "@/lib/quotaSync";
import {
  generateAssessment,
  getAssessmentHistory,
  describeError,
  ApiError,
} from "@/lib/api";
import {
  DIFFICULTY_AR_LABELS,
  STATUS_LABELS,
} from "@/lib/assessment";
import { formatDate, scoreTone } from "@/lib/quiz";

export default function AssessmentHubPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-white" />}>
        <AssessmentHubContent />
      </Suspense>
    </AppShell>
  );
}

function AssessmentHubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedSubject = searchParams.get("subject");

  const { subjects, isLoading: isLoadingSubjects, branchTitle } = useBranchSubjects();

  // حالة التوليد
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [difficulty, setDifficulty] = useState<DifficultyLevel>("MEDIUM");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaModalMessage, setQuotaModalMessage] = useState<string | undefined>();
  const [quotaModalResetAt, setQuotaModalResetAt] = useState<string | undefined>();

  // حالة سجل التقييمات
  const [history, setHistory] = useState<AssessmentHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [statusFilter, setStatusFilter] = useState<"all" | AssessmentAttemptStatus>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");

  // تعيين المادة الافتراضية
  useEffect(() => {
    if (selectedSubjectId || subjects.length === 0) return;
    const preselected =
      preselectedSubject && subjects.some((s) => s.id === preselectedSubject)
        ? preselectedSubject
        : subjects[0].id;
    setSelectedSubjectId(preselected);
  }, [preselectedSubject, subjects, selectedSubjectId]);

  // جلب سجل التقييمات
  const fetchHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const res = await getAssessmentHistory({
        page: historyPage,
        limit: 8,
        subjectId: subjectFilter === "all" ? undefined : subjectFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setHistory(res.data);
      setTotalPages(res.meta.totalPages);
      setTotalAttempts(res.meta.total);
    } catch {
      // خطأ شبكة أو جلسة
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [historyPage, statusFilter, subjectFilter]);

  useEffect(() => {
    const unsub = subscribeToQuotaChanges(() => {
      fetchHistory();
    });
    return unsub;
  }, []);

  // بدء التقييم عبر الـ API
  const handleStartAssessment = async () => {
    if (!selectedSubjectId) return;

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const res = await generateAssessment({
        subjectId: selectedSubjectId,
        difficultyLevel: difficulty,
      });
      router.push(`/assessments/${res.attemptId}`);
    } catch (err) {
      setIsGenerating(false);
      if (err instanceof ApiError && err.status === 429) {
        setQuotaModalMessage(err.message);
        setQuotaModalResetAt(err.payload?.resetAt);
        setQuotaModalOpen(true);
      }
      setGenerateError(describeError(err));
    }
  };

  const selectedSubjectObj = subjects.find((s) => s.id === selectedSubjectId);

  if (isGenerating) {
    return (
      <div className="py-12">
        <AiAssessmentLoader
          mode="generate"
          subjectName={selectedSubjectObj?.name}
        />
      </div>
    );
  }

  return (
    <>
      <QuotaExceededModal
        isOpen={quotaModalOpen}
        onClose={() => setQuotaModalOpen(false)}
        feature="assessment"
        message={quotaModalMessage}
        resetAt={quotaModalResetAt}
      />
      <div className="flex flex-col gap-10">
      {/* الترويسة العليا */}
      <PageHeader
        eyebrow="التقييم المعرفي الذكي"
        icon={Target}
        title="مركز تقييم القدرات المعرفية"
        description="اختبارات معيارية مصممة بنموذج الذكاء الاصطناعي وفق هرم بلوم للمهارات المعرفية (تذكر، فهم، تطبيق، تحليل). حدّد مستواك الفعلي واحصل على تقرير تشخيصي شامل."
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* العمود الأيمن: منشئ التقييم الجديد + السجل */}
        <div className="flex flex-col gap-8">
          {/* وحدة بدء تقييم جديد */}
          <Card className="p-6 sm:p-8">
            <div className="flex items-center gap-2.5 mb-6 text-navy-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Sparkles size={20} />
              </span>
              <div>
                <h2 className="text-lg font-bold">بدء اختبار تقييم جديد</h2>
                <p className="text-xs text-muted">
                  {branchTitle ? `مواد ${branchTitle}` : "اختر المادة ومستوى الصعوبة المطلوب"}
                </p>
              </div>
            </div>

            {generateError && (
              <div className="mb-6 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">
                <AlertCircle size={17} className="shrink-0 mt-0.5" />
                <span>{generateError}</span>
              </div>
            )}

            {/* اختيار المادة */}
            <div>
              <label className="block text-xs font-bold text-navy-900 mb-3">
                1. اختر المادة التعليمية
              </label>

              {isLoadingSubjects ? (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-2xl bg-canvas" />
                  ))}
                </div>
              ) : subjects.length === 0 ? (
                <p className="rounded-xl bg-canvas p-4 text-xs text-muted">
                  لم تتوفر مواد دراسية لفرعك حالياً.
                </p>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                  {subjects.map((sub) => {
                    const isSelected = sub.id === selectedSubjectId;
                    return (
                      <button
                        key={sub.id}
                        type="button"
                        onClick={() => setSelectedSubjectId(sub.id)}
                        className={`flex items-center gap-3 rounded-2xl border p-3 text-start transition-all ${
                          isSelected
                            ? "border-teal-600 bg-teal-50/60 shadow-[0_0_0_1.5px_var(--color-teal-600)]"
                            : "border-line bg-white hover:border-navy-200 hover:bg-canvas/40"
                        }`}
                      >
                        <SubjectGlyph name={sub.name} size="sm" />
                        <span className={`text-xs font-bold truncate ${isSelected ? "text-teal-900" : "text-navy-900"}`}>
                          {sub.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* اختيار مستوى الصعوبة */}
            <div className="mt-6 border-t border-line pt-6">
              <label className="block text-xs font-bold text-navy-900 mb-3">
                2. اختر مستوى الصعوبة المستهدف
              </label>

              <div className="grid grid-cols-3 gap-2.5">
                {(["EASY", "MEDIUM", "HARD"] as DifficultyLevel[]).map((lvl) => {
                  const isSelected = difficulty === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDifficulty(lvl)}
                      className={`flex flex-col items-center justify-center rounded-2xl border p-3.5 text-center transition-all ${
                        isSelected
                          ? "border-navy-900 bg-navy-900 text-white shadow-sm"
                          : "border-line bg-white text-navy-900 hover:border-navy-200 hover:bg-canvas/50"
                      }`}
                    >
                      <span className="text-xs font-bold">{DIFFICULTY_AR_LABELS[lvl]}</span>
                      <span className={`mt-0.5 text-[10px] ${isSelected ? "text-navy-200" : "text-muted"}`}>
                        {lvl === "EASY" ? "تأسيسي ومفاهيمي" : lvl === "MEDIUM" ? "معياري وزاري" : "تحدي وتفكير ناقد"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* تفاصيل الاختبار المعرفي */}
            <div className="mt-6 rounded-2xl border border-navy-100 bg-navy-50/40 p-4 text-xs leading-6 text-navy-900">
              <div className="flex items-center gap-2 font-bold mb-1">
                <Target size={16} className="text-teal-700" />
                <span>مواصفات الاختبار المعياري:</span>
              </div>
              <p className="text-muted">
                يتكون الاختبار من <b>5 أسئلة تشخيصية</b> يتم توزيعها على مستويات تصنيف بلوم المعرفي: استرجاع وتذكر الحقائق، الفهم المفاهيمي، التطبيق الحسابي، والتحليل والاستنتاج. يستغرق الاختبار عادة بين 5 إلى 10 دقائق.
              </p>
            </div>

            {/* زر إطلاق التقييم */}
            <div className="mt-6">
              <Button
                variant="accent"
                onClick={handleStartAssessment}
                disabled={!selectedSubjectId}
                className="w-full justify-center gap-2 text-sm font-bold py-3.5"
              >
                <Play size={16} />
                بدء اختبار التقييم المعرفي الآن
              </Button>
            </div>
          </Card>

          {/* سجل ومحاولات التقييم السابقة */}
          <section className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-navy-900">سجل التقييمات السابقة</h3>
                <p className="text-xs text-muted">
                  راجع تقاريرك التشخيصية أو استكمل الاختبارات المعلّقة
                </p>
              </div>

              {/* تبويبات التصفية حسب الحالة */}
              <div
                role="tablist"
                aria-label="تصفية السجل"
                className="flex rounded-xl border border-line bg-white p-1 shadow-sm"
              >
                {(
                  [
                    ["all", "الكل"],
                    ["PENDING", "المعلّقة"],
                    ["COMPLETED", "المكتملة"],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === key}
                    onClick={() => {
                      setStatusFilter(key);
                      setHistoryPage(1);
                    }}
                    className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                      statusFilter === key
                        ? "bg-navy-900 text-white"
                        : "text-muted hover:text-navy-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {isLoadingHistory ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-white border border-line" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <Card className="p-8 text-center">
                <EmptyState
                  icon={Target}
                  title="لا توجد اختبارات في هذا القسم"
                  description="ابدأ أول اختبار تقييم لك في أي من المواد أعلاه لتحصل على تقريرك التشخيصي الأول."
                />
              </Card>
            ) : (
              <div className="space-y-3">
                {history.map((attempt) => {
                  const isPending = attempt.status === "PENDING";
                  const score = attempt.score !== null ? Math.round(attempt.score) : null;
                  const tone = score !== null ? scoreTone(score) : null;
                  const statusMeta = STATUS_LABELS[attempt.status];

                  return (
                    <article
                      key={attempt.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-line bg-white p-5 shadow-card transition-all hover:border-navy-300"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        {score !== null ? (
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-sm font-bold tabular ${tone?.soft} ${tone?.text}`}
                          >
                            {score}%
                          </div>
                        ) : (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                            <Clock size={20} className="animate-pulse" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-sm text-navy-900 truncate">
                              {attempt.subject.name}
                            </h4>
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusMeta.badgeCls}`}
                            >
                              {statusMeta.label}
                            </span>
                            <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] text-muted">
                              {DIFFICULTY_AR_LABELS[attempt.difficultyLevel]}
                            </span>
                          </div>

                          <p className="mt-1 flex items-center gap-2 text-xs text-muted">
                            <Clock size={13} />
                            <span>بدأ في {formatDate(attempt.startedAt, true)}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isPending ? (
                          <ButtonLink
                            href={`/assessments/${attempt.id}`}
                            variant="accent"
                            className="text-xs font-bold gap-1.5"
                          >
                            <RotateCcw size={14} />
                            استئناف التقييم
                          </ButtonLink>
                        ) : (
                          <ButtonLink
                            href={`/assessments/${attempt.id}`}
                            variant="secondary"
                            className="text-xs font-semibold gap-1.5"
                          >
                            عرض التقرير التشخيصي
                            <ChevronLeft size={14} />
                          </ButtonLink>
                        )}
                      </div>
                    </article>
                  );
                })}

                {/* أزرار ترقيم الصفحات */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between border-t border-line pt-4 text-xs text-muted">
                    <span>
                      صفحة {historyPage} من {totalPages} ({totalAttempts} محاولة)
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={historyPage === 1}
                        className="h-8 px-2.5 text-xs"
                      >
                        <ChevronRight size={14} />
                        السابق
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
                        disabled={historyPage === totalPages}
                        className="h-8 px-2.5 text-xs"
                      >
                        التالي
                        <ChevronLeft size={14} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* العمود الأيسر: الرصيد والتوجيهات */}
        <aside className="flex flex-col gap-6">
          <QuotaCard />

          <Card className="p-5">
            <h4 className="text-xs font-bold text-navy-900 mb-2">كيف يعمل تقييم القدرات؟</h4>
            <ul className="space-y-2.5 text-xs leading-5 text-muted">
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-bold text-teal-800">1</span>
                <span>توليد ذكي لـ 5 أسئلة تشخيصية مكثفة مخصصة لفرعك ومادتك.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-bold text-teal-800">2</span>
                <span>بيئة خالية من التشتت وحفظ تلقائي للإجابات أولاً بأول.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] font-bold text-teal-800">3</span>
                <span>تقرير تشخيصي فوري يوضح نقاط قوتك وفجوات التعلم وخطة عمل واضحة.</span>
              </li>
            </ul>
          </Card>
        </aside>
      </div>
    </div>
    </>
  );
}
