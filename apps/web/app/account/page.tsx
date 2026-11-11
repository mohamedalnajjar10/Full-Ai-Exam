"use client";
import { ShieldCheck } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import ProfileSection from "./_components/ProfileSection";
import BranchSection from "./_components/BranchSection";
import PasswordSection from "./_components/PasswordSection";
import TwoFactorSection from "./_components/TwoFactorSection";
import SessionsSection from "./_components/SessionsSection";
import { StudentFamilyLinkCard } from "@/components/parent";

const NAV = [
  { id: "profile", label: "الملف الشخصي" },
  { id: "parent-link", label: "متابعة ولي الأمر" },
  { id: "branch", label: "الفرع الدراسي" },
  { id: "password", label: "كلمة المرور" },
  { id: "two-factor", label: "المصادقة الثنائية" },
  { id: "sessions", label: "الأجهزة" },
];

export default function AccountPage() {
  return (
    <AppShell>
      <PageHeader
        eyebrow="حسابي"
        icon={ShieldCheck}
        title="الحساب والأمان"
        description="بياناتك، فرعك الدراسي، وطرق حماية حسابك — في مكان واحد."
      />
      <div className="mt-8 grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="أقسام الحساب" className="hidden lg:block">
          <ul className="sticky top-24 flex flex-col gap-1">
            {NAV.map((n) => (
              <li key={n.id}>
                <a href={`#${n.id}`} className="block rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-white hover:text-navy-900">
                  {n.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 flex-col gap-6">
          <ProfileSection />
          <div id="parent-link">
            <StudentFamilyLinkCard />
          </div>
          <BranchSection />
          <PasswordSection />
          <TwoFactorSection />
          <SessionsSection />
        </div>
      </div>
    </AppShell>
  );
}
