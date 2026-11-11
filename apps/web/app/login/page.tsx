import type { Metadata } from "next";
import Link from "next/link";
import AuthShell from "@/components/layout/AuthShell";
import LoginForm from "./components/LoginForm";
import { safeNext } from "@/lib/authRules";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <AuthShell
      title="تسجيل الدخول"
      description={
        <>
          أهلاً بعودتك. ليس لديك حساب؟{" "}
          <Link href="/register" className="font-semibold text-teal-700 hover:underline">
            أنشئ حساباً مجاناً
          </Link>
        </>
      }
    >
      <LoginForm next={safeNext(next)} />
    </AuthShell>
  );
}
