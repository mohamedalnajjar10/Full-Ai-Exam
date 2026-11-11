"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, ChevronsLeft, ChevronsRight, CornerDownLeft, ExternalLink, FlaskConical, Lock, Menu, Search, ShieldAlert, X } from "lucide-react";
import Avatar from "@/components/ui/Avatar";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import { ALL_NAV, NAV, QUICK_ACTIONS, can, canSee, isStaff, navFor, type NavItem } from "./nav";
import { Kbd } from "./ui";
import { getSummary } from "../_data/knowledge";

/**
 * عدّادات حية للقائمة: مهام المعالجة الجارية والأسئلة بانتظار المراجعة.
 * الفشل هون صامت — العدّاد مجرد تلميح، والصفحات نفسها بتبيّن الخطأ.
 */
function useLiveBadges(enabled: boolean): Record<string, string | undefined> {
  const [badges, setBadges] = useState<Record<string, string | undefined>>({});
  useEffect(() => {
    // العدّادات من قسم المحتوى — حساب بلا صلاحياته كان ياخد 403 كل 30 ثانية
    if (!enabled) return;
    let alive = true;
    const load = () =>
      getSummary()
        .then((s) => {
          if (!alive) return;
          setBadges({
            "/admin/ingestion": s.runningJobs ? String(s.runningJobs) : undefined,
            "/admin/review": s.pendingReview ? String(s.pendingReview) : undefined,
          });
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [enabled]);
  return badges;
}

function isActive(pathname: string, href: string) {
  const path = href.split(/[?#]/)[0];
  return path === "/admin" ? pathname === "/admin" : pathname === path || pathname.startsWith(`${path}/`);
}

/** الرابط الأطول المطابق هو النشط — /admin/ai/prompts مش /admin/ai */
function useActiveHref(pathname: string) {
  return useMemo(
    () =>
      ALL_NAV.filter((i) => isActive(pathname, i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href,
    [pathname],
  );
}

function SidebarNav({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const active = useActiveHref(pathname);
  const { user } = useAuth();
  const live = useLiveBadges(can(user, "content.upload", "content.review", "bank.edit"));
  return (
    <nav aria-label="أقسام لوحة التحكم" className="flex flex-col gap-5">
      {navFor(user).map((group) => (
        <div key={group.section}>
          {!collapsed && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide text-navy-300">{group.section}</p>}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const on = item.href === active;
              const Icon = item.icon;
              const badge = item.href in live ? live[item.href] : item.badge;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    title={collapsed ? item.label : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
                      on ? "bg-white/10 font-semibold text-white" : "text-navy-100/80 hover:bg-white/5 hover:text-white"
                    } ${collapsed ? "justify-center px-0" : ""}`}
                  >
                    {on && <span className="absolute inset-y-1.5 start-0 w-[3px] rounded-full bg-teal-400" aria-hidden />}
                    <Icon size={18} strokeWidth={on ? 2.1 : 1.8} className="shrink-0" />
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && badge && (
                      <span className="tabular rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-teal-200">{badge}</span>
                    )}
                    {!collapsed && !badge && item.mock && (
                      <span
                        className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-200"
                        title="شاشة تجريبية (بيانات محاكاة)"
                      >
                        تجريبي
                      </span>
                    )}
                    {collapsed && item.mock && (
                      <span
                        className="absolute end-2 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400"
                        title="شاشة تجريبية"
                        aria-hidden
                      />
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function BrandBlock({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/admin" className={`flex items-center gap-2.5 ${collapsed ? "justify-center" : ""}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400 to-teal-600 text-[15px] font-bold text-white shadow-sm">
        م
      </span>
      {!collapsed && (
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-[15px] font-bold text-white">مسار التميز</span>
          <span className="block text-[11px] text-navy-300">لوحة التحكم</span>
        </span>
      )}
    </Link>
  );
}

/* ───────── لوحة الأوامر ───────── */

// المحتوى بينركّب مع كل فتح، فالبحث والمؤشر بيبدأوا من الصفر بدون effect
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  return open ? <CommandPaletteBody onClose={onClose} /> : null;
}

function CommandPaletteBody({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  const results = useMemo(() => {
    const all: (NavItem & { group: string })[] = [
      ...QUICK_ACTIONS.filter((a) => canSee(user, a)).map((a) => ({ ...a, group: "إجراءات سريعة" })),
      ...navFor(user).flatMap((s) => s.items.map((i) => ({ ...i, group: s.section }))),
    ];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter((i) => `${i.label} ${i.keywords ?? ""}`.toLowerCase().includes(term));
  }, [q, user]);

  const go = (item?: NavItem) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade bg-navy-950/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="بحث وأوامر" className="relative w-full max-w-xl animate-rise overflow-hidden rounded-2xl bg-white shadow-float">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="shrink-0 text-subtle" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(results.length - 1, c + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(0, c - 1));
              } else if (e.key === "Enter") go(results[cursor]);
              else if (e.key === "Escape") onClose();
            }}
            placeholder="ابحث عن صفحة أو إجراء…"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-subtle"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-results"
            aria-activedescendant={results[cursor] ? `cmd-${cursor}` : undefined}
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul id="cmd-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-3 py-8 text-center text-sm text-muted">لا نتائج لـ «{q}»</li>}
          {results.map((r, i) => {
            const Icon = r.icon;
            const showGroup = i === 0 || results[i - 1].group !== r.group;
            return (
              <li key={`${r.group}-${r.href}`} role="presentation">
                {showGroup && <p className="px-3 pb-1 pt-2.5 text-[11px] font-semibold text-subtle">{r.group}</p>}
                <button
                  id={`cmd-${i}`}
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => go(r)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm ${i === cursor ? "bg-navy-50 text-navy-900" : "text-ink"}`}
                >
                  <Icon size={17} className="shrink-0 text-muted" />
                  <span className="flex-1">{r.label}</span>
                  {r.mock && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      تجريبي
                    </span>
                  )}
                  {i === cursor && <CornerDownLeft size={14} className="text-subtle" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ───────── الغلاف ───────── */

/** شاشة كاملة لحساب مش من الفريق — الخادم بيرفض كل الطلبات أصلاً */
function NotStaff() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-4">
      <div className="max-w-sm rounded-2xl border border-line bg-white p-8 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
          <ShieldAlert size={22} />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-navy-900">لوحة التحكم لفريق الإدارة فقط</h1>
        <p className="mt-2 text-sm leading-7 text-muted">حسابك لا يملك صلاحية الوصول. إن كنت من الفريق، اطلب من المدير العام منحك دوراً.</p>
        <Link href="/home" className="mt-6 inline-flex rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy-800">
          العودة للمنصة
        </Link>
      </div>
    </div>
  );
}

/** صفحة بالقائمة بس دور الحساب ما بيشملها (رابط مباشر مثلاً) */
function NoPermission({ label }: { label: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-dashed border-navy-200 bg-white p-10 text-center">
      <Lock size={22} className="mx-auto text-subtle" />
      <p className="mt-3 font-semibold text-navy-900">لا تملك صلاحية «{label}»</p>
      <p className="mt-1.5 text-sm text-muted">اطلب من مدير الأدوار إضافتها لدورك.</p>
    </div>
  );
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading && !user) return <Spinner className="min-h-dvh" />;
  if (!isStaff(user)) return <NotStaff />;
  return <StaffShell>{children}</StaffShell>;
}

function StaffShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const activeHref = useActiveHref(pathname);
  const current = ALL_NAV.find((i) => i.href === activeHref);
  const section = NAV.find((s) => s.items.some((i) => i.href === activeHref))?.section;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-dvh bg-canvas">
      {/* الشريط الجانبي — شاشات كبيرة */}
      <aside
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col bg-navy-950 transition-[width] duration-200 lg:flex ${collapsed ? "w-[72px]" : "w-64"}`}
      >
        <div className="flex h-16 items-center border-b border-white/10 px-4">
          <BrandBlock collapsed={collapsed} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-5 [scrollbar-color:var(--color-navy-800)_transparent] [scrollbar-width:thin]">
          <SidebarNav collapsed={collapsed} />
        </div>
        <div className="border-t border-white/10 p-3">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[13px] text-navy-200 hover:bg-white/5 hover:text-white ${collapsed ? "justify-center px-0" : ""}`}
            aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
          >
            {collapsed ? <ChevronsLeft size={17} /> : <ChevronsRight size={17} />}
            {!collapsed && "طي القائمة"}
          </button>
        </div>
      </aside>

      {/* الشريط الجانبي — موبايل */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <div className="absolute inset-0 animate-fade bg-navy-950/50" onClick={() => setMobileOpen(false)} aria-hidden />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] animate-fade flex-col bg-navy-950">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <BrandBlock collapsed={false} />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="إغلاق القائمة" className="rounded-lg p-2 text-navy-200 hover:bg-white/10">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-5">
              <SidebarNav collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-line bg-white/85 px-4 backdrop-blur sm:px-6">
          <button type="button" onClick={() => setMobileOpen(true)} aria-label="فتح القائمة" className="-ms-1 rounded-lg p-2 text-navy-900 hover:bg-navy-50 lg:hidden">
            <Menu size={20} />
          </button>

          <div className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
            {section && <span className="text-subtle">{section}</span>}
            {section && current && <span className="text-navy-200">/</span>}
            {current && <span className="truncate font-medium text-navy-900">{current.label}</span>}
          </div>

          <button
            type="button"
            onClick={() => setCmdOpen(true)}
            className="ms-auto flex h-10 w-full max-w-xs items-center gap-2.5 rounded-xl border border-line bg-canvas px-3 text-sm text-subtle transition-colors hover:border-navy-200 md:ms-6"
          >
            <Search size={16} aria-hidden />
            <span className="flex-1 text-start">بحث وأوامر…</span>
            <span className="hidden items-center gap-1 sm:flex" dir="ltr">
              <Kbd>Ctrl</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <div className="flex items-center gap-1 sm:gap-2 md:ms-auto">
            {current?.mock && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20"
                title="هذه الصفحة غير مربوطة بالخادم بعد — بياناتها تجريبية"
              >
                <FlaskConical size={13} aria-hidden />
                بيانات تجريبية
              </span>
            )}
            <Link href="/home" className="hidden items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] text-muted hover:bg-navy-50 hover:text-navy-900 sm:flex">
              <ExternalLink size={15} aria-hidden />
              الموقع
            </Link>
            <button type="button" aria-label="الإشعارات (3 جديدة)" className="relative rounded-lg p-2 text-navy-900 hover:bg-navy-50">
              <Bell size={19} />
              <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" aria-hidden />
            </button>
            <div className="flex items-center gap-2.5 ps-1">
              <Avatar name={user?.name || user?.email || "?"} size={34} />
              <div className="hidden leading-tight xl:block">
                <p className="text-[13px] font-semibold text-navy-900">{user?.name || user?.email}</p>
                <p className="text-[11px] text-muted">{user?.staffRole?.name ?? "فريق بلا دور"}</p>
              </div>
            </div>
          </div>
        </header>

        <main id="main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[1400px]">
            {current?.mock && canSee(user, current) && (
              <div
                role="status"
                aria-label="تنبيه شاشة تجريبية"
                className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/90 p-4 text-amber-900 shadow-sm"
              >
                <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-amber-950">
                    وضع المعاينة والعرض التجريبي (Mock Simulation)
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-amber-800">
                    هذه الصفحة ({current.label}) مجهزة بواجهات العرض والتفاعل الكاملة، لكن البيانات المعروضة حالياً هي بيانات محاكاة تجريبية وليست متصلة بقاعدة البيانات الفعلية. أي عمليات حفظ أو تعديل تطبق في جلسة المتصفح فقط.
                  </p>
                </div>
              </div>
            )}
            {current && !canSee(user, current) ? <NoPermission label={current.label} /> : children}
          </div>
        </main>
      </div>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  );
}
