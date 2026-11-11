"use client";

import { useEffect, useState } from "react";
import { Mail, Send } from "lucide-react";
import { EMAIL_RE } from "@/lib/authRules";
import { Button } from "@/components/ui/Button";
import { TextAreaField, TextField } from "@/components/ui/Field";
import Alert from "@/components/ui/Alert";
import { fetchPublic, fetchWithAuth, readJson } from "@/lib/apiClient";
import { useAuth } from "@/context/AuthContext";

const SUPPORT_EMAIL = "support@masar-altamayoz.edu";

interface SubmitResult {
  success: boolean;
  ticketId?: string;
  message?: string;
}

export default function ContactForm() {
  const { user } = useAuth();
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [serverError, setServerError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) {
      if (user.name && !name) setName(user.name);
      if (user.email && !email) setEmail(user.email);
    }
  }, [user]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError("");
    setResult(null);

    const next: typeof errors = {};
    if (!name.trim()) next.name = "اكتب اسمك";
    if (!email.trim()) next.email = "البريد الإلكتروني مطلوب للرد عليك";
    else if (!EMAIL_RE.test(email.trim())) next.email = "صيغة البريد الإلكتروني غير صحيحة";
    if (message.trim().length < 10) next.message = "اكتب رسالتك (10 أحرف على الأقل)";
    setErrors(next);
    if (Object.keys(next).length) return;

    setIsSubmitting(true);
    try {
      const fetchFn = user ? fetchWithAuth : fetchPublic;
      const res = await fetchFn("/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
        }),
      });

      if (res.status === 429) {
        setServerError("لقد أرسلت عدة رسائل مؤخراً. يرجى الانتظار بضع دقائق قبل المحاولة مجدداً.");
        return;
      }

      if (!res.ok) {
        const data = await readJson<{ message?: string | string[] }>(res);
        const errMsg = Array.isArray(data?.message)
          ? data.message[0]
          : data?.message || "تعذر إرسال الرسالة، يرجى المحاولة مرة أخرى.";
        setServerError(errMsg);
        return;
      }

      const data = await readJson<SubmitResult>(res);
      setResult({
        success: true,
        ticketId: data?.ticketId,
        message: data?.message || "تم استلام رسالتك بنجاح!",
      });
      setMessage("");
    } catch {
      setServerError("تعذر الاتصال بالخادم، تحقق من اتصال الإنترنت أو راسلنا عبر البريد المباشر.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleMailtoFallback() {
    const body = [
      message,
      "",
      "—",
      `الاسم: ${name}`,
      `البريد: ${email}`,
      phone && `الهاتف: ${phone}`,
    ]
      .filter(Boolean)
      .join("\n");
    const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      `رسالة من ${name || "مستخدم"} عبر موقع مسار التميز`,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = href;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {result?.success && (
        <Alert tone="success" title="تم إرسال رسالتك بنجاح!">
          <div className="flex flex-col gap-2">
            <p>
              شكراً لتواصلك معنا. تم فتح تذكرة دعم فني برقم:{" "}
              <strong className="font-mono text-teal-800" dir="ltr">
                {result.ticketId}
              </strong>
              . ستصلك رسالة تأكيد على بريدك الإلكتروني، وسيقوم فريق الدعم بالرد عليك في أقرب وقت.
            </p>
          </div>
        </Alert>
      )}

      {serverError && (
        <Alert tone="error" title="تعذر إرسال الرسالة">
          <p>{serverError}</p>
          <div className="mt-2">
            <button
              type="button"
              onClick={handleMailtoFallback}
              className="text-xs font-semibold text-rose-800 underline underline-offset-4 hover:text-rose-900"
            >
              أو الإرسال عبر تطبيق البريد الافتراضي
            </button>
          </div>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          label="الاسم الكامل"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          error={errors.name}
          required
        />
        <TextField
          label="رقم الهاتف"
          name="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          dir="ltr"
          autoComplete="tel"
          optional
          className="text-end"
        />
      </div>

      <TextField
        label="البريد الإلكتروني"
        name="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        type="email"
        dir="ltr"
        autoComplete="email"
        placeholder="name@example.com"
        error={errors.email}
        className="text-end placeholder:text-end"
        required
      />

      <TextAreaField
        label="رسالتك"
        name="message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={6}
        error={errors.message}
        placeholder="كيف يمكننا مساعدتك؟"
        required
      />

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" loading={isSubmitting} className="sm:w-fit">
          <Send size={17} />
          إرسال الرسالة
        </Button>

        <button
          type="button"
          onClick={handleMailtoFallback}
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-navy-900 transition-colors"
        >
          <Mail size={14} />
          إرسال عبر تطبيق البريد
        </button>
      </div>
    </form>
  );
}
