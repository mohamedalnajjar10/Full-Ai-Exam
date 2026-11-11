"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Lock,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { apiUrl } from "@/lib/apiBase";
import { readJson } from "@/lib/apiClient";
import { saveParentDeviceTrustToken } from "@/lib/parentStorage";
import Spinner from "@/components/ui/Spinner";
import Logo from "@/components/ui/Logo";

interface ParentLoginResponse {
  deviceTrustToken?: string;
  user?: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    phone: string;
  };
  message?: string | string[];
}

function MagicLoginHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!token) {
      setLoading(false);
      setError("الرابط المباشر غير مكتمل أو لا يحتوي على رمز التحقق.");
      return;
    }

    const authenticateWithToken = async () => {
      try {
        const response = await fetch(apiUrl("/auth/parent/login"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ magicToken: token }),
        });

        const data = await readJson<ParentLoginResponse>(response);

        if (!active) return;

        if (!response.ok) {
          let msg = "رمز الدخول المباشر هذا منتهي الصلاحية أو تم استخدامه مسبقاً.";
          if (response.status === 403) {
            msg = "تم إيقاف هذا الحساب مؤقتاً. يرجى التواصل مع إدارة المنصة.";
          }
          setError(msg);
          setLoading(false);
          return;
        }

        if (data?.deviceTrustToken) {
          saveParentDeviceTrustToken(data.deviceTrustToken);
        }

        router.replace("/parent/dashboard");
      } catch {
        if (!active) return;
        setError("تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مجدداً.");
        setLoading(false);
      }
    };

    authenticateWithToken();

    return () => {
      active = false;
    };
  }, [token, router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner className="h-10 w-10 text-teal-600" />
        <h2 className="text-xl font-bold text-navy-950">
          جارٍ التحقق من رابط الدخول المباشر...
        </h2>
        <p className="max-w-sm text-sm text-muted">
          لحظات ويتم تسجيل دخولك بأمان إلى بوابة المتابعة الأبوية.
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-md rounded-2xl border border-red-200 bg-red-50/50 p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle size={24} />
        </div>
        <h2 className="text-lg font-bold text-red-950">تعذر الدخول بالرابط المباشر</h2>
        <p className="mt-2 text-sm leading-relaxed text-red-800">{error}</p>
        <p className="mt-4 text-xs text-muted">
          لا تقلق، يمكنك دائماً تسجيل الدخول يدوياً عبر رقم هاتفك المسجل ورمز العائلة المكون من 6 أرقام.
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/parent/login"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-700"
          >
            <Phone size={16} />
            <span>تسجيل الدخول برقم الهاتف ورمز العائلة</span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowRight size={14} />
            <span>العودة للصفحة الرئيسية</span>
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

export default function ParentMagicLoginPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 py-12">
      <div className="mb-8">
        <Logo />
      </div>

      <Suspense
        fallback={
          <div className="flex flex-col items-center gap-4 text-center">
            <Spinner className="h-10 w-10 text-teal-600" />
            <p className="text-sm font-medium text-navy-900">
              جارٍ معالجة رابط التوثيق...
            </p>
          </div>
        }
      >
        <MagicLoginHandler />
      </Suspense>
    </div>
  );
}
