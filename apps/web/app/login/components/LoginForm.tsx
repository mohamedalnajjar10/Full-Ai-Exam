"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchPublic, readJson, resetRefreshCooldown } from "@/lib/apiClient";
import { EMAIL_RE, NETWORK_ERROR, commonAuthError } from "@/lib/authRules";
import { Button } from "@/components/ui/Button";
import { PasswordField, TextField } from "@/components/ui/Field";
import Alert from "@/components/ui/Alert";
import OtpInput from "@/components/auth/OtpInput";
import TwoFactorStep, { type LoginResult } from "@/components/auth/TwoFactorStep";
import GoogleLoginButton, { OrDivider } from "@/components/auth/GoogleLoginButton";
import { usePendingEmail } from "@/app/verify-otp/Pendingverification";

type Method = "password" | "code";
type Step = "form" | "code-sent" | "two-factor";
type FormError = { message: string; retry?: () => void; unverified?: string };

const RESEND_SECONDS = 60;

export default function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const { setPendingEmail } = usePendingEmail();

  const [method, setMethod] = useState<Method>("password");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FormError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [email, setEmail] = useState("");
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  function finish() {
    // الجلسة انحطت ككوكي httpOnly من السيرفر — ما في شي نخزنه هون.
    resetRefreshCooldown();
    refresh();
    // ردّ الدخول ما فيه الفرع؛ AppShell بيحوّل على اختيار الفرع إذا لزم
    router.replace(next ?? "/home");
    router.refresh();
  }

  /** نتيجة أي خطوة دخول: جلسة كاملة، أو خطوة المصادقة الثنائية. */
  function handleSignedIn(data: LoginResult | null) {
    if (data?.requiresTwoFactor) {
      setStep("two-factor");
      return;
    }
    finish();
  }

  function validEmail(value: string) {
    if (!value) return "البريد الإلكتروني مطلوب";
    if (!EMAIL_RE.test(value)) return "صيغة البريد الإلكتروني غير صحيحة";
    return "";
  }

  async function post(path: string, body: unknown) {
    const res = await fetchPublic(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, data: await readJson<LoginResult & { message?: string }>(res) };
  }

  // ---------- كلمة المرور ----------
  async function submitPassword(emailValue: string, password: string) {
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await post("/auth/login", { email: emailValue, password });
      if (res.ok) return handleSignedIn(data);

      if (res.status === 401) setError({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة." });
      else if (res.status === 403) setError({ message: "لم يُفعَّل بريدك الإلكتروني بعد.", unverified: emailValue });
      else
        setError({
          message: commonAuthError(res.status) ?? "حدث خطأ غير متوقع، حاول مرة أخرى.",
          retry: res.status >= 500 ? () => submitPassword(emailValue, password) : undefined,
        });
    } catch {
      setError({ message: NETWORK_ERROR, retry: () => submitPassword(emailValue, password) });
    } finally {
      setLoading(false);
    }
  }

  // ---------- رمز عبر البريد ----------
  async function requestCode(emailValue: string) {
    setLoading(true);
    setError(null);
    try {
      const { res } = await post("/auth/login/code", { email: emailValue });
      if (res.ok) {
        setEmail(emailValue);
        setCode(Array(6).fill(""));
        setStep("code-sent");
        setCooldown(RESEND_SECONDS);
        return;
      }
      setError({ message: commonAuthError(res.status) ?? "تعذّر إرسال الرمز، حاول مرة أخرى." });
    } catch {
      setError({ message: NETWORK_ERROR });
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(value: string) {
    if (loading) return;
    if (value.length !== 6) return setError({ message: "أدخل الرمز المكوّن من 6 أرقام." });
    setLoading(true);
    setError(null);
    try {
      const { res, data } = await post("/auth/login/code/verify", { email, code: value });
      if (res.ok) return handleSignedIn(data);
      if (res.status === 401) {
        const burned = /too many/i.test(data?.message ?? "");
        setError({
          message: burned
            ? "أخطأت الرمز عدة مرات، فأُلغي. اطلب رمزاً جديداً."
            : "الرمز غير صحيح أو انتهت صلاحيته.",
        });
        setCode(Array(6).fill(""));
      } else {
        setError({ message: commonAuthError(res.status) ?? "حدث خطأ غير متوقع، حاول مرة أخرى." });
      }
    } catch {
      setError({ message: NETWORK_ERROR });
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const emailValue = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");

    const errors: typeof fieldErrors = {};
    const emailErr = validEmail(emailValue);
    if (emailErr) errors.email = emailErr;
    if (method === "password" && !password) errors.password = "كلمة المرور مطلوبة";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    if (method === "password") void submitPassword(emailValue, password);
    else void requestCode(emailValue);
  }

  /** حساب غير مفعّل: منرسل رمز تفعيل جديد ومننقل الطالب لصفحة التفعيل. */
  async function goVerify(address: string) {
    setPendingEmail(address);
    await fetchPublic("/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: address }),
    }).catch(() => undefined);
    router.push("/verify-otp");
  }

  const errorAlert = error && (
    <Alert
      tone="error"
      action={
        error.unverified ? (
          <button type="button" onClick={() => goVerify(error.unverified!)} className="shrink-0 text-sm font-semibold underline underline-offset-4">
            أرسل رمز التفعيل
          </button>
        ) : error.retry ? (
          <button type="button" onClick={error.retry} className="shrink-0 text-sm font-semibold underline underline-offset-4">
            إعادة المحاولة
          </button>
        ) : undefined
      }
    >
      {error.message}
    </Alert>
  );

  if (step === "two-factor") {
    return (
      <TwoFactorStep
        onSuccess={() => finish()}
        onBack={() => {
          setStep("form");
          setError(null);
        }}
      />
    );
  }

  if (step === "code-sent") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void verifyCode(code.join(""));
        }}
        className="flex flex-col gap-6"
        noValidate
      >
        <div className="flex items-start gap-3 rounded-xl border border-line bg-canvas p-4 text-sm leading-6 text-muted">
          <Mail size={20} className="mt-0.5 shrink-0 text-teal-700" />
          <p>
            إذا كان هناك حساب مرتبط بـ{" "}
            <b dir="ltr" className="font-semibold text-navy-900">
              {email}
            </b>{" "}
            فستصلك رسالة فيها رمز من 6 أرقام صالح لمدة 10 دقائق.
          </p>
        </div>
        {errorAlert}
        <OtpInput value={code} onChange={setCode} disabled={loading} invalid={Boolean(error)} onComplete={(c) => void verifyCode(c)} />
        <Button type="submit" size="lg" block loading={loading}>
          {loading ? "جاري التحقق…" : "تسجيل الدخول"}
        </Button>
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStep("form");
              setError(null);
            }}
            className="inline-flex items-center gap-1.5 font-medium text-muted hover:text-navy-900"
          >
            <ArrowRight size={15} />
            تعديل البريد
          </button>
          {cooldown > 0 ? (
            <span className="text-muted">
              رمز جديد بعد <span className="font-semibold text-navy-900 tabular">{cooldown}</span> ث
            </span>
          ) : (
            <button type="button" onClick={() => requestCode(email)} disabled={loading} className="font-semibold text-teal-700 hover:underline disabled:opacity-50">
              أرسل رمزاً جديداً
            </button>
          )}
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="طريقة الدخول" className="grid grid-cols-2 rounded-xl border border-line bg-canvas p-1">
        {(
          [
            ["password", "كلمة المرور", KeyRound],
            ["code", "رمز عبر البريد", Mail],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={method === value}
            onClick={() => {
              setMethod(value);
              setError(null);
              setFieldErrors({});
            }}
            className={`flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition-colors ${
              method === value ? "bg-white text-navy-900 shadow-card" : "text-muted hover:text-navy-900"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {errorAlert}

        <TextField
          label="البريد الإلكتروني"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          inputMode="email"
          placeholder="name@example.com"
          disabled={loading}
          error={fieldErrors.email}
          defaultValue={email}
          onChange={() => fieldErrors.email && setFieldErrors((f) => ({ ...f, email: undefined }))}
          className="text-end placeholder:text-end"
        />

        {method === "password" ? (
          <PasswordField
            label="كلمة المرور"
            name="password"
            autoComplete="current-password"
            disabled={loading}
            error={fieldErrors.password}
            onChange={() => fieldErrors.password && setFieldErrors((f) => ({ ...f, password: undefined }))}
            trailing={
              <Link href="/forgot-password" className="text-sm font-medium text-teal-700 hover:underline">
                نسيت كلمة المرور؟
              </Link>
            }
          />
        ) : (
          <p className="-mt-1 text-sm leading-6 text-muted">سنرسل إلى بريدك رمزاً لمرة واحدة تدخل به دون كلمة مرور.</p>
        )}

        <Button type="submit" size="lg" block loading={loading} className="mt-1">
          {method === "password" ? (loading ? "جاري الدخول…" : "تسجيل الدخول") : loading ? "جاري الإرسال…" : "أرسل رمز الدخول"}
        </Button>
      </form>

      <OrDivider />
      <GoogleLoginButton mode="login" next={next ?? undefined} />
    </div>
  );
}
