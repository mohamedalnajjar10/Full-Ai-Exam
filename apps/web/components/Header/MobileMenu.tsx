"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, GraduationCap, LogOut, Menu, Users, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import Logo from "@/components/ui/Logo";
import Avatar from "@/components/ui/Avatar";
import { branchLabel } from "@/lib/branch";
import { buttonClass } from "@/components/ui/Button";
import { accountLink, authedGroups, authedHome, authedTrailingLinks, guestLinks, isActivePath, type NavItem } from "./navConfig";

function DrawerLink({ link, pathname, onNavigate }: { link: NavItem; pathname: string; onNavigate: () => void }) {
  const active = isActivePath(pathname, link.href);
  const Icon = link.icon;
  return (
    <Link
      href={link.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium transition-colors ${
        active ? "bg-navy-50 text-navy-900" : "text-ink active:bg-canvas"
      }`}
    >
      {Icon && <Icon size={19} strokeWidth={1.75} className={active ? "text-navy-900" : "text-muted"} />}
      {link.label}
    </Link>
  );
}

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { isLoggedIn, isLoading, user, selectedBranch, logout, hasParentSession } = useAuth();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleResize() {
      if (window.innerWidth >= 1024) setOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const close = () => setOpen(false);

  async function handleLogout() {
    setOpen(false);
    // لازم ننتظر: لو انتقلنا قبل ما السيرفر يمسح الكوكي، proxy بيشوف
    // الجلسة لسا موجودة وبيرجّع الطالب على /home
    await logout();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="فتح القائمة"
        aria-expanded={open}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-navy-900 transition-colors active:bg-navy-50"
      >
        <Menu size={24} />
      </button>

      {/* نرسم الدرج داخل body: الهيدر فيه backdrop-filter وهذا يجعل عناصر
          position:fixed بداخله تتموضع نسبةً للهيدر (ارتفاعه 64px) لا للشاشة */}
      {mounted &&
        createPortal(
          <div className="lg:hidden">
            <div
              onClick={close}
              aria-hidden
              className={`fixed inset-0 z-50 bg-navy-950/40 backdrop-blur-[2px] transition-opacity duration-300 ${
                open ? "opacity-100" : "pointer-events-none opacity-0"
              }`}
            />

            <div
              role="dialog"
              aria-modal="true"
              aria-label="قائمة التنقل"
              inert={!open}
              className={`fixed inset-y-0 start-0 z-50 flex h-dvh w-[88%] max-w-sm flex-col bg-white shadow-float transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                open ? "translate-x-0" : "translate-x-full"
              }`}
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
                <Logo size="sm" href={isLoggedIn ? "/home" : "/"} />
                <button
                  type="button"
                  onClick={close}
                  aria-label="إغلاق القائمة"
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors active:bg-canvas"
                >
                  <X size={20} />
                </button>
              </div>

              <nav aria-label="التنقل" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-4">
                {isLoading ? (
                  <div className="flex flex-col gap-3 px-3 pt-2">
                    {[70, 50, 60].map((w) => (
                      <div key={w} className="h-4 animate-pulse rounded bg-canvas" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                ) : isLoggedIn ? (
                  <>
                    <DrawerLink link={authedHome} pathname={pathname} onNavigate={close} />
                    {authedGroups.map((g) => (
                      <div key={g.label} className="mt-3">
                        <p className="px-3 pb-1 text-xs font-semibold text-subtle">{g.label}</p>
                        {g.items.map((item) => (
                          <DrawerLink key={item.href} link={item} pathname={pathname} onNavigate={close} />
                        ))}
                      </div>
                    ))}
                    <div className="mt-3">
                      <p className="px-3 pb-1 text-xs font-semibold text-subtle">أدوات الدراسة</p>
                      {authedTrailingLinks.map((link) => (
                        <DrawerLink key={link.href} link={link} pathname={pathname} onNavigate={close} />
                      ))}
                    </div>
                    <div className="mt-3">
                      <p className="px-3 pb-1 text-xs font-semibold text-subtle">حسابي</p>
                      <DrawerLink link={accountLink} pathname={pathname} onNavigate={close} />
                    </div>
                  </>
                ) : (
                  guestLinks.map((link) => <DrawerLink key={link.href} link={link} pathname={pathname} onNavigate={close} />)
                )}
              </nav>

              <div
                className="flex shrink-0 flex-col gap-3 border-t border-line p-4"
                style={{
                  paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
                }}
              >
                {isLoading ? null : isLoggedIn ? (
                  <>
                    <div className="flex items-center gap-3 rounded-xl bg-canvas p-3">
                      <Avatar name={user?.name} src={user?.avatar} size={40} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy-900">{user?.name ?? "المستخدم"}</p>
                        {selectedBranch && (
                          <p className="flex items-center gap-1 text-xs text-muted">
                            <GraduationCap size={13} className="text-teal-700" />
                            {branchLabel(selectedBranch.name)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* التبديل لبوابة ولي الأمر على الأجهزة المشتركة */}
                    <Link
                      href={hasParentSession ? "/parent/dashboard" : "/parent/login"}
                      onClick={close}
                      className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-2.5 text-xs font-semibold text-teal-900 transition-colors hover:bg-teal-100"
                    >
                      <span className="flex items-center gap-2">
                        <Users size={16} className="text-teal-700" />
                        <span>{hasParentSession ? "التبديل إلى بوابة ولي الأمر" : "دخول بوابة ولي الأمر"}</span>
                      </span>
                      <ArrowLeft size={14} className="text-teal-600" />
                    </Link>

                    <button
                      type="button"
                      onClick={handleLogout}
                      className={buttonClass({
                        variant: "secondary",
                        block: true,
                        className: "text-rose-600",
                      })}
                    >
                      <LogOut size={16} />
                      تسجيل الخروج
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/register" onClick={close} className={buttonClass({ block: true, size: "lg" })}>
                      أنشئ حسابك مجاناً
                    </Link>
                    <Link
                      href="/login"
                      onClick={close}
                      className={buttonClass({
                        variant: "secondary",
                        block: true,
                        size: "lg",
                      })}
                    >
                      تسجيل الدخول
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
