// Server Component: المواد والمعلمين بيجوا مع الـ HTML، والباقي (سجل
// الكويزات والخطة) من تخزين المتصفح بعد التحميل.
import type { Metadata } from "next";
import AppShell from "@/components/layout/AppShell";
import QuotaCard from "@/components/quiz/QuotaCard";
import { getServerSession } from "@/lib/session";
import { getSubjectsForBranch, getTeachersPage } from "@/lib/serverData";
import WelcomeBand from "./_components/WelcomeBand";
import StatsRow from "./_components/StatsRow";
import SubjectsPanel from "./_components/SubjectsPanel";
import TodayPlanCard from "./_components/TodayPlanCard";
import RecentAttempts from "./_components/RecentAttempts";
import AssessmentSmartCard from "./_components/AssessmentSmartCard";
import BooksPanel from "./_components/BooksPanel";
import TeachersPanel from "./_components/TeachersPanel";
import AiPromo from "./_components/AiPromo";

export const metadata: Metadata = { title: "لوحتي" };

export default async function HomePage() {
  const user = await getServerSession();
  const [subjects, teachers] = await Promise.all([
    user?.branchId ? getSubjectsForBranch(user.branchId) : Promise.resolve(null),
    getTeachersPage(),
  ]);

  return (
    <AppShell fluid>
      <WelcomeBand />
      <div className="container-page flex flex-col gap-8 py-8 lg:py-10">
        <StatsRow />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <SubjectsPanel initialSubjects={subjects} />
            <BooksPanel initialSubjects={subjects} />
          </div>
          <aside className="flex flex-col gap-6">
            <AssessmentSmartCard />
            <TodayPlanCard />
            <RecentAttempts />
            <QuotaCard />
            <AiPromo />
          </aside>
        </div>
        <TeachersPanel teachers={(teachers ?? []).filter((t) => t.isActive)} />
      </div>
    </AppShell>
  );
}
