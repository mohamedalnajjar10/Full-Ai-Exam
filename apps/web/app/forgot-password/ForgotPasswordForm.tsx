"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import AuthShell from "@/components/layout/AuthShell";
import { fetchPublic } from "@/lib/apiClient";
import { EMAIL_RE, NETWORK_ERROR, commonAuthError } from "@/lib/authRules";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import Alert from "@/components/ui/Alert";

export default function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [formError, setFormError] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function send(email: string) {
    setLoading(true);
    setFormError("");
    try {
      const res = await fetchPublic("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSentTo(email);
        return;
      }
      if (res.status === 400) setEmailError("صيغة البريد الإلكتروني غير صحيحة");
      else setFormError(commonAuthError(res.status) ?? "حدث خطأ غير متوقع، حاول مرة أخرى.");
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim();
    if (!email) return setEmailError("أدخل البريد الإلكتروني المرتبط بحسابك");
    if (!EMAIL_RE.test(email)) return setEmailError("صيغة البريد الإلكتروني غير صحيحة");
    setEmailError("");
    void send(email);
  }

  if (sentTo) {
    return (
      <AuthShell title="تحقق من بريدك الإلكتروني" back={{ href: "/login", label: "تسجيل الدخول" }}>
        <div className="flex flex-col gap-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
            <MailCheck size={28} strokeWidth={1.75} />
          </span>
          <p className="text-[15px] leading-8 text-muted">
            إذا كان هناك حساب مرتبط بالبريد{" "}
            <b dir="ltr" className="font-semibold text-navy-900">
              {sentTo}
            </b>{" "}
            فستصلك خلال دقائق رسالة فيها رابط لإعادة تعيين كلمة المرور. تفقّد مجلد الرسائل غير المرغوب فيها إن لم تجدها.
          </p>
          <ButtonLink href="/login" size="lg" block>
            العودة إلى تسجيل الدخول
          </ButtonLink>
          <button type="button" onClick={() => send(sentTo)} disabled={loading} className="text-sm font-semibold text-teal-700 hover:underline disabled:opacity-50">
            {loading ? "جاري الإرسال…" : "لم تصلك الرسالة؟ أعد الإرسال"}
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="استعادة كلمة المرور"
      description="أدخل البريد الإلكتروني المرتبط بحسابك وسنرسل إليك رابطاً لإعادة تعيين كلمة المرور."
      back={{ href: "/login", label: "تسجيل الدخول" }}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        <TextField
          label="البريد الإلكتروني"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          inputMode="email"
          placeholder="name@example.com"
          disabled={loading}
          error={emailError}
          onChange={() => emailError && setEmailError("")}
          className="text-end placeholder:text-end"
        />
        <Button type="submit" size="lg" block loading={loading}>
          {loading ? "جاري الإرسال…" : "إرسال رابط الاستعادة"}
        </Button>
        <p className="text-center text-sm text-muted">
          تذكّرت كلمة المرور؟{" "}
          <Link href="/login" className="font-semibold text-teal-700 hover:underline">
            سجّل الدخول
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
