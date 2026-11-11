"use client";
import { useState } from "react";
import { BadgeCheck, UserRound } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/ToastProvider";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import Badge from "@/components/ui/Badge";
import Avatar from "@/components/ui/Avatar";
import { securityError, updateProfile } from "@/lib/account";
import Section from "./Section";

export default function ProfileSection() {
  const { user, refresh } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState(user?.name ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== (user?.name ?? "");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (value.length < 2) return setError("الاسم قصير جداً");
    setSaving(true);
    setError("");
    try {
      await updateProfile(value);
      refresh();
      showToast({ type: "success", message: "تم حفظ اسمك." });
    } catch (err) {
      setError(securityError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section id="profile" icon={UserRound} title="الملف الشخصي" description="الاسم الذي يظهر في لوحتك وفي رسائلنا إليك.">
      <div className="mb-6 flex items-center gap-4">
        <Avatar name={user?.name} src={user?.avatar} size={56} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-navy-900">{user?.name ?? "—"}</p>
          <p dir="ltr" className="truncate text-end text-sm text-muted">
            {user?.email}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {user?.emailVerified && (
              <Badge tone="teal" icon={<BadgeCheck size={13} />}>
                البريد مؤكَّد
              </Badge>
            )}
            {user?.oauthProvider?.toLowerCase() === "google" && <Badge tone="neutral">مرتبط بحساب Google</Badge>}
          </div>
        </div>
      </div>

      <form onSubmit={save} className="flex flex-col gap-4 sm:flex-row sm:items-end" noValidate>
        <div className="flex-1">
          <TextField
            label="الاسم الكامل"
            name="name"
            autoComplete="name"
            value={name}
            maxLength={100}
            error={error}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
        </div>
        <Button type="submit" disabled={!dirty} loading={saving} className="h-12 sm:mb-[1px]">
          حفظ
        </Button>
      </form>
      <p className="mt-3 text-[13px] text-subtle">لا يمكن تغيير البريد الإلكتروني حالياً. تواصل مع الدعم إن احتجت ذلك.</p>
    </Section>
  );
}
