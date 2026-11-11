"use client";

import { useState } from "react";
import { CircleCheck, LinkIcon } from "lucide-react";
import AuthShell from "@/components/layout/AuthShell";
import { fetchPublic } from "@/lib/apiClient";
import { NETWORK_ERROR, commonAuthError, passwordError } from "@/lib/authRules";
import { Button, ButtonLink } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/Field";
import Alert from "@/components/ui/Alert";
import PasswordChecklist from "@/components/auth/PasswordChecklist";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [formError, setFormError] = useState("");
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthShell title="الرابط غير صالح" back={{ href: "/login", label: "تسجيل الدخول" }}>
        <div className="flex flex-col gap-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
            <LinkIcon size={26} strokeWidth={1.75} />
          </span>
          <p className="text-[15px] leading-8 text-muted">
            افتح الرابط كما وصلك في رسالة البريد الإلكتروني، أو اطلب رابطاً جديداً إذا انتهت صلاحيته.
          </p>
          <ButtonLink href="/forgot-password" size="lg" block>
            طلب رابط جديد
          </ButtonLink>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="تم تغيير كلمة المرور" back={null}>
        <div className="flex flex-col gap-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
            <CircleCheck size={28} strokeWidth={1.75} />
          </span>
          <p className="text-[15px] leading-8 text-muted">يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.</p>
          <ButtonLink href="/login" size="lg" block>
            الانتقال إلى تسجيل الدخول
          </ButtonLink>
        </div>
      </AuthShell>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const confirm = String(new FormData(e.currentTarget).get("confirmPassword") ?? "");
    const next: typeof errors = {};
    const pw = passwordError(password);
    if (pw) next.password = pw;
    if (!confirm) next.confirm = "أعد كتابة كلمة المرور";
    else if (confirm !== password) next.confirm = "كلمتا المرور غير متطابقتين";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const res = await fetchPublic("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (res.ok) {
        setDone(true);
        return;
      }
      if (res.status === 401) setFormError("انتهت صلاحية هذا الرابط أو سبق استخدامه. اطلب رابطاً جديداً.");
      else if (res.status === 400) setFormError("تعذّر حفظ كلمة المرور. تأكد أنها تحقق الشروط أدناه.");
      else setFormError(commonAuthError(res.status) ?? "حدث خطأ غير متوقع، حاول مرة أخرى.");
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="تعيين كلمة مرور جديدة" description="اختر كلمة مرور قوية لم تستخدمها من قبل." back={{ href: "/login", label: "تسجيل الدخول" }}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {formError && (
          <Alert
            tone="error"
            action={
              formError.includes("رابطاً جديداً") ? (
                <a href="/forgot-password" className="shrink-0 text-sm font-semibold underline underline-offset-4">
                  طلب رابط
                </a>
              ) : undefined
            }
          >
            {formError}
          </Alert>
        )}
        <div className="flex flex-col gap-2.5">
          <PasswordField
            label="كلمة المرور الجديدة"
            name="password"
            autoComplete="new-password"
            disabled={loading}
            error={errors.password}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((x) => ({ ...x, password: undefined }));
            }}
          />
          <PasswordChecklist value={password} />
        </div>
        <PasswordField
          label="تأكيد كلمة المرور"
          name="confirmPassword"
          autoComplete="new-password"
          disabled={loading}
          error={errors.confirm}
          onChange={() => errors.confirm && setErrors((x) => ({ ...x, confirm: undefined }))}
        />
        <Button type="submit" size="lg" block loading={loading}>
          {loading ? "جاري الحفظ…" : "حفظ كلمة المرور"}
        </Button>
      </form>
    </AuthShell>
  );
}
