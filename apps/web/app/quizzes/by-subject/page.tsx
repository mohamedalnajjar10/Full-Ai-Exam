"use client";
import { useMemo } from "react";
import { BookMarked, Bot, Layers, Play, Target, Trophy } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import SubjectGlyph from "@/components/ui/SubjectGlyph";
import { ButtonLink } from "@/components/ui/Button";
import { useBranchSubjects } from "@/lib/subjects";
import { scorePercent, scoreTone, useQuizHistory } from "@/lib/quiz";
import { ATTEMPTS, countAr } from "@/lib/plural";

export default function QuizzesBySubjectPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="الكويزات"
        icon={Layers}
        title="مستواك حسب المادة"
        description="تابع مستواك في كل مادة على حدة، وابدأ كويزاً جديداً أو اسأل المساعد الذكي مباشرة."
      />
      <div className="mt-8">
        <SubjectsGrid />
      </div>
    </AppShell>
  );
}

function SubjectsGrid() {
  const { subjects, isLoading, error, branchTitle } = useBranchSubjects();
  const { attempts } = useQuizHistory();

  const stats = useMemo(() => {
    const map = new Map<string, { count: number; best: number; avg: number }>();
    for (const s of subjects) {
      const list = attempts.filter((a) => a.subjectId === s.id);
      const percents = list.map(scorePercent);
      map.set(s.id, {
        count: list.length,
        best: percents.length ? Math.max(...percents) : 0,
        avg: percents.length ? Math.round(percents.reduce((x, y) => x + y, 0) / percents.length) : 0,
      });
    }
    return map;
  }, [subjects, attempts]);

  if (isLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-60 animate-pulse rounded-2xl bg-white" />
        ))}
      </div>
    );
  }

  if (error || subjects.length === 0) {
    return (
      <EmptyState
        icon={BookMarked}
        tone={error ? "error" : "neutral"}
        title={error ? "تعذّر تحميل المواد" : "لا توجد مواد بعد"}
        description={error ? "تحقق من اتصالك وحدّث الصفحة" : `لم تُضف مواد لـ${branchTitle} حتى الآن`}
      />
    );
  }

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {subjects.map((s) => {
        const st = stats.get(s.id)!;
        const tone = scoreTone(st.avg);
        return (
          <article key={s.id} className="flex flex-col rounded-2xl border border-line bg-white p-6 shadow-card">
            <div className="flex items-center gap-4">
              <SubjectGlyph name={s.name} size="lg" />
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-navy-900">{s.name}</h3>
                <p className="text-[13px] text-muted">{st.count ? `${countAr(st.count, ATTEMPTS)} حتى الآن` : "لم تبدأ هذه المادة بعد"}</p>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-3 divide-x divide-x-reverse divide-line rounded-xl border border-line text-center">
              <div className="py-3">
                <dd className="text-lg font-bold text-navy-900 tabular">{st.count}</dd>
                <dt className="text-xs text-muted">محاولة</dt>
              </div>
              <div className="py-3">
                <dd className={`text-lg font-bold tabular ${st.count ? tone.text : "text-navy-200"}`} dir="ltr">
                  {st.count ? `${st.avg}%` : "—"}
                </dd>
                <dt className="text-xs text-muted">المعدل</dt>
              </div>
              <div className="py-3">
                <dd className={`flex items-center justify-center gap-1 text-lg font-bold tabular ${st.count ? "text-gold-600" : "text-navy-200"}`} dir="ltr">
                  {st.count ? (
                    <>
                      {st.best}%
                      <Trophy size={14} />
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-xs text-muted">الأفضل</dt>
              </div>
            </dl>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas">
              <div className={`h-full rounded-full ${tone.bg}`} style={{ width: `${st.count ? st.avg : 0}%` }} />
            </div>

            <div className="mt-5 flex gap-2">
              <ButtonLink href={`/quizzes?subject=${s.id}`} className="flex-1">
                <Play size={15} />
                كويز سريع
              </ButtonLink>
              <ButtonLink href={`/ai-path?subject=${s.id}`} variant="secondary" aria-label={`اسأل المساعد الذكي عن ${s.name}`}>
                <Bot size={16} />
                اسأل AI
              </ButtonLink>
            </div>
            <ButtonLink
              href={`/assessments?subject=${s.id}`}
              variant="secondary"
              className="mt-2 w-full justify-center gap-1.5 border-teal-200 bg-teal-50/50 text-xs font-semibold text-teal-800 hover:bg-teal-100/70"
            >
              <Target size={14} className="text-teal-700" />
              اختبار تقييم القدرات (بلوم)
            </ButtonLink>
          </article>
        );
      })}
    </div>
  );
}
