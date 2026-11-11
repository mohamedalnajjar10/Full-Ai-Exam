"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Lightbulb,
  Check,
  X,
  MinusCircle,
  RotateCcw,
  Bot,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  ListTodo,
} from "lucide-react";
import type { SubmitAssessmentResponse, AssessmentAttemptDetailResponse } from "@ai-exam/types";
import { Button, ButtonLink } from "@/components/ui/Button";
import ScoreRing from "@/components/quiz/ScoreRing";
import RichText from "@/components/ui/RichText";
import {
  BLOOM_LABELS,
  BLOOM_BADGE_STYLES,
  parseAiFeedback,
} from "@/lib/assessment";
import { scoreTone, formatDuration, formatDate } from "@/lib/quiz";

interface AssessmentDiagnosticViewProps {
  data: SubmitAssessmentResponse | AssessmentAttemptDetailResponse;
  subjectName?: string;
  subjectId?: string;
  onRetake?: () => void;
}

export default function AssessmentDiagnosticView({
  data,
  subjectName,
  subjectId: subjectIdProp,
  onRetake,
}: AssessmentDiagnosticViewProps) {
  const [filter, setFilter] = useState<"all" | "wrong">("all");

  const isSubmitResponse = "totalQuestions" in data;
  const score = Math.round(data.score ?? 0);
  const tone = scoreTone(score);

  const subject =
    subjectName ||
    ("assessment" in data && data.assessment?.subject?.name
      ? data.assessment.subject.name
      : "المادة");

  const subjectId =
    subjectIdProp ?? ("assessment" in data && data.assessment?.subjectId ? data.assessment.subjectId : "");

  // استخراج تفاصيل الأسئلة
  const questionsList = useMemo(() => {
    if (isSubmitResponse) {
      const resp = data as SubmitAssessmentResponse;
      return resp.answers.map((ans, idx) => ({
        index: idx + 1,
        questionId: ans.questionId,
        questionText: ans.questionText || `السؤال ${idx + 1}`,
        studentAnswer: ans.studentAnswer,
        correctAnswer: ans.correctAnswer,
        isCorrect: ans.isCorrect,
        explanation: ans.explanation,
        bloomTaxonomyLevel: ans.bloomTaxonomyLevel,
      }));
    } else {
      const resp = data as AssessmentAttemptDetailResponse;
      const qMap = new Map(resp.assessment.questions.map((q) => [q.id, q]));
      return (resp.answers || []).map((ans, idx) => {
        const qDetail = qMap.get(ans.questionId);
        const correct = ans.correctAnswer || (qDetail && "correctAnswer" in qDetail ? qDetail.correctAnswer : "");
        const expl = ans.explanation || (qDetail && "explanation" in qDetail ? qDetail.explanation : null);
        const bloom = ans.bloomTaxonomyLevel || qDetail?.bloomTaxonomyLevel || "APPLY";
        return {
          index: idx + 1,
          questionId: ans.questionId,
          questionText: qDetail?.questionText || `السؤال ${idx + 1}`,
          studentAnswer: ans.studentAnswer,
          correctAnswer: correct,
          isCorrect: ans.isCorrect,
          explanation: expl,
          bloomTaxonomyLevel: bloom,
        };
      });
    }
  }, [data, isSubmitResponse]);

  const totalQuestions = questionsList.length;
  const correctCount = questionsList.filter((q) => q.isCorrect).length;
  const incorrectCount = totalQuestions - correctCount;

  // إحصائيات مستويات بلوم
  const bloomStats = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>();
    for (const q of questionsList) {
      const level = q.bloomTaxonomyLevel;
      const current = map.get(level) || { total: 0, correct: 0 };
      current.total += 1;
      if (q.isCorrect) current.correct += 1;
      map.set(level, current);
    }
    return Array.from(map.entries()).map(([level, stats]) => ({
      level,
      total: stats.total,
      correct: stats.correct,
      percent: Math.round((stats.correct / stats.total) * 100),
    }));
  }, [questionsList]);

  // تحليل تقرير الذكاء الاصطناعي
  const aiReport = useMemo(() => {
    return parseAiFeedback(data.aiFeedback);
  }, [data.aiFeedback]);

  // تصفية الأسئلة للمراجعة
  const filteredQuestions = useMemo(() => {
    if (filter === "wrong") {
      return questionsList.filter((q) => !q.isCorrect);
    }
    return questionsList;
  }, [questionsList, filter]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 pb-12">
      {/* الترويسة الرئيسية والعودة */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/assessments"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-navy-900"
        >
          <ArrowRight size={16} />
          العودة لمركز التقييم
        </Link>
        <span className="rounded-full bg-navy-50 px-3.5 py-1 text-xs font-semibold text-navy-800">
          تقرير تشخيص القدرات المعرفية
        </span>
      </div>

      {/* بطاقة النتيجة المعيارية (Hero Score Card) */}
      <section className="relative overflow-hidden rounded-3xl border border-line bg-white p-6 shadow-raised sm:p-10">
        <div className="absolute end-0 top-0 h-48 w-48 -translate-y-12 translate-x-12 rounded-full bg-teal-500/5 blur-3xl" />
        <div className="flex flex-col items-center gap-8 md:flex-row">
          <ScoreRing percent={score} size={168} stroke={14} />

          <div className="flex-1 text-center md:text-start">
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
              <Sparkles size={14} className="text-teal-600" />
              تشخيص معتمد وفق تصنيف بلوم
            </div>

            <h1 className="mt-2 text-2xl font-bold text-navy-900 sm:text-3xl">
              تقييم قدرات: {subject}
            </h1>

            <p className="mt-2 text-sm leading-7 text-muted">
              {score >= 85
                ? "أداء متميز واستيعاب معرفي عالي! أظهرت تفوقاً في المستويات العليا وامتلاكاً لأدوات الحل السريع."
                : score >= 70
                  ? "مستوى جيد جداً! لديك أساس مفاهيمي صلب مع وجود فجوات محددة يمكن سدها بالتدريب الموجه."
                  : score >= 50
                    ? "بداية واعدة مع حاجة لتثبيت المفاهيم والتطبيقات العملية. اتبع الخطة الدراسية أدناه لرفع مستواك."
                    : "لا تقلق، هذا التقييم بداية خطتك العلاجية. راجع الأخطاء والشروحات المرفقة بعناية."}
            </p>

            {/* المربعات الإحصائية السريعة */}
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-line bg-canvas/40 p-3.5 text-center">
                <span className="flex items-center justify-center gap-1.5 text-xs text-muted">
                  <CheckCircle2 size={15} className="text-teal-600" />
                  صحيحة
                </span>
                <p className="mt-1 text-xl font-bold text-teal-700 tabular">
                  {correctCount} <span className="text-xs font-normal text-muted">/ {totalQuestions}</span>
                </p>
              </div>

              <div className="rounded-2xl border border-line bg-canvas/40 p-3.5 text-center">
                <span className="flex items-center justify-center gap-1.5 text-xs text-muted">
                  <XCircle size={15} className="text-rose-600" />
                  خاطئة
                </span>
                <p className="mt-1 text-xl font-bold text-rose-600 tabular">
                  {incorrectCount} <span className="text-xs font-normal text-muted">/ {totalQuestions}</span>
                </p>
              </div>

              <div className="col-span-2 rounded-2xl border border-line bg-canvas/40 p-3.5 text-center sm:col-span-1">
                <span className="flex items-center justify-center gap-1.5 text-xs text-muted">
                  <TrendingUp size={15} className="text-navy-700" />
                  مستوى الإتقان
                </span>
                <p className={`mt-1 text-lg font-bold ${tone.text}`}>
                  {tone.label}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* أزرار الإجراءات */}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {subjectId && (
            <ButtonLink
              href={`/ai-path?subject=${subjectId}`}
              variant="accent"
              className="gap-2"
            >
              <Bot size={16} />
              معالجة الفجوات مع المساعد الذكي
            </ButtonLink>
          )}

          {onRetake ? (
            <Button variant="secondary" onClick={onRetake} className="gap-2">
              <RotateCcw size={16} />
              إعادة نفس الاختبار
            </Button>
          ) : (
            <ButtonLink href="/assessments" variant="secondary" className="gap-2">
              <Layers size={16} />
              اختبار مادة أخرى
            </ButtonLink>
          )}
        </div>
      </section>

      {/* تفصيل الأداء وفق مستويات بلوم (Bloom's Taxonomy Breakdown) */}
      {bloomStats.length > 0 && (
        <section className="rounded-3xl border border-line bg-white p-6 shadow-card sm:p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-navy-900">
                تحليل المستويات المعرفية (هرم بلوم)
              </h2>
              <p className="text-xs text-muted">
                توزيع أدائك على المهارات المعرفية من التذكر والاسترجاع حتى التطبيق والتحليل
              </p>
            </div>
            <span className="rounded-full bg-canvas px-3 py-1 text-xs font-medium text-subtle">
              {bloomStats.length} مستويات خضعت للتقييم
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {bloomStats.map(({ level, total, correct, percent }) => {
              const bloomInfo = BLOOM_LABELS[level as keyof typeof BLOOM_LABELS] || {
                name: level,
                enName: level,
                desc: "",
              };
              const style = BLOOM_BADGE_STYLES[level as keyof typeof BLOOM_BADGE_STYLES] || {
                bg: "bg-navy-50",
                text: "text-navy-800",
                border: "border-navy-200",
                dot: "bg-navy-600",
              };
              const tone = scoreTone(percent);

              return (
                <div
                  key={level}
                  className={`rounded-2xl border ${style.border} ${style.bg}/40 p-4 transition-all hover:shadow-sm`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-bold text-navy-900">
                      <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                      {bloomInfo.name}
                    </span>
                    <span className={`text-xs font-bold tabular ${tone.text}`}>
                      {percent}%
                    </span>
                  </div>

                  <p className="mt-1 text-[11px] leading-5 text-muted">
                    {bloomInfo.desc}
                  </p>

                  <div className="mt-3.5 flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${tone.bg}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-subtle tabular">
                      {correct}/{total}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* بطاقات التحليل التشخيصي الصادرة من الذكاء الاصطناعي (AI Feedback Cards) */}
      <section className="grid gap-6">
        <div className="flex items-center gap-2">
          <Sparkles size={20} className="text-gold-500" />
          <h2 className="text-xl font-bold text-navy-900">
            التقرير التشخيصي والتوصيات الذكية
          </h2>
        </div>

        {/* 1. التقييم العام */}
        {aiReport.overallEvaluation && (
          <article className="rounded-3xl border border-line bg-white p-6 shadow-card sm:p-7">
            <header className="mb-3 flex items-center gap-2.5 text-navy-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-navy-50 text-navy-800">
                <TrendingUp size={18} />
              </span>
              <h3 className="font-bold">1. التقييم العام ومستوى الإتقان</h3>
            </header>
            <div className="text-sm leading-8 text-ink/90 sm:text-[15px]">
              <RichText text={aiReport.overallEvaluation} />
            </div>
          </article>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {/* 2. نقاط القوة والمستويات المتقنة */}
          <article className="flex flex-col rounded-3xl border border-teal-200 bg-teal-50/30 p-6 shadow-card sm:p-7">
            <header className="mb-4 flex items-center gap-2.5 text-teal-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-100 text-teal-800">
                <CheckCircle2 size={18} />
              </span>
              <h3 className="font-bold">2. نقاط القوة والمستويات المتقنة</h3>
            </header>
            {aiReport.strengths.length > 0 ? (
              <ul className="space-y-3 text-sm leading-7 text-ink/90">
                {aiReport.strengths.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <Check size={16} className="mt-1 shrink-0 text-teal-600" />
                    <span><RichText text={item} /></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">
                لا توجد نقاط قوة بارزة مسجلة في هذه المحاولة.
              </p>
            )}
          </article>

          {/* 3. فجوات التعلم وتحليل الأخطاء */}
          <article className="flex flex-col rounded-3xl border border-amber-200 bg-amber-50/30 p-6 shadow-card sm:p-7">
            <header className="mb-4 flex items-center gap-2.5 text-amber-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <AlertTriangle size={18} />
              </span>
              <h3 className="font-bold">3. فجوات التعلم ومواطن الخطأ</h3>
            </header>
            {aiReport.weaknesses.length > 0 ? (
              <ul className="space-y-3 text-sm leading-7 text-ink/90">
                {aiReport.weaknesses.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <X size={16} className="mt-1 shrink-0 text-amber-700" />
                    <span><RichText text={item} /></span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-teal-800 font-medium">
                رائع جداً! لم تظهر أي فجوات تعلم رئيسية في هذه المحاولة.
              </p>
            )}
          </article>
        </div>

        {/* 4. الخطة الدراسية المخصصة */}
        {aiReport.studyPlan.length > 0 && (
          <article className="rounded-3xl border border-gold-200 bg-gold-50/20 p-6 shadow-card sm:p-8">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-navy-900">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold-100 text-gold-700">
                  <ListTodo size={18} />
                </span>
                <div>
                  <h3 className="font-bold">4. الخطة الدراسية المقترحة والتوصيات العملية</h3>
                  <p className="text-xs text-muted">خطوات محددة لسد الفجوات ورفع نتيجتك في الاختبارات القادمة</p>
                </div>
              </div>
            </header>

            <div className="space-y-3">
              {aiReport.studyPlan.map((step, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 rounded-2xl border border-line/80 bg-white p-4 shadow-sm"
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-50 text-xs font-bold text-navy-900 tabular">
                    {idx + 1}
                  </span>
                  <div className="flex-1 text-sm leading-7 text-ink">
                    <RichText text={step} />
                  </div>
                </div>
              ))}
            </div>

            {subjectId && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-navy-900 p-4 text-white sm:p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-teal-400">
                    <Bot size={22} />
                  </span>
                  <div>
                    <p className="font-semibold text-sm">هل تحتاج شرحاً تفصيلياً لأي من هذه الخطوات؟</p>
                    <p className="text-xs text-navy-200">مساعدك الذكي جاهز لمناقشة الأخطاء وتقديم أمثلة تدريبية فورية.</p>
                  </div>
                </div>
                <ButtonLink
                  href={`/ai-path?subject=${subjectId}`}
                  variant="accent"
                  className="text-xs"
                >
                  بدء مراجعة الفجوات
                </ButtonLink>
              </div>
            )}
          </article>
        )}
      </section>

      {/* مراجعة الأسئلة وتفنيد الإجابات (Detailed Question Review) */}
      <section className="mt-4">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy-900">مراجعة إجابات الأسئلة</h2>
            <p className="text-xs text-muted">
              استعرض كل سؤال مع إجابتك، الإجابة المعتمدة، وشرح السبب التربوي
            </p>
          </div>

          <div
            role="tablist"
            aria-label="تصفية الأسئلة"
            className="flex rounded-xl border border-line bg-white p-1 shadow-sm"
          >
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              onClick={() => setFilter("all")}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                filter === "all"
                  ? "bg-navy-900 text-white"
                  : "text-muted hover:text-navy-900"
              }`}
            >
              الكل ({totalQuestions})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "wrong"}
              onClick={() => setFilter("wrong")}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition-colors ${
                filter === "wrong"
                  ? "bg-rose-600 text-white"
                  : "text-muted hover:text-rose-600"
              }`}
            >
              الأخطاء فقط ({incorrectCount})
            </button>
          </div>
        </div>

        {filteredQuestions.length === 0 ? (
          <div className="rounded-3xl border border-teal-200 bg-teal-50 p-8 text-center text-teal-800">
            <CheckCircle2 size={32} className="mx-auto mb-2 text-teal-600" />
            <p className="font-bold">أداء متكامل — لا توجد أخطاء في هذا الاختبار!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {filteredQuestions.map((q) => {
              const bloomInfo = BLOOM_LABELS[q.bloomTaxonomyLevel as keyof typeof BLOOM_LABELS];
              const bloomStyle = BLOOM_BADGE_STYLES[q.bloomTaxonomyLevel as keyof typeof BLOOM_BADGE_STYLES];

              return (
                <article
                  key={q.questionId}
                  className="rounded-3xl border border-line bg-white p-5 shadow-card sm:p-7"
                >
                  <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          q.isCorrect
                            ? "bg-teal-50 text-teal-700"
                            : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {q.isCorrect ? (
                          <Check size={18} strokeWidth={2.5} />
                        ) : (
                          <X size={18} strokeWidth={2.5} />
                        )}
                      </span>
                      <div>
                        <span className="text-xs font-medium text-muted">
                          السؤال {q.index}
                        </span>
                        <span
                          className={`ms-2 text-xs font-semibold ${
                            q.isCorrect ? "text-teal-700" : "text-rose-600"
                          }`}
                        >
                          {q.isCorrect ? "إجابة صحيحة" : "إجابة خاطئة"}
                        </span>
                      </div>
                    </div>

                    {bloomInfo && bloomStyle && (
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${bloomStyle.border} ${bloomStyle.bg} ${bloomStyle.text}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${bloomStyle.dot}`} />
                        مستوى بلوم: {bloomInfo.name} ({bloomInfo.enName})
                      </span>
                    )}
                  </header>

                  <h4 className="text-[15px] font-semibold leading-8 text-navy-900 sm:text-base">
                    <RichText text={q.questionText} />
                  </h4>

                  <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                    <div
                      className={`flex items-center gap-3 rounded-2xl border p-3.5 text-sm ${
                        q.isCorrect
                          ? "border-teal-200 bg-teal-50/60 text-teal-900"
                          : "border-rose-200 bg-rose-50/60 text-rose-900"
                      }`}
                    >
                      <span className="text-xs font-bold text-muted">إجابتك:</span>
                      <span className="font-bold tabular">{q.studentAnswer || "لم تُجب"}</span>
                      {q.isCorrect ? (
                        <Check size={16} className="ms-auto text-teal-600" />
                      ) : (
                        <X size={16} className="ms-auto text-rose-600" />
                      )}
                    </div>

                    <div className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50/40 p-3.5 text-sm text-teal-950">
                      <span className="text-xs font-bold text-muted">الإجابة المعتمدة:</span>
                      <span className="font-bold tabular">{q.correctAnswer}</span>
                      <Check size={16} className="ms-auto text-teal-600" />
                    </div>
                  </div>

                  {q.explanation && (
                    <div className="mt-4 flex items-start gap-2.5 rounded-2xl border border-gold-200 bg-gold-50/50 p-4 text-xs leading-6 text-navy-900 sm:text-sm">
                      <Lightbulb size={18} className="mt-0.5 shrink-0 text-gold-600" />
                      <div className="flex-1">
                        <span className="font-bold block mb-1 text-gold-800">التوضيح والشرح الأكاديمي:</span>
                        <RichText text={q.explanation} />
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
