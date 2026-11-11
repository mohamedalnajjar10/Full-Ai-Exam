"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, ShieldAlert } from "lucide-react";
import AuthShell from "@/components/layout/AuthShell";
import { ButtonLink } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { fetchWithAuth, notifyAuthChange, resetRefreshCooldown } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import TwoFactorStep, { type LoginResult } from "@/components/auth/TwoFactorStep";

/**
 * تحليل رسالة الخطأ القادمة من الباك اند وتقديم رسالة واضحة للمستخدم بالعربية.
 */
function describeError(error: string): { title: string; message: string; isSuspended: boolean } {
  // فحص الحساب الموقوف
  if (/إيقاف|موقوف|suspended/i.test(error)) {
    return {
      title: "الحساب موقوف",
      message: "تم إيقاف هذا الحساب من قِبل إدارة المنصة. يرجى التواصل مع الدعم الفني لمزيد من المعلومات.",
      isSuspended: true,
    };
  }

  // إعدادات الخادم
  if (/client.?id|configur|not set|missing/i.test(error)) {
    return {
      title: "خدمة Google غير مفعلة",
      message: "تسجيل الدخول عبر Google غير مفعّل على هذا الخادم حالياً. يرجى استخدام البريد الإلكتروني وكلمة المرور.",
      isSuspended: false,
    };
  }

  // إلغاء المستخدم للطلب
  if (/cancel|access_denied|incomplete/i.test(error)) {
    return {
      title: "أُلغي تسجيل الدخول",
      message: "أُلغي تسجيل الدخول عبر Google قبل اكتماله. يمكنك المحاولة مرة أخرى في أي وقت.",
      isSuspended: false,
    };
  }

  // انتهاء صلاحية CSRF state
  if (/state/i.test(error)) {
    return {
      title: "انتهت صلاحية جلسة التحقق",
      message: "انتهت صلاحية طلب المصادقة لأسباب أمنية. يرجى إعادة المحاولة من صفحة الدخول.",
      isSuspended: false,
    };
  }

  return {
    title: "تعذّر تسجيل الدخول",
    message: error || "تعذّر إكمال تسجيل الدخول عبر Google. حاول مرة أخرى أو استخدم البريد الإلكتروني وكلمة المرور.",
    isSuspended: false,
  };
}

function sanitizeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  // منع هجمات Open Redirect: يجب أن يكون مساراً داخلياً يبدأ بـ / فقط
  if (next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")) {
    return next;
  }
  return null;
}

export interface OAuthCallbackProps {
  error: string | null;
  requiresTwoFactor: boolean;
  success: boolean;
  next?: string | null;
}

export default function OAuthCallback({ error, requiresTwoFactor, success, next }: OAuthCallbackProps) {
  const router = useRouter();
  const { refresh } = useAuth();
  const started = useRef(false);
  const [needsCode, setNeedsCode] = useState(requiresTwoFactor);

  const complete = useCallback(async (data?: LoginResult | null) => {
    // 1. إعادة ضبط عدادات محاولات التجديد (cooldown)
    resetRefreshCooldown();

    // 2. تحديث جلسة المستخدم بالطلب المباشر من الباك اند
    let branch = data?.user?.branch;
    let ok = Boolean(data?.user);

    if (!ok) {
      const res = await fetchWithAuth("/users/me").catch(() => null);
      if (res?.ok) {
        const user = (await res.json()) as { branch?: unknown };
        ok = true;
        branch = user?.branch;
      }
    }

    // 3. إشعار سياق المصادقة (AuthContext) على مستوى المتصفح
    notifyAuthChange();
    refresh();

    // 4. التوجيه إلى المسار المطلوب (next) بعد التحقق من أمانه، أو الصفحة الرئيسية /home (أو اختيار الفرع)
    const safeTarget = sanitizeNext(next);
    if (safeTarget) {
      router.replace(safeTarget);
    } else if (ok) {
      router.replace(branch ? "/home" : "/select-branch");
    } else {
      router.replace("/home");
    }
    router.refresh();
  }, [next, refresh, router]);

  useEffect(() => {
    // في حال وجود خطأ أو الحاجة لخطوة 2FA، أو تم بدء المعالجة مسبقاً، نتوقف
    if (error || needsCode || started.current) return;

    started.current = true;
    void complete();
  }, [error, needsCode, success, complete]);

  // خطوة المصادقة الثنائية (2FA)
  if (needsCode && !error) {
    return (
      <AuthShell title="أدخل رمز التحقق" back={{ href: "/login", label: "تسجيل الدخول" }}>
        <TwoFactorStep
          onSuccess={(d) => {
            setNeedsCode(false);
            started.current = true;
            void complete(d);
          }}
          onBack={() => router.replace("/login")}
        />
      </AuthShell>
    );
  }

  // عرض رسالة الخطأ في حال الفشل
  if (error) {
    const errorDetails = describeError(error);

    return (
      <AuthShell title={errorDetails.title} back={{ href: "/login", label: "تسجيل الدخول" }}>
        <div className="flex flex-col gap-6">
          <span
            className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
              errorDetails.isSuspended ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
            }`}
          >
            {errorDetails.isSuspended ? (
              <ShieldAlert size={28} strokeWidth={1.75} />
            ) : (
              <CircleAlert size={28} strokeWidth={1.75} />
            )}
          </span>
          <p className="text-[15px] leading-8 text-muted">{errorDetails.message}</p>
          <ButtonLink href="/login" size="lg" block>
            العودة إلى تسجيل الدخول
          </ButtonLink>
        </div>
      </AuthShell>
    );
  }

  // حالة التحميل وتجهيز الجلسة
  return (
    <AuthShell title="جاري تسجيل دخولك…" back={null}>
      <Spinner className="py-10" label="جاري استكمال تسجيل الدخول وتجهيز جلستك…" />
    </AuthShell>
  );
}
