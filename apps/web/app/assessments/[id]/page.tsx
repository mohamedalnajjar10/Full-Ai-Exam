"use client";
import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Target, FileQuestion, ArrowRight } from "lucide-react";
import type {
  AssessmentAttemptDetailResponse,
  SubmitAssessmentResponse,
} from "@ai-exam/types";
import AppShell from "@/components/layout/AppShell";
import EmptyState from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import AssessmentRunner from "@/components/assessment/AssessmentRunner";
import AssessmentDiagnosticView from "@/components/assessment/AssessmentDiagnosticView";
import { getAssessmentAttempt, describeError } from "@/lib/api";

interface AssessmentAttemptPageProps {
  params: Promise<{ id: string }>;
}

export default function AssessmentAttemptPage({ params }: AssessmentAttemptPageProps) {
  const resolvedParams = use(params);
  const attemptId = resolvedParams.id;
  const router = useRouter();

  const [attempt, setAttempt] = useState<AssessmentAttemptDetailResponse | null>(null);
  const [completedResult, setCompletedResult] = useState<SubmitAssessmentResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    getAssessmentAttempt(attemptId)
      .then((data) => {
        if (cancelled) return;
        setAttempt(data);
        setIsLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(describeError(err));
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  return (
    <AppShell>
      {isLoading ? (
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center py-20 text-center">
          <div className="h-14 w-14 animate-spin rounded-full border-4 border-teal-200 border-t-teal-600 mb-4" />
          <p className="text-sm font-semibold text-navy-900">جاري تحميل بيانات الاختبار...</p>
        </div>
      ) : error || !attempt ? (
        <div className="mx-auto max-w-lg py-12">
          <EmptyState
            icon={FileQuestion}
            tone="error"
            title="تعذّر الوصول إلى جلسة التقييم"
            description={error || "قد تكون هذه المحاولة غير موجودة أو تابعة لحساب طالب آخر."}
            actionHref="/assessments"
            actionLabel="العودة لمركز التقييم"
          />
        </div>
      ) : attempt.status === "PENDING" && !completedResult ? (
        <AssessmentRunner
          attemptId={attempt.id}
          subjectName={attempt.assessment.subject?.name || "المادة"}
          difficultyLevel={attempt.assessment.difficultyLevel}
          questions={attempt.assessment.questions}
          onCompleted={(res) => {
            setCompletedResult(res);
          }}
        />
      ) : (
        <AssessmentDiagnosticView
          data={completedResult || attempt}
          subjectName={attempt.assessment.subject?.name || "المادة"}
          subjectId={attempt.assessment.subjectId}
          onRetake={() => {
            router.push(`/assessments?subject=${attempt.assessment.subjectId}`);
          }}
        />
      )}
    </AppShell>
  );
}
