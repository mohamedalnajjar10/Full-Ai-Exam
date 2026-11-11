"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Target, Clock, ArrowLeft, Sparkles, CheckCircle2 } from "lucide-react";
import type { AssessmentHistoryItem } from "@ai-exam/types";
import { Card } from "@/components/ui/Card";
import { ButtonLink } from "@/components/ui/Button";
import { getAssessmentHistory } from "@/lib/api";
import { formatDate } from "@/lib/quiz";
import { subscribeToQuotaChanges } from "@/lib/quotaSync";

export default function AssessmentSmartCard() {
  const [pendingAttempt, setPendingAttempt] = useState<AssessmentHistoryItem | null>(null);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      getAssessmentHistory({ limit: 5 })
        .then((res) => {
          if (cancelled) return;
          const pending = res.data.find((a) => a.status === "PENDING");
          const completed = res.data.filter((a) => a.status === "COMPLETED").length;
          setPendingAttempt(pending || null);
          setCompletedCount(completed);
          setIsLoading(false);
        })
        .catch(() => {
          if (!cancelled) setIsLoading(false);
        });
    };

    refresh();
    const unsub = subscribeToQuotaChanges(() => {
      refresh();
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (isLoading) {
    return <div className="h-44 animate-pulse rounded-2xl bg-white border border-line" />;
  }

  // الحالة الأولى: وجود اختبار معلّق يحتاج لاستئناف (أولوية استرجاع المحاولة)
  if (pendingAttempt) {
    return (
      <Card className="border-amber-200 bg-amber-50/40 relative overflow-hidden">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Clock size={20} className="animate-pulse" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
              تقييم معلّق بحاجة لإكمال
            </span>
            <h4 className="mt-1 font-bold text-sm text-navy-900 truncate">
              {pendingAttempt.subject.name}
            </h4>
            <p className="mt-0.5 text-xs text-muted">
              بدأت المحاولة في {formatDate(pendingAttempt.startedAt, true)}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs leading-5 text-ink/80">
          إجاباتك السابقة محفوظة بأمان على هذا الجهاز. استكمل الأسئلة المتبقية لتحصل على تقرير تشخيصي متكامل.
        </p>

        <div className="mt-4">
          <ButtonLink
            href={`/assessments/${pendingAttempt.id}`}
            variant="accent"
            className="w-full justify-center gap-2 text-xs font-bold"
          >
            استئناف الاختبار الآن
            <ArrowLeft size={14} />
          </ButtonLink>
        </div>
      </Card>
    );
  }

  // الحالة الثانية: لا يوجد اختبار معلّق — بطاقة دعوة للتقييم المعرفي
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Target size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-navy-900">تقييم القدرات المعرفية</p>
          <p className="text-xs text-muted">معايير هرم بلوم بالذكاء الاصطناعي</p>
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-muted">
        اختبر مستواك عبر 5 أسئلة تشخيصية شاملة لاكتشاف فجوات التعلم ورسم خطتك العلاجية.
      </p>

      {completedCount > 0 && (
        <div className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-teal-800">
          <CheckCircle2 size={14} className="text-teal-600" />
          <span>أنجزت {completedCount} تقييمات سابقة بنجاح</span>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <ButtonLink
          href="/assessments"
          className="flex-1 justify-center gap-1.5 text-xs font-semibold"
        >
          <Sparkles size={14} />
          ابدأ تقييم قدراتك
        </ButtonLink>
        <Link
          href="/assessments"
          className="rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted transition-colors hover:bg-canvas hover:text-navy-900"
        >
          السجل
        </Link>
      </div>
    </Card>
  );
}
