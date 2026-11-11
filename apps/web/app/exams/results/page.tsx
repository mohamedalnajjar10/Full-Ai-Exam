"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Award, BarChart3, Clock, Flame, Target, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { Card, CardHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import ScoreRing from "@/components/quiz/ScoreRing";
import Pct from "@/components/ui/Pct";
import { ATTEMPTS, QUESTIONS, countAr } from "@/lib/plural";
import { DIFFICULTY_LABELS, computeStreak, formatDate, scorePercent, useQuizHistory } from "@/lib/quiz";

export default function ResultsPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="الاختبارات السابقة"
        icon={BarChart3}
        title="نتائجي وتقدّمي"
        description="صورة شاملة عن مستواك: معدلك العام، تطوّر درجاتك، ونقاط القوة والضعف في كل مادة."
      />
      <div className="mt-8">
        <ResultsContent />
      </div>
    </AppShell>
  );
}

function ResultsContent() {
  const { attempts } = useQuizHistory();

  const data = useMemo(() => {
    if (!attempts.length) return null;
    const percents = attempts.map(scorePercent);
    const totalQuestions = attempts.reduce((s, a) => s + a.total, 0);
    const totalCorrect = attempts.reduce((s, a) => s + a.correct, 0);

    const bySubject = new Map<string, { name: string; correct: number; total: number; count: number }>();
    for (const a of attempts) {
      const cur = bySubject.get(a.subjectId) ?? { name: a.subjectName, correct: 0, total: 0, count: 0 };
      cur.correct += a.correct;
      cur.total += a.total;
      cur.count += 1;
      bySubject.set(a.subjectId, cur);
    }
    const subjects = Array.from(bySubject.entries())
      .map(([id, s]) => ({ id, ...s, percent: scorePercent(s) }))
      .sort((a, b) => b.percent - a.percent);

    const byDifficulty = (["EASY", "MEDIUM", "HARD"] as const).map((d) => {
      const list = attempts.filter((a) => a.difficulty === d);
      const correct = list.reduce((s, a) => s + a.correct, 0);
      const total = list.reduce((s, a) => s + a.total, 0);
      return { d, count: list.length, percent: scorePercent({ correct, total }) };
    });

    const recent = attempts.slice(0, 12).reverse();
    const half = Math.floor(attempts.length / 2);
    const trend =
      attempts.length >= 4
        ? Math.round(
            attempts.slice(0, half).map(scorePercent).reduce((x, y) => x + y, 0) / half -
              attempts.slice(half).map(scorePercent).reduce((x, y) => x + y, 0) / (attempts.length - half),
          )
        : null;

    return {
      overall: scorePercent({ correct: totalCorrect, total: totalQuestions }),
      best: Math.max(...percents),
      totalQuestions,
      totalCorrect,
      studyMinutes: Math.round(attempts.reduce((s, a) => s + a.durationSec, 0) / 60),
      streak: computeStreak(attempts),
      subjects,
      byDifficulty,
      recent,
      trend,
    };
  }, [attempts]);

  if (!data) {
    return (
      <EmptyState
        icon={BarChart3}
        title="لا توجد نتائج بعد"
        description="حل كويزك الأول وسنعرض لك هنا تحليلاً كاملاً لمستواك وتقدّمك."
        actionHref="/quizzes"
        actionLabel="ابدأ كويز الآن"
      />
    );
  }

  const strongest = data.subjects[0];
  const weakest = data.subjects.length > 1 ? data.subjects[data.subjects.length - 1] : null;
  const tiles = [
    { icon: Target, label: "كويزات محلولة", value: String(attempts.length), sub: countAr(data.totalQuestions, QUESTIONS) },
    { icon: Trophy, label: "أفضل نتيجة", value: `${data.best}%`, sub: `${data.totalCorrect} إجابة صحيحة` },
    { icon: Clock, label: "وقت التدريب", value: String(data.studyMinutes), sub: "دقيقة" },
    { icon: Flame, label: "أيام متتالية", value: String(data.streak), sub: data.streak ? "استمر على هذا!" : "ابدأ سلسلتك اليوم" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {tiles.map(({ icon: Icon, label, value, sub }) => (
          <div key={label} className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
            <dt className="flex items-center gap-2 text-sm text-muted">
              <Icon size={16} strokeWidth={1.75} className="text-teal-700" />
              {label}
            </dt>
            <dd className="mt-3 text-[28px] font-bold leading-none text-navy-900" dir="ltr">
              <span className="block text-end">{value}</span>
            </dd>
            <p className="mt-2 text-xs text-subtle">{sub}</p>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex flex-col items-center text-center">
          <p className="mb-5 self-stretch text-start font-semibold text-navy-900">المعدل العام</p>
          <ScoreRing percent={data.overall} size={176} stroke={14} />
          {data.trend !== null && (
            <p
              className={`mt-5 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                data.trend >= 0 ? "bg-teal-50 text-teal-800" : "bg-rose-50 text-rose-700"
              }`}
            >
              {data.trend >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {data.trend >= 0 ? "تحسّن بمقدار" : "تراجع بمقدار"} <Pct value={Math.abs(data.trend)} /> عن محاولاتك الأقدم
            </p>
          )}
          <div className="mt-6 grid w-full gap-2.5">
            {data.byDifficulty.map(({ d, count, percent }) => (
              <div key={d} className="flex items-center gap-3 text-sm">
                <span className="w-12 text-start text-muted">{DIFFICULTY_LABELS[d]}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-navy-500" style={{ width: count ? `${percent}%` : 0 }} />
                </div>
                <span className="w-10 text-end text-xs font-semibold text-ink tabular">{count ? `${percent}%` : "—"}</span>
              </div>
            ))}
          </div>
        </Card>

        <TrendChart recent={data.recent} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="الأداء حسب المادة" description="نسبة الإجابات الصحيحة في كل المحاولات" />
          <ul className="flex flex-col gap-4">
            {data.subjects.map((s) => (
              <li key={s.id}>
                <div className="mb-1.5 flex items-center justify-between text-sm">
                  <span className="font-medium text-navy-900">{s.name}</span>
                  <span className="text-xs text-muted">
                    {countAr(s.count, ATTEMPTS)} · <Pct value={s.percent} className="font-semibold text-ink" />
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-teal-600 transition-[width] duration-700" style={{ width: `${s.percent}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <div className="flex flex-col gap-4">
          {strongest && (
            <Card>
              <p className="flex items-center gap-2 text-sm font-semibold text-teal-800">
                <Award size={17} />
                أقوى مادة
              </p>
              <p className="mt-2 text-lg font-semibold text-navy-900">{strongest.name}</p>
              <p className="mt-0.5 text-sm text-muted">معدل <Pct value={strongest.percent} /> — جرّب المستوى الصعب لتحدٍّ أكبر.</p>
            </Card>
          )}
          {weakest && weakest.id !== strongest?.id && (
            <Card>
              <p className="flex items-center gap-2 text-sm font-semibold text-rose-700">
                <Target size={17} />
                تحتاج تركيزاً أكثر
              </p>
              <p className="mt-2 text-lg font-semibold text-navy-900">{weakest.name}</p>
              <p className="mt-0.5 text-sm text-muted">معدل <Pct value={weakest.percent} /> — مراجعة قصيرة مع المساعد الذكي ستحدث فرقاً.</p>
              <div className="mt-4 flex gap-2">
                <ButtonLink href={`/quizzes?subject=${weakest.id}`} size="sm">
                  تدرّب الآن
                </ButtonLink>
                <ButtonLink href={`/ai-path?subject=${weakest.id}`} variant="secondary" size="sm">
                  اسأل AI
                </ButtonLink>
              </div>
            </Card>
          )}
          <ButtonLink href="/exams/archive" variant="secondary" block>
            راجع كل محاولاتك في الأرشيف
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

/**
 * درجات آخر المحاولات. لون واحد (المقدار هو الطول، مش اللون)، شبكة
 * خفيفة صلبة، والقيمة مكتوبة عالعمود الأخير والأفضل فقط — والباقي
 * بالتلميح وبجدول تحت الرسم لمن يحتاج كل الأرقام.
 */
function TrendChart({ recent }: { recent: ReturnType<typeof useQuizHistory>["attempts"] }) {
  const best = Math.max(...recent.map(scorePercent));
  return (
    <Card>
      <CardHeader title="تطوّر درجاتك" description={`آخر ${countAr(recent.length, ATTEMPTS)}، من الأقدم إلى الأحدث`} />
      <div className="relative ms-7 h-56">
        {[0, 50, 100].map((g) => (
          <div key={g} className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ bottom: `${g}%` }}>
            <span className="absolute -top-2 -start-7 w-6 text-end text-[11px] text-subtle tabular">{g}</span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-0.5">
          {recent.map((a, i) => {
            const p = scorePercent(a);
            const labelled = i === recent.length - 1 || p === best;
            return (
              <Link
                key={a.id}
                href={`/exams/archive?attempt=${a.id}`}
                className="group relative flex h-full flex-1 items-end justify-center px-[3px] focus-visible:outline-offset-0"
                aria-label={`${a.subjectName}، ${formatDate(a.finishedAt)}: ${p}%`}
              >
                {labelled && (
                  <span className="absolute text-[11px] font-semibold text-ink tabular" style={{ bottom: `calc(${Math.max(p, 3)}% + 4px)` }}>
                    {p}%
                  </span>
                )}
                <span className="pointer-events-none absolute bottom-full z-10 mb-2 hidden whitespace-nowrap rounded-lg bg-navy-950 px-2.5 py-1.5 text-[11px] text-white shadow-raised group-hover:block group-focus-visible:block">
                  {a.subjectName} · <Pct value={p} /> · {formatDate(a.finishedAt)}
                </span>
                <span
                  className="w-full max-w-9 rounded-t-[4px] bg-teal-600 transition-colors group-hover:bg-teal-700"
                  style={{ height: `${Math.max(p, 3)}%` }}
                />
              </Link>
            );
          })}
        </div>
      </div>
      <details className="mt-5 text-sm">
        <summary className="cursor-pointer font-medium text-teal-700 hover:underline">عرض الأرقام كجدول</summary>
        <table className="mt-3 w-full text-start">
          <thead className="text-xs text-muted">
            <tr className="border-b border-line">
              <th className="py-2 text-start font-medium">المادة</th>
              <th className="py-2 text-start font-medium">التاريخ</th>
              <th className="py-2 text-end font-medium">الدرجة</th>
            </tr>
          </thead>
          <tbody>
            {[...recent].reverse().map((a) => (
              <tr key={a.id} className="border-b border-line last:border-0">
                <td className="py-2 text-ink">{a.subjectName}</td>
                <td className="py-2 text-muted">{formatDate(a.finishedAt)}</td>
                <td className="py-2 text-end font-semibold text-ink tabular">{scorePercent(a)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Card>
  );
}
