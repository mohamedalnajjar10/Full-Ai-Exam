"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, MonitorSmartphone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import Section from "./Section";

export default function SessionsSection() {
  const { logout } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <Section
      id="sessions"
      icon={MonitorSmartphone}
      title="الأجهزة المسجّل منها"
      description="إن استخدمت جهازاً عاماً أو شككت أن أحداً دخل حسابك، سجّل الخروج من كل مكان ثم غيّر كلمة المرور."
    >
      <Button
        variant="secondary"
        className="text-rose-600"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          // تسجيل الخروج بيلغي كل جلسات التجديد للحساب، مش بس هذا الجهاز
          await logout();
          router.push("/login");
          router.refresh();
        }}
      >
        <LogOut size={16} />
        تسجيل الخروج من كل الأجهزة
      </Button>
    </Section>
  );
}
