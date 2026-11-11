"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchPublic } from "@/lib/apiClient";
import { EMAIL_RE, NETWORK_ERROR, commonAuthError, passwordError } from "@/lib/authRules";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { PasswordField, TextField } from "@/components/ui/Field";
import Alert from "@/components/ui/Alert";
import PasswordChecklist from "@/components/auth/PasswordChecklist";
import GoogleLoginButton, { OrDivider } from "@/components/auth/GoogleLoginButton";
import { usePendingEmail } from "../verify-otp/Pendingverification";

type Errors = Partial<Record<"firstName" | "lastName" | "email" | "password" | "confirmPassword" | "terms", string>>;

const noopSubscribe = () => () => {};

export default function RegisterForm() {
  const router = useRouter();
  const { showToast } = useToast();
  const { setPendingEmail } = usePendingEmail();

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [password, setPassword] = useState("");

  // الطالب بيقدر يقرا الشروط ويضغط "أوافق" هناك، فبيرجع والمربع معلَّم
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [syncedTerms, setSyncedTerms] = useState(false);
  if (hydrated && !syncedTerms) {
    setSyncedTerms(true);
    try {
      if (localStorage.getItem("acceptedTerms") === "true") {
        localStorage.removeItem("acceptedTerms");
        setTermsAccepted(true);
      }
    } catch {
      // التخزين محظور — الطالب بيعلّم المربع بنفسه
    }
  }

  const clear = (key: keyof Errors) => errors[key] && setErrors((e) => ({ ...e, [key]: undefined }));

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    const form = new FormData(e.currentTarget);
    const firstName = String(form.get("firstName") ?? "").trim();
    const lastName = String(form.get("lastName") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const confirmPassword = String(form.get("confirmPassword") ?? "");

    const next: Errors = {};
    if (!firstName) next.firstName = "الاسم الأول مطلوب";
    if (!lastName) next.lastName = "اسم العائلة مطلوب";
    if (!email) next.email = "البريد الإلكتروني مطلوب";
    else if (!EMAIL_RE.test(email)) next.email = "صيغة البريد الإلكتروني غير صحيحة";
    const pwError = passwordError(password);
    if (pwError) next.password = pwError;
    if (!confirmPassword) next.confirmPassword = "أعد كتابة كلمة المرور";
    else if (confirmPassword !== password) next.confirmPassword = "كلمتا المرور غير متطابقتين";
    if (!termsAccepted) next.terms = "يجب الموافقة على الشروط والأحكام للمتابعة";
    setErrors(next);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const res = await fetchPublic("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${firstName} ${lastName}`, email, password }),
      });

      if (res.status === 201 || res.ok) {
        showToast({ type: "success", message: "تم إنشاء حسابك. أرسلنا رمز التفعيل إلى بريدك الإلكتروني." });
        // بدل تمرير الإيميل عبر الـ URL (?email=...)، نخزنه مؤقتاً بالـ sessionStorage
        setPendingEmail(email);
        router.push("/verify-otp");
        return;
      }
      if (res.status === 409) {
        setErrors({ email: "هذا البريد مسجّل مسبقاً." });
        setFormError("يوجد حساب بهذا البريد. سجّل الدخول بدلاً من ذلك، أو استعد كلمة المرور إن نسيتها.");
        return;
      }
      if (res.status === 400) {
        setFormError("تعذّر إنشاء الحساب بهذه البيانات. راجع الحقول وحاول مرة أخرى.");
        return;
      }
      setFormError(commonAuthError(res.status) ?? "حدث خطأ غير متوقع، حاول مرة أخرى.");
    } catch {
      setFormError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        {formError && (
          <Alert
            tone="error"
            action={
              errors.email === "هذا البريد مسجّل مسبقاً." ? (
                <Link href="/login" className="shrink-0 text-sm font-semibold underline underline-offset-4">
                  تسجيل الدخول
                </Link>
              ) : undefined
            }
          >
            {formError}
          </Alert>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="الاسم الأول"
            name="firstName"
            autoComplete="given-name"
            disabled={loading}
            error={errors.firstName}
            onChange={() => clear("firstName")}
          />
          <TextField
            label="اسم العائلة"
            name="lastName"
            autoComplete="family-name"
            disabled={loading}
            error={errors.lastName}
            onChange={() => clear("lastName")}
          />
        </div>

        <TextField
          label="البريد الإلكتروني"
          name="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          inputMode="email"
          placeholder="name@example.com"
          disabled={loading}
          error={errors.email}
          onChange={() => clear("email")}
          className="text-end placeholder:text-end"
          hint="سنرسل إليه رمزاً لتفعيل حسابك."
        />

        <div className="flex flex-col gap-2.5">
          <PasswordField
            label="كلمة المرور"
            name="password"
            autoComplete="new-password"
            disabled={loading}
            error={errors.password}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear("password");
            }}
          />
          <PasswordChecklist value={password} />
        </div>

        <PasswordField
          label="تأكيد كلمة المرور"
          name="confirmPassword"
          autoComplete="new-password"
          disabled={loading}
          error={errors.confirmPassword}
          onChange={() => clear("confirmPassword")}
        />

        <div className="flex flex-col gap-1.5">
          <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-ink">
            <input
              type="checkbox"
              name="terms"
              checked={termsAccepted}
              onChange={(e) => {
                setTermsAccepted(e.target.checked);
                if (e.target.checked) clear("terms");
              }}
              aria-invalid={Boolean(errors.terms) || undefined}
              className="mt-1 h-4 w-4 shrink-0 cursor-pointer rounded border-navy-200 accent-teal-600"
            />
            <span>
              أوافق على{" "}
              <Link href="/terms?from=register" className="font-semibold text-teal-700 hover:underline">
                الشروط والأحكام
              </Link>{" "}
              و
              <Link href="/privacy" className="font-semibold text-teal-700 hover:underline">
                سياسة الخصوصية
              </Link>
            </span>
          </label>
          {errors.terms && (
            <p role="alert" className="text-[13px] text-rose-600">
              {errors.terms}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" block loading={loading}>
          {loading ? "جاري إنشاء الحساب…" : "إنشاء الحساب"}
        </Button>
      </form>

      <OrDivider />
      <GoogleLoginButton mode="register" />
    </div>
  );
}
