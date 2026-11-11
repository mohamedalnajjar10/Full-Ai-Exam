"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { AuthUser, BranchSummary } from "@ai-exam/types";
import { fetchWithAuth, logout as logoutRequest } from "@/lib/apiClient";
import { getParentDeviceTrustToken } from "@/lib/parentStorage";

export function notifyParentAuthChange(active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("parent-auth-change", { detail: { active } }),
  );
}

interface AuthContextValue {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  selectedBranch: BranchSummary | null;
  /** مؤشر وجود جلسة ولي أمر نشطة بالتوازي على نفس الجهاز */
  hasParentSession: boolean;
  /** يعيد جلب الجلسة من السيرفر بعد تسجيل دخول أو تغيير فرع. */
  refresh: () => void;
  logout: () => Promise<void>;
  setSelectedBranch: (branch: BranchSummary) => void;
  /** تحديث مؤشر جلسة ولي الأمر */
  setHasParentSession: (active: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * الجلسة صارت تُقرأ من السيرفر، مش من localStorage.
 *
 * قبل: التوكن كان متخزّن بـ localStorage، فأي XSS بياخد الحساب كامل،
 * وما كان في طريقة السيرفر يعرف مين المستخدم — لهيك كل صفحة كانت
 * "use client" وكانت تستنى hydration + طلب /users/me قبل ما ترسم شي.
 *
 * هلق الكوكي httpOnly هي مصدر الحقيقة. الـ AuthProvider بياخد القيمة
 * الأولية من Server Component، فأول رسمة بتكون صح بدون أي انتظار.
 */
export function AuthProvider({
  children,
  initialUser = null,
  hasSessionCookie = true,
  initialHasParentSession = false,
}: {
  children: React.ReactNode;
  /** بيجي من الـ layout (Server Component) — بيلغي وميض "مش مسجّل دخول". */
  initialUser?: AuthUser | null;
  /** false لما السيرفر شاف إنو ما في ولا كوكي جلسة — يعني زائر أكيد. */
  hasSessionCookie?: boolean;
  /** هل توجد كوكي جلسة لولي الأمر متزامنة على نفس المتصفح */
  initialHasParentSession?: boolean;
}) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [hasParentSession, setHasParentSession] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return (
        initialHasParentSession || Boolean(getParentDeviceTrustToken())
      );
    }
    return initialHasParentSession;
  });
  // المتصفح لازم يتأكد بنفسه بس إذا في كوكي والسيرفر ما قدر يقرأ منها
  // مستخدم — عادةً access_token انتهى (ساعة) والـ refresh_token لسا صالح.
  const needsClientCheck = initialUser === null && hasSessionCookie;
  const [isLoading, setIsLoading] = useState(needsClientCheck);

  const loadSession = useCallback(async () => {
    try {
      const res = await fetchWithAuth("/users/me");
      if (res.ok) {
        setUser((await res.json()) as AuthUser);
      } else if (res.status === 401) {
        // التوكن منتهي أو ملغي — منطلع من الحالة "مسجّل دخول"
        setUser(null);
      }
    } catch (error) {
      console.error("تعذر قراءة الجلسة:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // لو السيرفر ما عطانا مستخدم رغم وجود كوكي، منتأكد بأنفسنا مرة وحدة
    // eslint-disable-next-line react-hooks/set-state-in-effect -- جلب أولي للجلسة من الباك اند
    if (needsClientCheck) void loadSession();

    const onAuthChange = () => void loadSession();
    window.addEventListener("auth-change", onAuthChange);

    const onParentAuthChange = (e?: Event) => {
      const customEvent = e as CustomEvent<{ active?: boolean }>;
      if (customEvent?.detail?.active !== undefined) {
        setHasParentSession(customEvent.detail.active);
      } else {
        const hasToken = typeof window !== "undefined" && Boolean(getParentDeviceTrustToken());
        setHasParentSession(hasToken);
      }
    };

    window.addEventListener("parent-auth-change", onParentAuthChange);
    window.addEventListener("storage", onParentAuthChange);

    return () => {
      window.removeEventListener("auth-change", onAuthChange);
      window.removeEventListener("parent-auth-change", onParentAuthChange);
      window.removeEventListener("storage", onParentAuthChange);
    };
  }, [needsClientCheck, loadSession]);

  const logout = useCallback(async () => {
    await logoutRequest();
    setUser(null);
  }, []);

  const setSelectedBranch = useCallback((branch: BranchSummary) => {
    setUser((current) =>
      current ? { ...current, branchId: branch.id, branch } : current,
    );
  }, []);

  // بدون useMemo هالكائن بينعمل من جديد كل render، فكل مستهلك بيعيد الرسم
  const value = useMemo<AuthContextValue>(
    () => ({
      isLoggedIn: user !== null,
      isLoading,
      user,
      selectedBranch: user?.branch ?? null,
      hasParentSession,
      refresh: () => void loadSession(),
      logout,
      setSelectedBranch,
      setHasParentSession,
    }),
    [user, isLoading, loadSession, logout, setSelectedBranch, hasParentSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth لازم يستخدم جوا AuthProvider");
  return ctx;
}
