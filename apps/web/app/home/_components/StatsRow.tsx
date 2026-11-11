"use client";
import { useMemo } from "react";
import { ChartColumn, Flame, Target, Trophy } from "lucide-react";
import { computeStreak, scorePercent, useQuizHistory } from "@/lib/quiz";
import { QUESTIONS, countAr } from "@/lib/plural";

export default function StatsRow() {
  const { attempts } = useQuizHistory();

  const stats = useMemo(() => {
    const correct = attempts.reduce((s, a) => s + a.correct, 0);
    const total = attempts.reduce((s, a) => s + a.total, 0);
    return [
      { icon: Target, label: "كويزات محلولة", value: String(attempts.length), sub: countAr(total, QUESTIONS) },
      { icon: ChartColumn, label: "المعدل العام", value: attempts.length ? `${scorePercent({ correct, total })}%` : "—", sub: `${correct} إجابة صحيحة` },
      { icon: Trophy, label: "أفضل نتيجة", value: attempts.length ? `${Math.max(...attempts.map(scorePercent))}%` : "—", sub: "في كويز واحد" },
      { icon: Flame, label: "أيام متتالية", value: String(computeStreak(attempts)), sub: "حافظ على السلسلة" },
    ];
  }, [attempts]);

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
      {stats.map(({ icon: Icon, label, value, sub }) => (
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
  );
}
