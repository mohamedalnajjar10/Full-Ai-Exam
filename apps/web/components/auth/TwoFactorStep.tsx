"use client";

import { useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { fetchPublic, readJson } from "@/lib/apiClient";
import { NETWORK_ERROR, commonAuthError } from "@/lib/authRules";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import Alert from "@/components/ui/Alert";
import OtpInput from "./OtpInput";

export type LoginResult = { user?: { branch?: unknown }; requiresTwoFactor?: boolean };

/**
 * الخطوة التانية لحساب عليه مصادقة ثنائية. الباك اند حاطط login_token
 * بكوكي عمرها 5 دقايق، فهون بس منبعت الرمز.
 * مستعملة بصفحة الدخول وبصفحة الرجوع من Google.
 */
export default function TwoFactorStep({ onSuccess, onBack }: { onSuccess: (data: LoginResult | null) => void; onBack: () => void }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const [useRecovery, setUseRecovery] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  async function submit(value?: string) {
    const totp = value ?? code.join("");
    if (!useRecovery && totp.length !== 6) return setError("أدخل الرمز المكوّن من 6 أرقام.");
    if (useRecovery && !recoveryCode.trim()) return setError("أدخل رمز الاسترداد.");
    setLoading(true);
    setError("");
    try {
      const res = await fetchPublic(useRecovery ? "/auth/2fa/recovery" : "/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(useRecovery ? { recoveryCode: recoveryCode.trim() } : { code: totp }),
      });
      const data = await readJson<LoginResult>(res);
      if (res.ok) return onSuccess(data);
      if (res.status === 401 || res.status === 400) {
        setError("الرمز غير صحيح أو انتهت مهلة الخطوة (5 دقائق). إذا انتهت، ارجع وابدأ الدخول من جديد.");
        setCode(Array(6).fill(""));
      } else {
        setError(commonAuthError(res.status) ?? "حدث خطأ غير متوقع، حاول مرة أخرى.");
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      <div className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-4 text-sm leading-6 text-muted">
        <ShieldCheck size={20} className="mt-0.5 shrink-0 text-teal-700" />
        {useRecovery
          ? "أدخل أحد رموز الاسترداد التي حفظتها عند تفعيل المصادقة الثنائية."
          : "حسابك محمي بالمصادقة الثنائية. أدخل الرمز الظاهر في تطبيق المصادقة على هاتفك."}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {useRecovery ? (
        <TextField
          label="رمز الاسترداد"
          name="recovery"
          dir="ltr"
          autoComplete="one-time-code"
          placeholder="xxxxx-xxxxx"
          value={recoveryCode}
          onChange={(e) => setRecoveryCode(e.target.value)}
          className="text-center tracking-widest"
        />
      ) : (
        <OtpInput value={code} onChange={setCode} disabled={loading} invalid={Boolean(error)} onComplete={(c) => void submit(c)} />
      )}

      <Button type="submit" size="lg" block loading={loading}>
        تأكيد الدخول
      </Button>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-navy-900">
          <ArrowRight size={15} />
          رجوع
        </button>
        <button
          type="button"
          onClick={() => {
            setUseRecovery((v) => !v);
            setError("");
          }}
          className="font-semibold text-teal-700 hover:underline"
        >
          {useRecovery ? "استخدم رمز التطبيق" : "لا أستطيع الوصول لهاتفي"}
        </button>
      </div>
    </form>
  );
}
