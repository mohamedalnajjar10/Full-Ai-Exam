import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/layout/AuthShell";
import RegisterForm from "./RegisterForm";

export const metadata: Metadata = { title: "إنشاء حساب" };

export default function RegisterPage() {
  return (
    <AuthShell
      title="أنشئ حسابك المجاني"
      description={
        <>
          لديك حساب بالفعل؟{" "}
          <Link href="/login" className="font-semibold text-teal-700 hover:underline">
            سجّل الدخول
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
