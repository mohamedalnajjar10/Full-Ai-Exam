"use client";
import Link from "next/link";
import { CalendarCheck, Check } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { useDailyPlan } from "@/lib/dailyPlan";

export default function TodayPlanCard() {
  const { tasks, isDone, toggle, completed, total, percent, isLoading } = useDailyPlan();
  const upcoming = tasks.slice(0, 4);

  return (
    <Card>
      <CardHeader
        icon={<CalendarCheck size={19} strokeWidth={1.75} />}
        title="خطة اليوم"
        description={total ? `${completed} من ${total} مهام مكتملة` : "مهام مقترحة حسب مستواك"}
        action={
          <Link href="/daily-plan" className="text-sm font-semibold text-teal-700 hover:underline">
            الخطة كاملة
          </Link>
        }
      />
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="تقدّم خطة اليوم">
        <div className="h-full rounded-full bg-teal-600 transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-lg bg-canvas" />
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {upcoming.map((t) => {
            const done = isDone(t);
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-lg px-1 py-2">
                <button
                  type="button"
                  onClick={() => toggle(t.id)}
                  aria-pressed={done}
                  aria-label={done ? `إلغاء إكمال: ${t.title}` : `تعليم كمكتملة: ${t.title}`}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    done ? "border-teal-600 bg-teal-600 text-white" : "border-navy-200 hover:border-teal-600"
                  }`}
                >
                  {done && <Check size={11} strokeWidth={3.5} />}
                </button>
                {t.href && !done ? (
                  <Link href={t.href} className="min-w-0 flex-1 truncate text-sm text-ink hover:text-navy-900 hover:underline">
                    {t.title}
                  </Link>
                ) : (
                  <span className={`min-w-0 flex-1 truncate text-sm ${done ? "text-subtle line-through" : "text-ink"}`}>{t.title}</span>
                )}
                <span className="shrink-0 text-xs text-subtle tabular">{t.minutes} د</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
