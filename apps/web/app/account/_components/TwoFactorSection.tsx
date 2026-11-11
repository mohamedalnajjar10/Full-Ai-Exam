"use client";
import { useState } from "react";
import { Check, Copy, Download, KeyRound, ShieldCheck, ShieldOff, Smartphone, TriangleAlert } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/Field";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import OtpInput from "@/components/auth/OtpInput";
import { resetRefreshCooldown } from "@/lib/apiClient";
import {
  disableTwoFactor,
  enableTwoFactor,
  regenerateRecoveryCodes,
  securityError,
  startTwoFactorSetup,
} from "@/lib/account";
import Section from "./Section";

type Mode =
  | { name: "idle" }
  | { name: "setup"; secret: string; qrCode: string }
  | { name: "codes"; codes: string[]; fresh: boolean }
  | { name: "regenerate" }
  | { name: "disable" };

const EMPTY = () => Array<string>(6).fill("");

/**
 * المصادقة الثنائية بتطبيق مثل Google Authenticator:
 * مسح QR ← تأكيد برمز ← حفظ رموز الاسترداد. وبعد التفعيل: رموز جديدة أو إيقاف.
 */
export default function TwoFactorSection() {
  const { user, refresh } = useAuth();
  const { showToast } = useToast();
  const [mode, setMode] = useState<Mode>({ name: "idle" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [code, setCode] = useState<string[]>(EMPTY);
  const [password, setPassword] = useState("");

  const enabled = Boolean(user?.twoFactorEnabled);
  const remaining = user?.recoveryCodesRemaining ?? 0;

  function reset(next: Mode = { name: "idle" }) {
    setMode(next);
    setError("");
    setCode(EMPTY());
    setPassword("");
  }

  async function run<T>(action: () => Promise<T>, onDone: (r: T) => void) {
    setBusy(true);
    setError("");
    try {
      onDone(await action());
    } catch (err) {
      setError(securityError(err));
      setCode(EMPTY());
    } finally {
      setBusy(false);
    }
  }

  const begin = () => run(startTwoFactorSetup, (r) => reset({ name: "setup", secret: r.secret, qrCode: r.qrCode }));

  const confirmSetup = (value = code.join("")) =>
    value.length === 6 &&
    run(
      () => enableTwoFactor(value),
      (r) => {
        // التفعيل بيلغي كل الجلسات؛ الباك اند أصدر جلسة جديدة لهذا الجهاز
        resetRefreshCooldown();
        refresh();
        reset({ name: "codes", codes: r.recoveryCodes, fresh: true });
      },
    );

  const confirmRegenerate = (value = code.join("")) =>
    value.length === 6 &&
    run(
      () => regenerateRecoveryCodes(value),
      (r) => {
        refresh();
        reset({ name: "codes", codes: r.recoveryCodes, fresh: false });
      },
    );

  const confirmDisable = (value = code.join("")) =>
    value.length === 6 &&
    run(
      () => disableTwoFactor(value, user?.hasPassword === false ? undefined : password),
      () => {
        resetRefreshCooldown();
        refresh();
        reset();
        showToast({ type: "success", message: "أُوقفت المصادقة الثنائية." });
      },
    );

  return (
    <Section
      id="two-factor"
      icon={ShieldCheck}
      title="المصادقة الثنائية"
      description="طبقة حماية إضافية: عند الدخول نطلب رمزاً متغيّراً من تطبيق على هاتفك، فلا تكفي كلمة المرور وحدها."
    >
      {error && (
        <Alert tone="error" className="mb-5">
          {error}
        </Alert>
      )}

      {mode.name === "idle" && (
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {enabled ? (
              <Badge tone="teal" icon={<ShieldCheck size={13} />}>
                مفعّلة
              </Badge>
            ) : (
              <Badge tone="neutral" icon={<ShieldOff size={13} />}>
                غير مفعّلة
              </Badge>
            )}
            {enabled && (
              <span className={`text-sm ${remaining <= 3 ? "font-medium text-amber-700" : "text-muted"}`}>
                تبقّى {remaining} من رموز الاسترداد
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {enabled ? (
              <>
                <Button variant="secondary" onClick={() => reset({ name: "regenerate" })}>
                  <KeyRound size={16} />
                  رموز استرداد جديدة
                </Button>
                <Button variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => reset({ name: "disable" })}>
                  إيقاف
                </Button>
              </>
            ) : (
              <Button onClick={begin} loading={busy}>
                <Smartphone size={16} />
                تفعيل المصادقة الثنائية
              </Button>
            )}
          </div>
        </div>
      )}

      {enabled && mode.name === "idle" && remaining <= 3 && (
        <Alert tone="info" className="mt-5">
          رموز الاسترداد تكاد تنفد. أنشئ مجموعة جديدة حتى لا تفقد الوصول إلى حسابك إذا فقدت هاتفك.
        </Alert>
      )}

      {mode.name === "setup" && (
        <div className="flex flex-col gap-7">
          <ol className="grid gap-6 lg:grid-cols-[200px_1fr] lg:items-start">
            <li className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URL من الباك اند */}
              <img
                src={mode.qrCode}
                alt="رمز QR لإضافة الحساب إلى تطبيق المصادقة"
                width={200}
                height={200}
                className="rounded-xl border border-line bg-white p-2"
              />
            </li>
            <li className="flex flex-col gap-4 text-sm leading-7 text-ink">
              <p>
                <b className="font-semibold text-navy-900">1.</b> ثبّت تطبيق مصادقة على هاتفك، مثل{" "}
                <b className="font-semibold">Google Authenticator</b> أو <b className="font-semibold">Microsoft Authenticator</b> أو{" "}
                <b className="font-semibold">Authy</b>.
              </p>
              <p>
                <b className="font-semibold text-navy-900">2.</b> اضغط «+» في التطبيق وامسح رمز QR. إن لم تستطع المسح، أدخل هذا المفتاح يدوياً:
              </p>
              <SecretKey secret={mode.secret} />
              <p>
                <b className="font-semibold text-navy-900">3.</b> أدخل الرمز المكوّن من 6 أرقام الظاهر في التطبيق:
              </p>
              <div className="max-w-sm">
                <OtpInput value={code} onChange={setCode} disabled={busy} invalid={Boolean(error)} onComplete={(c) => void confirmSetup(c)} />
              </div>
            </li>
          </ol>
          <div className="flex gap-2 border-t border-line pt-5">
            <Button onClick={() => confirmSetup()} loading={busy} disabled={code.join("").length !== 6}>
              تأكيد وتفعيل
            </Button>
            <Button variant="ghost" onClick={() => reset()}>
              إلغاء
            </Button>
          </div>
        </div>
      )}

      {mode.name === "codes" && <RecoveryCodes codes={mode.codes} fresh={mode.fresh} email={user?.email ?? ""} onDone={() => reset()} />}

      {(mode.name === "regenerate" || mode.name === "disable") && (
        <div className="flex max-w-md flex-col gap-5">
          <p className="text-sm leading-7 text-ink">
            {mode.name === "regenerate"
              ? "ستتوقف رموز الاسترداد القديمة عن العمل. أدخل الرمز الحالي من تطبيق المصادقة للمتابعة."
              : "بعد الإيقاف يكفي البريد وكلمة المرور للدخول إلى حسابك. أكّد هويتك للمتابعة."}
          </p>
          {mode.name === "disable" && user?.hasPassword !== false && (
            <PasswordField label="كلمة المرور" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
          <div>
            <p className="mb-2 text-sm font-medium text-navy-900">رمز تطبيق المصادقة</p>
            <OtpInput
              value={code}
              onChange={setCode}
              disabled={busy}
              invalid={Boolean(error)}
              onComplete={(c) => {
                if (mode.name === "regenerate") void confirmRegenerate(c);
                else if (user?.hasPassword === false || password) void confirmDisable(c);
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={mode.name === "disable" ? "danger" : "primary"}
              loading={busy}
              disabled={code.join("").length !== 6 || (mode.name === "disable" && user?.hasPassword !== false && !password)}
              onClick={() => (mode.name === "regenerate" ? confirmRegenerate() : confirmDisable())}
            >
              {mode.name === "regenerate" ? "إنشاء رموز جديدة" : "إيقاف المصادقة الثنائية"}
            </Button>
            <Button variant="ghost" onClick={() => reset()}>
              إلغاء
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

function SecretKey({ secret }: { secret: string }) {
  const [copied, setCopied] = useState(false);
  const grouped = secret.match(/.{1,4}/g)?.join(" ") ?? secret;
  return (
    <div className="flex max-w-md items-center gap-2 rounded-xl border border-line bg-canvas p-2 ps-4">
      <code dir="ltr" className="min-w-0 flex-1 break-all font-mono text-[13px] tracking-wider text-navy-900">
        {grouped}
      </code>
      <Button
        variant="secondary"
        size="sm"
        onClick={async () => {
          await navigator.clipboard?.writeText(secret).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
        {copied ? "نُسخ" : "نسخ"}
      </Button>
    </div>
  );
}

function RecoveryCodes({ codes, fresh, email, onDone }: { codes: string[]; fresh: boolean; email: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = [
    "مسار التميز — رموز استرداد المصادقة الثنائية",
    email,
    "",
    ...codes,
    "",
    "كل رمز يُستخدم مرة واحدة فقط. احفظ هذا الملف في مكان آمن.",
  ].join("\n");

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "masar-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-5">
      {fresh && (
        <Alert tone="success" title="تم تفعيل المصادقة الثنائية">
          من الآن سنطلب رمز التطبيق عند كل دخول.
        </Alert>
      )}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">
        <TriangleAlert size={18} className="mt-1 shrink-0" />
        <p>
          احفظ رموز الاسترداد الآن — <b>لن تظهر مرة أخرى</b>. إذا فقدت هاتفك، يمكنك الدخول بأحدها. كل رمز يعمل مرة واحدة.
        </p>
      </div>
      <ul dir="ltr" className="grid grid-cols-2 gap-2 rounded-xl border border-line bg-canvas p-4 font-mono text-sm text-navy-900 sm:grid-cols-5">
        {codes.map((c) => (
          <li key={c} className="rounded-lg bg-white px-2 py-1.5 text-center tracking-wider shadow-card">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={download}>
          <Download size={16} />
          تنزيل كملف
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard?.writeText(text).catch(() => undefined);
            setCopied(true);
            setSaved(true);
          }}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? "نُسخت" : "نسخ الكل"}
        </Button>
      </div>
      <label className="flex cursor-pointer items-center gap-3 text-sm text-ink">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4 accent-teal-600" />
        حفظت رموز الاسترداد في مكان آمن
      </label>
      <Button onClick={onDone} disabled={!saved} className="w-fit">
        تم
      </Button>
    </div>
  );
}
