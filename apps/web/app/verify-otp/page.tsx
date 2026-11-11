"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MailWarning } from "lucide-react";
import AuthShell from "@/components/layout/AuthShell";
import { fetchPublic, resetRefreshCooldown } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";
import { NETWORK_ERROR, commonAuthError } from "@/lib/authRules";
import { useToast } from "@/components/ui/ToastProvider";
import { Button, ButtonLink } from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import OtpInput from "@/components/auth/OtpInput";
import { usePendingEmail } from "./Pendingverification";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 59;

export default function VerifyOtpPage() {
  const router = useRouter();
  const { email: storedEmail, clearPendingEmail } = usePendingEmail();
  const email = storedEmail || "";
  const { showToast } = useToast();
  const { refresh } = useAuth();

  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setInterval(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearInterval(timer);
  }, [secondsLeft]);

  async function verify(code: string) {
    if (loading || !email) return;
    if (code.length !== OTP_LENGTH) {
      setError("أدخل الرمز كاملاً (6 أرقام).");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetchPublic("/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      if (res.ok) {
        // التفعيل الصحيح بيفتح جلسة مباشرة (كوكيز من الباك اند) — الخطوة
        // الجاية هي اختيار الفرع، مش إعادة كتابة كلمة المرور
        showToast({ type: "success", message: "تم تفعيل حسابك. أهلاً بك في مسار التميز!" });
        clearPendingEmail();
        resetRefreshCooldown();
        refresh();
        router.replace("/select-branch");
        router.refresh();
        return;
      }
      if (res.status === 400 || res.status === 401) {
        setError("الرمز غير صحيح أو انتهت صلاحيته. تأكد منه أو اطلب رمزاً جديداً.");
        setOtp(Array(OTP_LENGTH).fill(""));
      } else {
        setError(commonAuthError(res.status) ?? "حدث خطأ غير متوقع، حاول مرة أخرى.");
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  const resend = useCallback(async () => {
    if (secondsLeft > 0 || resending || !email) return;
    setResending(true);
    setError("");
    try {
      const res = await fetchPublic("/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSecondsLeft(RESEND_SECONDS);
        setOtp(Array(OTP_LENGTH).fill(""));
        showToast({ type: "success", message: "أرسلنا رمزاً جديداً إلى بريدك الإلكتروني." });
      } else {
        setError(commonAuthError(res.status) ?? "تعذّر إعادة إرسال الرمز، حاول لاحقاً.");
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setResending(false);
    }
  }, [secondsLeft, resending, email, showToast]);

  // الإيميل المعلّق بينحفظ بـ sessionStorage — لو انفتحت الصفحة مباشرة
  // أو بتاب جديد، ما في شي نتحقق منه.
  if (!email) {
    return (
      <AuthShell title="انتهت جلسة التفعيل" back={{ href: "/register", label: "إنشاء حساب" }}>
        <div className="flex flex-col gap-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <MailWarning size={26} strokeWidth={1.75} />
          </span>
          <p className="text-[15px] leading-8 text-muted">
            لم نعد نعرف البريد الذي تريد تفعيله — ربما فُتحت الصفحة في نافذة جديدة. إذا أنشأت حسابك للتو، سجّل الدخول
            وسنرشدك للتفعيل، أو أنشئ الحساب من جديد.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <ButtonLink href="/login" size="lg" block>
              تسجيل الدخول
            </ButtonLink>
            <ButtonLink href="/register" variant="secondary" size="lg" block>
              إنشاء حساب
            </ButtonLink>
          </div>
        </div>
      </AuthShell>
    );
  }

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <AuthShell
      title="فعّل حسابك"
      description={
        <>
          أرسلنا رمزاً من 6 أرقام إلى{" "}
          <b dir="ltr" className="font-semibold text-navy-900">
            {email}
          </b>
        </>
      }
      back={{ href: "/register", label: "تعديل البريد" }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verify(otp.join(""));
        }}
        className="flex flex-col gap-6"
        noValidate
      >
        {error && <Alert tone="error">{error}</Alert>}
        <OtpInput value={otp} onChange={setOtp} disabled={loading} invalid={Boolean(error)} onComplete={(c) => void verify(c)} />
        <Button type="submit" size="lg" block loading={loading}>
          {loading ? "جاري التحقق…" : "تفعيل الحساب"}
        </Button>
        <p className="text-center text-sm text-muted">
          لم يصلك الرمز؟{" "}
          {secondsLeft > 0 ? (
            <span>
              يمكنك طلب رمز جديد بعد{" "}
              <span dir="ltr" className="font-semibold text-navy-900 tabular">
                {mm}:{ss}
              </span>
            </span>
          ) : (
            <button type="button" onClick={resend} disabled={resending} className="font-semibold text-teal-700 hover:underline disabled:opacity-50">
              {resending ? "جاري الإرسال…" : "أرسل رمزاً جديداً"}
            </button>
          )}
        </p>
      </form>
    </AuthShell>
  );
}
