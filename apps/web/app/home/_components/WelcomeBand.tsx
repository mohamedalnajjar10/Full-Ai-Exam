"use client";
import { Bot, GraduationCap, ListChecks } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { ButtonLink } from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { branchLabel } from "@/lib/branch";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "صباح الخير";
  if (h < 18) return "مساء الخير";
  return "مساء النور";
}

export default function WelcomeBand() {
  const { user, selectedBranch } = useAuth();
  const firstName = user?.name?.split(" ")[0];
  const dateLabel = new Date().toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section className="border-b border-line bg-white">
      <div className="container-page flex flex-col gap-6 py-8 md:flex-row md:items-end md:justify-between lg:py-10">
        <div>
          {/* الوقت والتاريخ من ساعة جهاز الطالب — ممكن يختلفوا عن السيرفر */}
          <p className="text-sm text-muted" suppressHydrationWarning>
            {dateLabel}
          </p>
          <h1 className="mt-1.5 text-[26px] font-bold leading-snug text-navy-900 sm:text-[30px]" suppressHydrationWarning>
            {greeting()}{firstName ? `، ${firstName}` : ""}
          </h1>
          {selectedBranch && (
            <Badge tone="teal" icon={<GraduationCap size={14} />} className="mt-3">
              {branchLabel(selectedBranch.name)}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink href="/quizzes" size="lg">
            <ListChecks size={18} />
            ابدأ كويزاً
          </ButtonLink>
          <ButtonLink href="/ai-path" variant="secondary" size="lg">
            <Bot size={18} />
            اسأل مسار التميز AI
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
