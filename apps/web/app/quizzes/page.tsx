"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Layers, ListChecks } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import QuizFlow from "@/components/quiz/QuizFlow";

function QuizzesContent() {
  const params = useSearchParams();
  return (
    <QuizFlow
      // إعادة التركيب عند تغيّر الرابط لبدء تدفق جديد
      key={params.toString()}
      initialSubjectId={params.get("subject")}
      retakeAttemptId={params.get("retake")}
      fromHandoff={params.get("from") === "chat"}
    />
  );
}

export default function QuizzesPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="الكويزات"
        icon={ListChecks}
        title="اختبر نفسك بكويز ذكي"
        description="اختر المادة ومستوى الصعوبة، وسيجهّز لك مسار التميز AI أسئلة جديدة على نمط امتحانات التوجيهي مع شرح لكل إجابة."
        actions={
          <ButtonLink href="/quizzes/by-subject" variant="secondary">
            <Layers size={16} />
            مستواي حسب المادة
          </ButtonLink>
        }
      />
      <div className="mt-8">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-white" />}>
          <QuizzesContent />
        </Suspense>
      </div>
    </AppShell>
  );
}
