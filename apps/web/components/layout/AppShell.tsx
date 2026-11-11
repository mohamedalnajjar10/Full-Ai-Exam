"use client";
// غلاف صفحات الطالب المسجّل: يحمي الصفحة (تسجيل دخول + فرع) ويضيف الهيدر والفوتر
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Header from "@/components/Header/Header";
import Footer from "@/components/Footer/Footer";
import Spinner from "@/components/ui/Spinner";

export default function AppShell({
  children,
  requireBranch = true,
  bare = false,
  fluid = false,
}: {
  children: React.ReactNode;
  requireBranch?: boolean;
  /** شاشة كاملة بدون حاوية ولا فوتر — للمحادثة */
  bare?: boolean;
  /** بدون حاوية بس مع الفوتر — للصفحات يلي فيها أشرطة بعرض الشاشة */
  fluid?: boolean;
}) {
  const router = useRouter();
  const { isLoggedIn, isLoading, selectedBranch } = useAuth();
  const blocked = !isLoggedIn || (requireBranch && !selectedBranch);

  useEffect(() => {
    if (isLoading) return;
    if (!isLoggedIn) router.replace("/login");
    else if (requireBranch && !selectedBranch) router.replace("/select-branch");
  }, [isLoading, isLoggedIn, selectedBranch, requireBranch, router]);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <Header />
      <main id="main" className="flex-1">
        {isLoading || blocked ? (
          <Spinner className="min-h-[60vh]" />
        ) : bare || fluid ? (
          children
        ) : (
          <div className="container-page py-8 lg:py-10">{children}</div>
        )}
      </main>
      {!bare && <Footer compact />}
    </div>
  );
}
