"use client";
import Link from "next/link";
import { History } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { DIFFICULTY_LABELS, formatDate, scorePercent, scoreTone, useQuizHistory } from "@/lib/quiz";

export default function RecentAttempts() {
  const { attempts } = useQuizHistory();
  const recent = attempts.slice(0, 4);

  return (
    <Card>
      <CardHeader
        icon={<History size={19} strokeWidth={1.75} />}
        title="آخر محاولاتك"
        action={
          recent.length > 0 && (
            <Link href="/exams/archive" className="text-sm font-semibold text-teal-700 hover:underline">
              الأرشيف
            </Link>
          )
        }
      />
      {recent.length === 0 ? (
        <div className="rounded-xl border border-dashed border-navy-200 p-5 text-center">
          <p className="text-sm leading-7 text-muted">لم تحلّ أي كويز بعد. أول كويز يأخذ خمس دقائق.</p>
          <ButtonLink href="/quizzes" size="sm" className="mt-3">
            ابدأ الآن
          </ButtonLink>
        </div>
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
  );
}
