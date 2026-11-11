"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Check,
  Copy,
  ExternalLink,
  HeartHandshake,
  KeyRound,
  Loader2,
  MessageCircle,
  Phone,
  QrCode,
  RefreshCw,
  Send,
  Share2,
  ShieldCheck,
  User,
} from "lucide-react";
import { fetchWithAuth, readJson } from "@/lib/apiClient";
import Spinner from "@/components/ui/Spinner";

export interface ParentLinkData {
  linkId: string;
  parentId: string;
  parentName: string;
  parentPhone: string;
  pin: string;
  magicToken: string;
  magicLoginLink: string;
  whatsappLink: string;
  whatsappLink970?: string;
  whatsappLink972?: string;
  qrData: string;
  qrDataUrl: string;
  expiresAt: string;
}

export default function StudentFamilyLinkCard() {
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkData, setLinkData] = useState<ParentLinkData | null>(null);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [waPrefix, setWaPrefix] = useState<"972" | "970">("972");

  // التحقق من صحة المدخلات
  const validateForm = (): string | null => {
    if (!parentName.trim() || parentName.trim().length < 2) {
      return "يرجى إدخال اسم ولي الأمر بشكل صحيح (حرفان على الأقل).";
    }
    const cleanPhone = parentPhone.replace(/[\s\-\(\)\.]/g, "").trim();
    const isPalestineMobile =
      /^0(56|59)\d{7}$/.test(cleanPhone) ||
      /^(\+970|\+972|00970|00972)?0?(56|59)\d{7}$/.test(cleanPhone);

    if (!isPalestineMobile) {
      return "رقم الهاتف غير صالح. يجب أن يبدأ بـ 056 أو 059 فقط ويتكون من 10 أرقام (مثال: 0591234567 أو 0561234567).";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetchWithAuth("/parent/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          parentName: parentName.trim(),
          parentPhone: parentPhone.trim(),
        }),
      });

      const data = await readJson<ParentLinkData & { message?: string | string[] }>(res);

      if (!res.ok) {
        let msg = "تعذر إنشاء رابط الربط، يرجى المحاولة لاحقاً.";
        if (data?.message) {
          msg = Array.isArray(data.message) ? data.message.join("، ") : data.message;
        }
        if (res.status === 400 && msg.includes("own contact")) {
          msg = "لا يمكنك تسجيل رقم هاتفك الشخصي كولي أمر لحسابك.";
        } else if (res.status === 409) {
          msg = "رقم الهاتف مسجل مسبقاً بحساب آخر غير مؤهل كولي أمر.";
        }
        setError(msg);
        return;
      }

      if (data) {
        setLinkData(data as ParentLinkData);
      }
    } catch {
      setError("حدث خطأ أثناء الاتصال بالخادم، يرجى التحقق من اتصالك بالإنترنت.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPin = async () => {
    if (!linkData?.pin) return;
    try {
      await navigator.clipboard.writeText(linkData.pin);
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2500);
    } catch {
      // تجاهل أخطاء الحافظة
    }
  };

  const handleCopyLink = async () => {
    if (!linkData?.magicLoginLink) return;
    try {
      await navigator.clipboard.writeText(linkData.magicLoginLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // تجاهل أخطاء الحافظة
    }
  };

  const handleReset = () => {
    setLinkData(null);
    setError(null);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-card transition-all">
      {/* رأس البطاقة الترحيبي */}
      <div className="border-b border-line/80 bg-gradient-to-r from-navy-950 via-navy-900 to-navy-800 p-6 text-white">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/20 text-teal-300 ring-1 ring-teal-400/30">
              <HeartHandshake size={22} />
            </span>
            <div>
              <h2 className="text-lg font-bold tracking-tight text-white sm:text-xl">
                ربط حساب ولي الأمر
              </h2>
              <p className="mt-0.5 text-xs text-navy-200 sm:text-sm">
                دعوة والديك لمتابعة أدائك الدراسي ونتائج التقييمات في مسار التميز
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/25 bg-teal-500/10 px-3 py-1 text-xs font-medium text-teal-200">
            <ShieldCheck size={14} className="text-teal-400" />
            دخول آمن بدون بريد إلكتروني
          </span>
        </div>
      </div>

      <div className="p-6 sm:p-8">
        {!linkData ? (
          /* ================= النموذج الأولي للدعوة ================= */
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4 text-xs leading-relaxed text-teal-900 sm:text-sm">
              <p className="font-semibold text-teal-800">💡 كيف تعمل متابعة ولي الأمر؟</p>
              <p className="mt-1 text-teal-700">
                بمجرد إدخال بيانات الوالد/الوالدة، سنولد له رمز عائلة خاصاً ورابطاً سحرياً ليدخل بضغطة زر واحدة عبر واتساب أو بمسح رمز الـ QR مباشرة، دون الحاجة لإنشاء كلمة مرور أو بريد إلكتروني.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800"
              >
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2">
              {/* حقل اسم ولي الأمر */}
              <div>
                <label
                  htmlFor="parentName"
                  className="mb-1.5 block text-sm font-semibold text-navy-950"
                >
                  اسم ولي الأمر (الأب / الأم)
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted">
                    <User size={18} />
                  </span>
                  <input
                    id="parentName"
                    type="text"
                    required
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    placeholder="مثال: أحمد عبد الله"
                    className="block w-full rounded-xl border border-line bg-canvas py-2.5 pe-4 ps-10 text-sm font-medium text-ink transition-colors placeholder:text-subtle focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>
              </div>

              {/* حقل رقم الهاتف */}
              <div>
                <label
                  htmlFor="parentPhone"
                  className="mb-1.5 block text-sm font-semibold text-navy-950"
                >
                  رقم الهاتف المحمول (الواتساب)
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 start-0 flex items-center ps-3 text-muted">
                    <Phone size={18} />
                  </span>
                  <input
                    id="parentPhone"
                    type="tel"
                    required
                    dir="ltr"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    placeholder="059xxxxxxx أو 056xxxxxxx"
                    className="block w-full rounded-xl border border-line bg-canvas py-2.5 pe-4 ps-10 text-start text-sm font-medium text-ink transition-colors placeholder:text-subtle focus:border-teal-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-600/20"
                  />
                </div>
                <p className="mt-1 text-xs text-muted">
                  يجب أن يبدأ الرقم بـ 056 (أوريدو) أو 059 (جوال) ويتكون من 10 أرقام.
                </p>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-navy-800 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin text-white" />
                  <span>جاري إنشاء بيانات الربط الآمنة...</span>
                </>
              ) : (
                <>
                  <Send size={18} />
                  <span>إنشاء بطاقة الدعوة ورمز الدخول</span>
                </>
              )}
            </button>
          </form>
        ) : (
          /* ================= شاشة النجاح وعرض الـ QR والـ PIN والواتساب ================= */
          <div className="space-y-8 animate-fade">
            {/* رسالة نجاح علوية */}
            <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/70 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
                  <Check size={20} strokeWidth={2.5} />
                </span>
                <div>
                  <h3 className="font-bold text-teal-950 sm:text-base">
                    تم إنشاء بيانات ربط ({linkData.parentName}) بنجاح!
                  </h3>
                  <p className="text-xs text-teal-800 sm:text-sm">
                    رقم الهاتف المعتمد: <span dir="ltr" className="font-semibold">{linkData.parentPhone}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1 rounded-lg border border-teal-300 bg-white px-3 py-1.5 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-50"
              >
                <RefreshCw size={14} />
                <span>ربط جديد</span>
              </button>
            </div>

            <div className="grid gap-8 lg:grid-cols-[auto_1fr] items-center">
              {/* قسم الـ QR Code */}
              <div className="flex flex-col items-center justify-center rounded-2xl border border-line bg-canvas p-6 text-center shadow-inner">
                <div className="relative rounded-xl border-2 border-white bg-white p-4 shadow-raised">
                  <QRCodeSVG
                    value={linkData.qrData || linkData.magicLoginLink}
                    size={200}
                    level="H"
                    includeMargin={false}
                    className="h-44 w-44 sm:h-52 sm:w-52"
                  />
                  <div className="mt-2 flex items-center justify-center gap-1 text-[11px] font-medium text-muted">
                    <QrCode size={13} />
                    <span>رمز دخول سريع مباشر</span>
                  </div>
                </div>
                <p className="mt-3 max-w-[220px] text-xs font-medium text-muted">
                  اطلب من ولي أمرك توجيه كاميرا الهاتف لمسح الرمز والدخول فوراً
                </p>
              </div>

              {/* قسم رمز الـ PIN وروابط المشاركة */}
              <div className="flex flex-col justify-between space-y-6">
                {/* رمز الـ PIN */}
                <div className="rounded-2xl border border-line bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-navy-800">
                      <KeyRound size={15} className="text-gold-500" />
                      رمز العائلة الخاص بولي الأمر (PIN)
                    </span>
                    <span className="rounded bg-navy-50 px-2 py-0.5 text-[11px] font-medium text-navy-600">
                      مكون من 6 أرقام
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-navy-100 bg-navy-50/60 px-5 py-3">
                    <span
                      dir="ltr"
                      className="font-mono text-3xl font-extrabold tracking-[0.25em] text-navy-900 sm:text-4xl tabular"
                    >
                      {linkData.pin}
                    </span>

                    <button
                      type="button"
                      onClick={handleCopyPin}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-navy-200 bg-white px-3.5 py-2 text-xs font-bold text-navy-800 shadow-sm transition-all hover:bg-navy-50 active:scale-95"
                    >
                      {copiedPin ? (
                        <>
                          <Check size={16} className="text-teal-600" />
                          <span className="text-teal-700">تم النسخ!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={16} />
                          <span>نسخ الرمز</span>
                        </>
                      )}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-subtle">
                    يمكن لولي أمرك كتابة هذا الرمز ورقم هاتفه في صفحة الدخول اليدوي.
                  </p>
                </div>

                {/* قسم خيارات إرسال واتساب ومفتاح 972 / 970 */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-navy-900">
                      مفتاح واتساب لرقم والدك:
                    </span>
                    <div className="inline-flex rounded-lg border border-line bg-canvas p-0.5 text-xs font-bold">
                      <button
                        type="button"
                        onClick={() => setWaPrefix("972")}
                        className={`rounded-md px-2.5 py-1 transition-all ${
                          waPrefix === "972"
                            ? "bg-white text-navy-950 shadow-sm"
                            : "text-muted hover:text-navy-900"
                        }`}
                      >
                        +972 (الأكثر انتشاراً)
                      </button>
                      <button
                        type="button"
                        onClick={() => setWaPrefix("970")}
                        className={`rounded-md px-2.5 py-1 transition-all ${
                          waPrefix === "970"
                            ? "bg-white text-navy-950 shadow-sm"
                            : "text-muted hover:text-navy-900"
                        }`}
                      >
                        +970 (الرمز الوطني)
                      </button>
                    </div>
                  </div>

                  {/* زر الإرسال لواتساب البارز */}
                  <a
                    href={
                      waPrefix === "972"
                        ? linkData.whatsappLink972 ||
                          linkData.whatsappLink.replace("wa.me/970", "wa.me/972")
                        : linkData.whatsappLink970 || linkData.whatsappLink
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-6 py-3.5 text-base font-bold text-white shadow-md transition-all hover:bg-[#20ba5a] hover:shadow-lg active:scale-[0.99]"
                  >
                    <MessageCircle size={22} className="fill-current" />
                    <span>📲 أرسل الرابط لوالدي عبر واتساب (+{waPrefix})</span>
                    <ExternalLink size={16} className="opacity-80" />
                  </a>

                  {/* زر المشاركة العامة لاختيار الوالد مباشرة من جهات الاتصال */}
                  <button
                    type="button"
                    onClick={async () => {
                      if (typeof navigator !== "undefined" && navigator.share) {
                        try {
                          await navigator.share({
                            title: "دعوة ولي الأمر - مسار التميز",
                            text: `مرحباً، يمكنك متابعة أدائي الدراسي في مسار التميز عبر الرابط التالي:\n${linkData.magicLoginLink}\nرمز العائلة (PIN): ${linkData.pin}`,
                            url: linkData.magicLoginLink,
                          });
                        } catch {
                          // تجاهل إلغاء المشاركة
                        }
                      } else {
                        handleCopyLink();
                      }
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-navy-200 bg-white px-5 py-2.5 text-xs font-bold text-navy-900 shadow-sm transition-colors hover:bg-navy-50"
                  >
                    <Share2 size={15} className="text-teal-600" />
                    <span>📲 أو اختر والدك من جهات الاتصال (مشاركة عامة)</span>
                  </button>

                  <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-2.5 text-[11px] leading-relaxed text-teal-800">
                    💡 في فلسطين، بعض حسابات واتساب مسجلة بـ (+972) وبعضها بـ (+970). إذا ظهرت رسالة أن الرقم غير مسجل بواتساب، بدّل المفتاح بالأعلى أو استخدم زر &quot;اختر والدك من جهات الاتصال&quot;.
                  </div>
                </div>

                {/* زر نسخ الرابط السحري المباشر */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-4">
                  <span className="text-xs text-muted">
                    أو انسخ الرابط المباشر وأرسله بأي طريقة أخرى:
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs font-semibold text-navy-900 transition-colors hover:bg-line/60"
                  >
                    {copiedLink ? (
                      <>
                        <Check size={14} className="text-teal-600" />
                        <span className="text-teal-700">تم نسخ الرابط السحري!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>نسخ الرابط المباشر</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
