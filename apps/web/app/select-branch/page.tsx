"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Atom, BookMarked, Check, Factory, Feather, GraduationCap, LogOut } from "lucide-react";
import AuthShell from "@/components/layout/AuthShell";
import { useAuth } from "@/context/AuthContext";
import { fetchPublic, fetchWithAuth } from "@/lib/apiClient";
import { branchLabel } from "@/lib/branch";
import { SUBJECTS, countAr } from "@/lib/plural";
import { Button } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import Spinner from "@/components/ui/Spinner";

interface Branch {
  id: string;
  name: string;
  _count?: { subjects: number };
}

// كان كل فرع إلو صورة مربوطة باسم "الفرع العلمي"… بس الأسماء بقاعدة
// البيانات "علمي"، فكل الصور كانت ترجع 400 وتظهر مكسورة.
const ICONS: [RegExp, LucideIcon][] = [
  [/علمي/, Atom],
  [/أدبي|ادبي/, Feather],
  [/صناعي|مهني/, Factory],
  [/شرعي/, BookMarked],
];
const iconFor = (name: string) => ICONS.find(([re]) => re.test(name))?.[1] ?? GraduationCap;

export default function SelectBranchPage() {
  const router = useRouter();
  const { isLoggedIn, isLoading: authLoading, logout, selectedBranch: currentBranch, setSelectedBranch, user } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [branchesError, setBranchesError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");

  // غير مسجّل → /login | عنده فرع محفوظ أصلاً → /home مباشرة
  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) router.replace("/login");
    else if (currentBranch) router.replace("/home");
  }, [authLoading, isLoggedIn, currentBranch, router]);

  useEffect(() => {
    if (authLoading || !isLoggedIn || currentBranch) return;
    let cancelled = false;
    (async () => {
      setBranchesLoading(true);
      setBranchesError("");
      try {
        const res = await fetchPublic("/branches", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setBranches(Array.isArray(data) ? data : (data.branches ?? []));
      } catch {
        if (!cancelled) setBranchesError("تعذّر تحميل الفروع. تحقق من اتصالك ثم حدّث الصفحة.");
      } finally {
        if (!cancelled) setBranchesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isLoggedIn, currentBranch]);

  async function save() {
    const chosen = branches.find((b) => b.id === selectedId);
    if (!chosen) return;
    setSaving(true);
    setServerError("");
    const post = (path: string) =>
      fetchWithAuth(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ branchId: chosen.id }) });
    try {
      let res = await post("/branches/select");
      // الفرع محفوظ عالباك اند أصلاً — نجرب endpoint التغيير
      if (res.status === 400) res = await post("/branches/change");

      if (res.ok) {
        setSelectedBranch({ id: chosen.id, name: chosen.name });
        router.push("/home");
        return;
      }
      if (res.status === 401) {
        await logout();
        router.push("/login");
        return;
      }
      setServerError(res.status === 404 ? "الفرع المختار لم يعد متاحاً. اختر فرعاً آخر." : "تعذّر حفظ اختيارك، حاول مرة أخرى.");
    } catch {
      setServerError("تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !isLoggedIn || currentBranch) {
    return <Spinner className="min-h-dvh" />;
  }

  return (
    <AuthShell
      wide
      back={null}
      title={`أهلاً ${user?.name?.split(" ")[0] ?? ""}، ما فرعك الدراسي؟`}
      description="سنجهّز لك مواد فرعك وأسئلته وخطتك اليومية على أساسه."
    >
      <div className="flex flex-col gap-6">
        {branchesLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[92px] animate-pulse rounded-2xl bg-canvas" />
            ))}
          </div>
        ) : branchesError ? (
          <Alert tone="error">{branchesError}</Alert>
        ) : branches.length === 0 ? (
          <Alert tone="info">لا توجد فروع متاحة حالياً. تواصل مع الدعم.</Alert>
        ) : (
          <div role="radiogroup" aria-label="الفرع الدراسي" className="grid gap-3 sm:grid-cols-2">
            {branches.map((b) => {
              const Icon = iconFor(b.name);
              const active = b.id === selectedId;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setSelectedId(b.id)}
                  className={`relative flex items-center gap-4 rounded-2xl border p-5 text-start transition-[border-color,box-shadow,background-color] ${
                    active
                      ? "border-teal-600 bg-teal-50/50 shadow-[0_0_0_1px_var(--color-teal-600)]"
                      : "border-line bg-white hover:border-navy-200 hover:bg-canvas/60"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                      active ? "bg-teal-600 text-white" : "bg-navy-50 text-navy-900"
                    }`}
                  >
                    <Icon size={22} strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-navy-900">{branchLabel(b.name)}</span>
                    {typeof b._count?.subjects === "number" && (
                      <span className="mt-0.5 block text-sm text-muted">{countAr(b._count.subjects, SUBJECTS)}</span>
                    )}
                  </span>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                      active ? "border-teal-600 bg-teal-600 text-white" : "border-navy-200"
                    }`}
                    aria-hidden
                  >
                    {active && <Check size={13} strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {serverError && <Alert tone="error">{serverError}</Alert>}

        <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-line pt-6 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={async () => {
              await logout();
              router.push("/login");
              router.refresh();
            }}
            className="inline-flex items-center justify-center gap-2 text-sm font-medium text-muted hover:text-navy-900"
          >
            <LogOut size={16} />
            تسجيل الخروج
          </button>
          <Button size="lg" onClick={save} disabled={!selectedId} loading={saving} className="sm:min-w-56">
            {saving ? "جاري الحفظ…" : "متابعة إلى لوحتي"}
          </Button>
        </div>
      </div>
    </AuthShell>
  );
}
