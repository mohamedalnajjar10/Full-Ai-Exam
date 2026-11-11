"use client";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Target } from "lucide-react";
import type { Subject as ApiSubject } from "@ai-exam/types";
import { Card, CardHeader } from "@/components/ui/Card";
import SubjectGlyph from "@/components/ui/SubjectGlyph";
import Alert from "@/components/ui/Alert";
import { useBranchSubjects } from "@/lib/subjects";
import { scorePercent, scoreTone, useQuizHistory } from "@/lib/quiz";

/**
 * كانت ماركيه Swiper بتدور بلا توقف (autoplay delay 0) ونفس الأيقونة
 * لكل المواد. هلق شبكة ثابتة، وكل مادة فيها مستوى الطالب الحقيقي.
 */
export default function SubjectsPanel({ initialSubjects }: { initialSubjects: ApiSubject[] | null }) {
  const { subjects, isLoading, error, branchTitle } = useBranchSubjects(initialSubjects);
  const { attempts } = useQuizHistory();

  const progress = useMemo(() => {
    const map = new Map<string, { count: number; avg: number }>();
    for (const s of subjects) {
      const list = attempts.filter((a) => a.subjectId === s.id);
      const correct = list.reduce((x, a) => x + a.correct, 0);
      const total = list.reduce((x, a) => x + a.total, 0);
      map.set(s.id, { count: list.length, avg: scorePercent({ correct, total }) });
    }
    return map;
  }, [subjects, attempts]);

  return (
    <Card>
      <CardHeader
        title="موادك"
        description={branchTitle ? `مواد ${branchTitle} ومستواك في كل منها` : undefined}
        action={
          <Link href="/quizzes/by-subject" className="text-sm font-semibold text-teal-700 hover:underline">
            عرض التفاصيل
          </Link>
        }
      />
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-xl bg-canvas" />
          ))}
        </div>
      ) : error ? (
        <Alert tone="error">{error}</Alert>
      ) : subjects.length === 0 ? (
        <p className="rounded-xl bg-canvas p-5 text-center text-sm text-muted">لم تُضف مواد لفرعك بعد.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {subjects.map((s) => {
            const p = progress.get(s.id)!;
            const tone = scoreTone(p.avg);
            return (
              <li key={s.id} className="group relative flex items-center gap-3.5 rounded-xl border border-line p-3.5 transition-colors hover:border-navy-200 hover:bg-canvas/50">
                <SubjectGlyph name={s.name} />
                <div className="min-w-0 flex-1">
                  <Link href={`/quizzes?subject=${s.id}`} className="block truncate font-semibold text-navy-900 after:absolute after:inset-0">
                    {s.name}
                  </Link>
                  {p.count ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-canvas">
                        <div className={`h-full rounded-full ${tone.bg}`} style={{ width: `${p.avg}%` }} />
                      </div>
                      <span className={`text-xs font-semibold tabular ${tone.text}`}>{p.avg}%</span>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-xs text-subtle">لم تبدأ بعد</p>
                  )}
                </div>
                <Link
                  href={`/assessments?subject=${s.id}`}
                  aria-label={`تقييم قدرات في ${s.name}`}
                  title={`تقييم القدرات المعرفية في ${s.name}`}
                  className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-gold-50 hover:text-gold-700"
                >
                  <Target size={17} />
                </Link>
                <Link
                  href={`/ai-path?subject=${s.id}`}
                  aria-label={`اسأل المساعد الذكي عن ${s.name}`}
                  className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-teal-50 hover:text-teal-700"
                >
                  <Bot size={17} />
                </Link>
                <ArrowLeft size={16} className="shrink-0 text-navy-200 transition-transform group-hover:-translate-x-0.5 group-hover:text-navy-900" aria-hidden />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
