"use client";

import { useState } from "react";
import { Loader2, LogIn, UserPlus } from "lucide-react";

/** المسار النسبي الموحد لبدء مصادقة Google (يمر عبر Next.js proxy rewrite) */
const GOOGLE_OAUTH_PATH = "/api/v1/auth/oauth/google";

export interface GoogleLoginButtonProps {
  /**
   * وضع الزر: إما تسجيل دخول (login) أو إنشاء حساب جديد (register).
   * @default "login"
   */
  mode?: "login" | "register";
  /**
   * نص مخصص للزر (اختياري). إذا لم يُمرر، يُستخدم النص الافتراضي حسب الوضع.
   */
  label?: string;
  /**
   * هل يأخذ الزر العرض الكامل للحاوية.
   * @default true
   */
  block?: boolean;
  /**
   * كلاسات Tailwind إضافية للتخصيص.
   */
  className?: string;
  /**
   * تعطيل الزر.
   */
  disabled?: boolean;
  /**
   * مسار العودة الآمن بعد إتمام تسجيل الدخول بنجاح (اختياري).
   */
  next?: string;
}

/**
 * أيقونة Google الرسمية بالألوان الأربعة بدقة SVG عالية.
 */
function GoogleIcon({ className = "h-[19px] w-[19px] shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.18v3.15C3.15 21.32 7.22 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.18C.43 8.13 0 9.87 0 12s.43 3.87 1.18 5.39l4.09-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.22 0 3.15 2.68 1.18 6.61l4.09 3.15c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

/**
 * مكون زر التسجيل / الدخول بواسطة حساب Google.
 *
 * مصمم وفق الهوية البصرية لمنصة مسار التميز ومبني باستخدام Tailwind CSS v4،
 * ويدعم حالات التحميل (Loading state) وأيقونات Lucide React وخصائص سهولة الوصول (A11y).
 */
export default function GoogleLoginButton({
  mode = "login",
  label,
  block = true,
  className = "",
  disabled = false,
  next,
}: GoogleLoginButtonProps) {
  const [loading, setLoading] = useState(false);

  const defaultLabel =
    mode === "register" ? "التسجيل باستخدام Google" : "المتابعة باستخدام Google";
  const displayLabel = label ?? defaultLabel;

  // مسار نسبي موحد ومتطابق تماماً بين السيرفر (SSR) والعميل لتفادي Hydration Mismatch
  const safeNextParam =
    next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\")
      ? `?next=${encodeURIComponent(next)}`
      : "";
  const oauthEndpoint = `${GOOGLE_OAUTH_PATH}${safeNextParam}`;

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (disabled || loading) {
      e.preventDefault();
      return;
    }
    // إظهار مؤشر التحميل فور النقر لإعطاء استجابة تفاعلية سريعة للمستخدم
    setLoading(true);
  };

  const ModeIcon = mode === "register" ? UserPlus : LogIn;

  return (
    <a
      href={oauthEndpoint}
      onClick={handleClick}
      role="button"
      aria-disabled={disabled || loading}
      aria-label={displayLabel}
      className={`group relative inline-flex select-none items-center justify-center gap-3 rounded-xl border border-line bg-white px-5 py-3 text-[15px] font-semibold text-navy-900 shadow-xs transition-all duration-150 hover:border-navy-300 hover:bg-navy-50/70 hover:shadow-card active:bg-navy-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
        block ? "w-full" : ""
      } ${disabled || loading ? "pointer-events-none opacity-60" : ""} ${className}`}
    >
      {/* أيقونة الحالة: إما التحميل الدوار أو شعار Google */}
      {loading ? (
        <Loader2 size={19} className="animate-spin text-teal-700" aria-hidden="true" />
      ) : (
        <GoogleIcon />
      )}

      {/* نص الزر */}
      <span className="truncate">{loading ? "جاري تحويلك إلى Google…" : displayLabel}</span>

      {/* أيقونة جانبية خفيفة من Lucide React لتعزيز المعنى الدلالي */}
      <ModeIcon
        size={16}
        className="text-subtle transition-transform duration-150 group-hover:translate-x-[-2px] group-hover:text-navy-700 ltr:rotate-180"
        aria-hidden="true"
      />
    </a>
  );
}

/**
 * خط فاصل أنيق (أو) يُوضع بين نموذج الدخول التقليدي وزر Google.
 */
export function OrDivider({ text = "أو" }: { text?: string }) {
  return (
    <div className="flex items-center gap-4 text-xs font-medium text-subtle">
      <span className="h-px flex-1 bg-line" />
      <span>{text}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}
