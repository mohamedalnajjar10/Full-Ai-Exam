"use client";
import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { PasswordField } from "@/components/ui/Field";
import Alert from "@/components/ui/Alert";
import PasswordChecklist from "@/components/auth/PasswordChecklist";
import { passwordError } from "@/lib/authRules";
import { changePassword, securityError } from "@/lib/account";
import { resetRefreshCooldown } from "@/lib/apiClient";
import Section from "./Section";

export default function PasswordSection() {
  const { user, refresh } = useAuth();
  const { showToast } = useToast();
  // حسابات Google بدون كلمة مرور: "تعيين" بدل "تغيير"، وبدون الحالية
  const hasPassword = user?.hasPassword !== false;

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: typeof errors = {};
    if (hasPassword && !current) found.current = "أدخل كلمة المرور الحالية";
    const pw = passwordError(next);
    if (pw) found.next = pw;
    if (confirm !== next) found.confirm = "كلمتا المرور غير متطابقتين";
    setErrors(found);
    if (Object.keys(found).length) return;

    setSaving(true);
    setFormError("");
    try {
      await changePassword(next, hasPassword ? current : undefined);
      // الباك اند ألغى كل الجلسات وأصدر جلسة جديدة لهذا الجهاز
      resetRefreshCooldown();
      refresh();
      setCurrent("");
      setNext("");
      setConfirm("");
      showToast({ type: "success", message: hasPassword ? "تم تغيير كلمة المرور، وسُجّل خروجك من الأجهزة الأخرى." : "تم تعيين كلمة المرور لحسابك." });
    } catch (err) {
      const msg = securityError(err);
      if (msg.includes("الحالية")) setErrors({ current: msg });
      else setFormError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      id="password"
      icon={LockKeyhole}
      title={hasPassword ? "كلمة المرور" : "تعيين كلمة مرور"}
      description={
        hasPassword
          ? "عند تغييرها يُسجَّل خروجك من كل الأجهزة الأخرى تلقائياً."
          : "أنشأت حسابك عبر Google. عيّن كلمة مرور لتتمكن من الدخول بالبريد أيضاً."
      }
    >
      <form onSubmit={submit} className="flex max-w-md flex-col gap-4" noValidate>
        {formError && <Alert tone="error">{formError}</Alert>}
        {hasPassword && (
          <PasswordField
            label="كلمة المرور الحالية"
            name="current-password"
            autoComplete="current-password"
            value={current}
            error={errors.current}
            onChange={(e) => {
              setCurrent(e.target.value);
              setErrors((x) => ({ ...x, current: undefined }));
            }}
          />
        )}
        <div className="flex flex-col gap-2.5">
          <PasswordField
            label="كلمة المرور الجديدة"
            name="new-password"
            autoComplete="new-password"
            value={next}
            error={errors.next}
            onChange={(e) => {
              setNext(e.target.value);
              setErrors((x) => ({ ...x, next: undefined }));
            }}
          />
          <PasswordChecklist value={next} />
        </div>
        <PasswordField
          label="تأكيد كلمة المرور الجديدة"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          error={errors.confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setErrors((x) => ({ ...x, confirm: undefined }));
          }}
        />
        <Button type="submit" loading={saving} className="w-fit">
          {hasPassword ? "تغيير كلمة المرور" : "تعيين كلمة المرور"}
        </Button>
      </form>
    </Section>
  );
}
