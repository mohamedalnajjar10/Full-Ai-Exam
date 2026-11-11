"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, CalendarCheck, ChevronDown, Crown, GraduationCap, LogOut, ShieldCheck, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Avatar from "@/components/ui/Avatar";
import { branchLabel } from "@/lib/branch";

export default function UserMenu() {
  const { user, selectedBranch, logout, hasParentSession } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleLogout() {
    setOpen(false);
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div ref={ref} className="relative hidden lg:block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="قائمة الحساب"
        className="flex items-center gap-2 rounded-xl border border-line bg-white py-1 pe-2.5 ps-1 transition-colors hover:border-navy-200 hover:bg-canvas"
      >
        <Avatar name={user?.name} src={user?.avatar} size={32} />
        <span className="max-w-[120px] truncate text-sm font-semibold text-navy-900">{user?.name?.split(" ")[0] ?? "حسابي"}</span>
        <ChevronDown size={15} className={`text-subtle transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <div
        role="menu"
        className={`absolute end-0 top-full z-50 mt-2 w-72 origin-top rounded-2xl border border-line bg-white p-2 shadow-float transition-all duration-150 ${
          open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0"
        }`}
      >
        <div className="flex items-center gap-3 p-3">
          <Avatar name={user?.name} src={user?.avatar} size={42} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-navy-900">{user?.name ?? "المستخدم"}</p>
              <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">طالب</span>
            </div>
            {user?.email && (
              <p dir="ltr" className="truncate text-end text-xs text-muted">
                {user.email}
              </p>
            )}
          </div>
        </div>

        {selectedBranch && (
          <p className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-2 text-xs text-teal-800">
            <GraduationCap size={15} />
            <b className="font-semibold">{branchLabel(selectedBranch.name)}</b>
          </p>
        )}

        {/* التبديل بين جلسة الطالب وبوابة ولي الأمر (Persona Switcher) */}
        <div className="mx-2 my-1 rounded-xl border border-teal-100 bg-teal-50/50 p-2">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-teal-900/80">
            <span>جلسة العائلة المشتركة</span>
            {hasParentSession && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700">
                <span className="h-1.5 w-1.5 rounded-full bg-teal-600 animate-pulse" />
                نشطة
              </span>
            )}
          </div>
          <Link
            href={hasParentSession ? "/parent/dashboard" : "/parent/login"}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between gap-2 rounded-lg border border-teal-200/60 bg-white px-2.5 py-2 text-xs font-semibold text-navy-900 shadow-xs transition-colors hover:bg-teal-50"
          >
            <div className="flex items-center gap-2">
              <Users size={15} className="text-teal-600" />
              <span>{hasParentSession ? "التبديل إلى بوابة ولي الأمر" : "دخول بوابة ولي الأمر"}</span>
            </div>
            <ArrowLeft size={13} className="text-muted" />
          </Link>
        </div>

        <div className="my-1 h-px bg-line" />

        {[
          { href: "/account", label: "الحساب والأمان", icon: ShieldCheck },
          { href: "/subscriptions", label: "باقات الاشتراك ورصيدي 💎", icon: Crown },
          { href: "/exams/results", label: "نتائجي", icon: BarChart3 },
          { href: "/daily-plan", label: "خطة اليوم", icon: CalendarCheck },
        ].map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink transition-colors hover:bg-canvas"
          >
            <Icon size={17} className="text-muted" />
            {label}
          </Link>
        ))}

        <div className="my-1 h-px bg-line" />

        <button
          type="button"
          role="menuitem"
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
        >
          <LogOut size={17} />
          تسجيل الخروج
        </button>
      </div>
    </div>
  );
}
