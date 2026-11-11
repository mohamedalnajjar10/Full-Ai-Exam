"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  HeartHandshake,
  KeyRound,
  LineChart,
  Loader2,
  Lock,
  Phone,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { apiUrl } from "@/lib/apiBase";
import { readJson } from "@/lib/apiClient";
import {
  clearParentDeviceTrustToken,
  getParentDeviceTrustToken,
  saveParentDeviceTrustToken,
} from "@/lib/parentStorage";
import { notifyParentAuthChange, useAuth } from "@/context/AuthContext";
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

export default function ParentLoginPage() {
  const router = useRouter();
  const { user, isLoggedIn, hasParentSession, setHasParentSession } = useAuth();

  const [phone, setPhone] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingDevice, setCheckingDevice] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const attemptDeviceLogin = async () => {
      const storedToken = getParentDeviceTrustToken();
      if (!storedToken) {
        if (active) setCheckingDevice(false);
        return;
      }

      try {
        const response = await fetch(apiUrl("/auth/parent/device-login"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceTrustToken: storedToken }),
        });

        if (!response.ok) {
          clearParentDeviceTrustToken();
          setHasParentSession(false);
          notifyParentAuthChange(false);
          if (active) setCheckingDevice(false);
          return;
        }

        const data = await readJson<ParentLoginResponse>(response);
        if (data?.deviceTrustToken) {
          saveParentDeviceTrustToken(data.deviceTrustToken);
        }
        setHasParentSession(true);
        notifyParentAuthChange(true);
        router.replace("/parent/dashboard");
      } catch {
        if (active) setCheckingDevice(false);
      }
    };

    attemptDeviceLogin();
    return () => {
      active = false;
    };
  }, [router, setHasParentSession]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanPhone = phone.replace(/[\s\-\(\)\.]/g, "").trim();
    const cleanPin = pin.trim();

    const isPalestineMobile =
      /^0(56|59)\d{7}$/.test(cleanPhone) ||
      /^(\+970|\+972|00970|00972)?0?(56|59)\d{7}$/.test(cleanPhone);

    if (!isPalestineMobile) {
      setError("رقم الهاتف غير صالح. يجب أن يبدأ بـ 056 أو 059 فقط ويتكون من 10 أرقام (مثال: 0591234567 أو 0561234567).");
      return;
    }

    if (!cleanPin || cleanPin.length !== 6 || !/^\d{6}$/.test(cleanPin)) {
      setError("رمز العائلة (PIN) يجب أن يتكون من 6 أرقام تماماً.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(apiUrl("/auth/parent/login"), {
        method: "POST",
        credentials: "include", // يضمن حفظ كوكيز access_token و refresh_token كـ httpOnly
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanPhone,
          pin: cleanPin,
        }),
      });

      const data = await readJson<ParentLoginResponse>(response);

      if (!response.ok) {
        let msg = "بيانات الدخول غير صحيحة. يرجى التأكد من رقم الهاتف ورمز العائلة.";
        if (data?.message) {
          msg = Array.isArray(data.message) ? data.message.join("، ") : data.message;
        }
        if (response.status === 401) {
          msg = "رمز العائلة (PIN) أو رقم الهاتف غير صحيح، أو تم إلغاء الربط.";
        } else if (response.status === 403) {
          msg = "هذا الحساب موقوف حالياً. يرجى التواصل مع إدارة المنصة.";
        }
        setError(msg);
        return;
      }

      // =========================================================================
      // حفظ deviceTrustToken في localStorage كخط دفاع ضد سياسة Safari في مسح الكوكيز
      // =========================================================================
      if (data?.deviceTrustToken) {
        saveParentDeviceTrustToken(data.deviceTrustToken);
      }

      setHasParentSession(true);
      notifyParentAuthChange(true);
      router.replace("/parent/dashboard");
    } catch {
      setError("تعذر الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت والمحاولة مجدداً.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingDevice) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 text-center">
        <Logo />
        <div className="mt-8 flex flex-col items-center gap-3">
          <Spinner className="h-8 w-8 text-teal-600" />
          <p className="text-sm font-medium text-navy-900">
            جارٍ التحقق من جهازك الموثوق ومتابعة الجلسة...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      {/* قسم النموذج الأيمن (LTR: يسار / RTL: يمين) */}
      <div className="flex flex-col">
        {/* شريط علوي */}
        <div className="flex h-16 items-center justify-between px-5 sm:px-8 lg:h-20 lg:px-12">
          <Logo />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-navy-900"
          >
            <ArrowRight size={16} />
            <span>العودة للمنصة</span>
          </Link>
        </div>

        {/* جسم الصفحة الرئيسي */}
        <main className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-[420px]">
            <div className="mb-6">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">
                <ShieldCheck size={14} className="text-teal-600" />
                بوابة المتابعة الأبوية
              </span>
              <h1 className="mt-3 text-2xl font-bold tracking-tight text-navy-950 sm:text-3xl">
                تسجيل دخول ولي الأمر
              </h1>
              <p className="mt-2 text-sm text-muted">
                أدخل رقم هاتفك ورمز العائلة المكون من 6 أرقام لمتابعة أداء ابنك الأكاديمي.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-semibold leading-relaxed text-red-800 sm:text-sm"
              >
                ⚠️ {error}
              </div>
            )}

            {/* تنبيه الجهاز المشترك في حال وجود جلسة طالب نشطة */}
            {isLoggedIn && user && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50/80 p-4 text-xs font-medium text-teal-950 shadow-xs">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" />
                <div className="min-w-0">
                  <p className="font-bold text-teal-900">
                    جهاز عائلي مشترك (جلسة الطالب: {user.name} نشطة)
                  </p>
                  <p className="mt-1 leading-relaxed text-teal-800">
                    تسجيل دخولك كولي أمر لن يلغي جلسة الطالب على هذا المتصفح. يمكنكما التبديل بين الحسابين بسلاسة في أي وقت دون تسجيل الخروج.
                  </p>
                </div>
              </div>
            )}

            {/* تنبيه الجلسة النشطة لولي الأمر */}
            {hasParentSession && (
              <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-navy-200 bg-navy-50/80 p-4 text-xs font-semibold text-navy-900 shadow-xs">
                <span>لديك جلسة ولي أمر نشطة بالفعل على هذا الجهاز:</span>
                <Link
                  href="/parent/dashboard"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-navy-900 px-3 py-1.5 text-xs text-white transition-colors hover:bg-navy-800"
                >
                  <span>لوحة المتابعة</span>
                  <ArrowRight size={14} className="rotate-180" />
                </Link>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* حقل رقم الهاتف */}
              <div>
                <label
                  htmlFor="phone"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-navy-900"
                >
                  رقم الهاتف المحمول
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-muted">
                    <Phone size={18} />
                  </span>
                  <input
                    id="phone"
                    type="tel"
                    dir="ltr"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="059xxxxxxx أو 056xxxxxxx"
                    className="block w-full rounded-xl border border-line bg-canvas py-3 pe-4 ps-11 text-start text-sm font-semibold text-ink placeholder:text-subtle focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>
                <p className="mt-1 text-[11px] text-subtle">
                  يجب أن يبدأ الرقم بـ 056 (أوريدو) أو 059 (جوال)
                </p>
              </div>

              {/* حقل رمز العائلة (PIN) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="pin"
                    className="text-xs font-bold uppercase tracking-wider text-navy-900"
                  >
                    رمز العائلة (PIN)
                  </label>
                  <span className="text-[11px] font-semibold text-teal-700">
                    6 أرقام سرية
                  </span>
                </div>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3.5 text-muted">
                    <Lock size={18} />
                  </span>
                  <input
                    id="pin"
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    dir="ltr"
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="block w-full rounded-xl border border-line bg-canvas py-3 pe-12 ps-11 text-center font-mono text-xl font-bold tracking-[0.35em] text-navy-950 placeholder:tracking-normal placeholder:text-subtle focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20 tabular"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute inset-y-0 end-0 flex items-center pe-3.5 text-muted hover:text-navy-900"
                    title={showPin ? "إخفاء الرمز" : "إظهار الرمز"}
                  >
                    {showPin ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* زر الدخول */}
              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-6 py-3.5 text-sm font-bold text-white shadow-md transition-all hover:bg-navy-800 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-white" />
                    <span>جاري تسجيل الدخول...</span>
                  </>
                ) : (
                  <>
                    <KeyRound size={18} />
                    <span>دخول إلى لوحة المتابعة</span>
                  </>
                )}
              </button>
            </form>

            {/* بطاقة مساعدة لتوضيح كيفية الحصول على الـ PIN */}
            <div className="mt-8 rounded-2xl border border-line bg-canvas/70 p-4 text-xs leading-relaxed text-muted">
              <p className="flex items-center gap-1.5 font-bold text-navy-950">
                <Sparkles size={14} className="text-gold-500" />
                أين أجد رمز العائلة الخاص بي؟
              </p>
              <p className="mt-1">
                يقوم ابنك/ابنتك بإنشاء رمز العائلة المكون من 6 أرقام من داخل حسابه في منصة مسار التميز، أو تجده في رسالة الواتساب التي وصلتك مع الرابط السريع.
              </p>
            </div>

            <div className="mt-6 text-center text-xs text-muted">
              هل أنت طالب في الثانوية العامة (التوجيهي)؟{" "}
              <Link href="/login" className="font-bold text-teal-700 hover:underline">
                سجّل دخولك من هنا
              </Link>
            </div>
          </div>
        </main>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 pb-6 text-[13px] text-subtle">
          <Link href="/terms" className="hover:text-navy-900">
            الشروط والأحكام
          </Link>
          <Link href="/privacy" className="hover:text-navy-900">
            سياسة الخصوصية
          </Link>
          <Link href="/contact" className="hover:text-navy-900">
            الدعم الفني
          </Link>
        </div>
      </div>

      {/* اللوحة الجانبية التعريفية (تظهر بالشاشات الكبيرة) */}
      <aside className="relative hidden overflow-hidden bg-navy-950 lg:block" aria-hidden>
        <div className="bg-grid-inverse absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        <div className="absolute -bottom-40 -start-40 h-[28rem] w-[28rem] rounded-full bg-teal-600/20 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-navy-100">
            <HeartHandshake size={15} className="text-teal-300" />
            شراكة الأسرة في رحلة التوجيهي
          </span>

          <div>
            <p className="max-w-md text-balance text-[30px] font-bold leading-[1.4] text-white">
              تابع إنجاز ابنك الدراسي خطوة بخطوة بكل طمأنينة ووضوح.
            </p>
            <ul className="mt-10 flex max-w-md flex-col gap-6">
              {[
                {
                  icon: LineChart,
                  title: "نتائج التقييمات أولاً بأول",
                  text: "اطلع على درجات الكويزات، نقاط القوة، والمواد التي تحتاج دعماً إضافياً.",
                },
                {
                  icon: Smartphone,
                  title: "جلسة دائمة وموثوقة",
                  text: "تقنية توثيق الجهاز تحافظ على استمرار تسجيل دخولك على الآيفون وأندرويد دون انقطاع.",
                },
                {
                  icon: ShieldCheck,
                  title: "خصوصية كاملة وأمان عائلي",
                  text: "ربط مشفر وموثوق بين حساب الطالب وولي أمره بدون مشاركة كلمات مرور.",
                },
              ].map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-teal-300 ring-1 ring-white/10">
                    <Icon size={19} strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block font-semibold text-white">{title}</span>
                    <span className="mt-1 block text-sm leading-6 text-navy-200">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-navy-300">
            منصة مسار التميز — معاً نحو التفوق والدرجات العالية في امتحان التوجيهي.
          </p>
        </div>
      </aside>
    </div>
  );
}
