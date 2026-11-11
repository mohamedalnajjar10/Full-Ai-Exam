"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Crown,
  Check,
  Zap,
  Target,
  MessageSquare,
  Sparkles,
  Ticket,
  ShieldCheck,
  CreditCard,
  PhoneCall,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  X,
  Home,
} from "lucide-react";
import {
  getSubscriptionPlans,
  getMySubscriptionStatus,
  redeemSubscriptionVoucher,
  createSubscriptionCheckout,
  type SubscriptionPlanItem,
  type UserSubscriptionStatus,
} from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import Logo from "@/components/ui/Logo";

export default function SubscriptionsPage() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [plans, setPlans] = useState<SubscriptionPlanItem[]>([]);
  const [status, setStatus] = useState<UserSubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // الخروج السلس والعودة للصفحة السابقة أو الرئيسية
  const handleExit = useCallback(() => {
    if (typeof window !== "undefined" && document.referrer && document.referrer.includes(window.location.host)) {
      router.back();
    } else {
      router.push("/home");
    }
  }, [router]);

  // حالة شحن الكود
  const [voucherCode, setVoucherCode] = useState("");
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState<string | null>(null);

  // حالة الدفع
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([
      getSubscriptionPlans(),
      isLoggedIn ? getMySubscriptionStatus().catch(() => null) : Promise.resolve(null),
    ])
      .then(([fetchedPlans, fetchedStatus]) => {
        setPlans(fetchedPlans);
        setStatus(fetchedStatus);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadData();
  }, [isLoggedIn]);

  const handleRedeemVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voucherCode.trim()) return;

    if (!isLoggedIn) {
      setRedeemError("يرجى تسجيل الدخول أولاً لشحن كود التفعيل.");
      return;
    }

    setRedeemLoading(true);
    setRedeemError(null);
    setRedeemSuccess(null);

    try {
      const res = await redeemSubscriptionVoucher(voucherCode);
      setRedeemSuccess(res.message);
      setVoucherCode("");
      // تحديث البيانات
      loadData();
    } catch (err: any) {
      setRedeemError(err?.message || "فشل شحن كود التفعيل. تأكد من صحة الكود وصلاحيته.");
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleSubscribe = async (planCode: string) => {
    if (!isLoggedIn) {
      window.location.href = `/login?redirect=/subscriptions`;
      return;
    }

    if (planCode === "FREE") return;

    setCheckoutLoading(planCode);
    setCheckoutMessage(null);

    try {
      const res = await createSubscriptionCheckout(planCode);
      setCheckoutMessage(
        `${res.message} يمكنك أيضاً شحن الباقة فوراً عبر كروت التفعيل أو التواصل مع الدعم للتفعيل المباشر.`,
      );
    } catch (err: any) {
      setCheckoutMessage(err?.message || "حدث خطأ أثناء بدء عملية الاشتراك.");
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="container-page py-6 sm:py-10 space-y-8 sm:space-y-12" dir="rtl">
      {/* شريط الخروج والتنقل العلوي */}
      <nav aria-label="التنقل العلوي والخروج" className="flex items-center justify-between pb-4 border-b border-line/70">
        <Logo href="/home" size="sm" />

        <div className="flex items-center gap-2">
          <Link
            href="/home"
            className="inline-flex items-center gap-1.5 rounded-xl border border-transparent px-3 py-1.5 text-xs sm:text-sm font-semibold text-muted hover:text-navy-900 hover:bg-canvas transition-colors"
          >
            <Home size={16} />
            <span>الرئيسية</span>
          </Link>
          <button
            type="button"
            onClick={handleExit}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-white text-muted shadow-xs transition-all hover:bg-canvas hover:text-navy-950 hover:border-gold-300 active:scale-95"
            aria-label="إغلاق والعودة"
            title="إغلاق"
          >
            <X size={18} />
          </button>
        </div>
      </nav>

      {/* الترويسة الرئيسية */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-gold-50 border border-gold-200/80 px-4 py-1.5 text-xs font-bold text-gold-800 shadow-xs">
          <Crown size={15} className="text-gold-600" />
          <span>باقات التميز والتفوق لطلاب الثانوية العامة (التوجيهي)</span>
        </div>
        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-navy-950 tracking-tight">
          اختر باقتك وانطلق نحو معدلك الوزاري المنشود
        </h1>
        <p className="text-sm sm:text-base text-muted max-w-2xl mx-auto leading-relaxed">
          حصص تدريبية يومية بالذكاء الاصطناعي تحاكي امتحانات الثانوية العامة وفق معايير وزارة التربية والتعليم وهرم بلوم المعرفي.
        </p>
      </div>

      {/* بطاقة الاشتراك الحالية (إن كان مسجل دخول) */}
      {isLoggedIn && status && (
        <Card className="max-w-4xl mx-auto border-teal-200 bg-gradient-to-r from-teal-50/50 via-white to-canvas p-6 sm:p-8 shadow-card">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm">
                  <Crown size={20} />
                </span>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-navy-900">
                    باقتك المفعلة: {status.planName}
                  </h3>
                  <p className="text-xs text-muted">
                    {status.expiresAt
                      ? `ينتهي اشتراكك في ${new Date(status.expiresAt).toLocaleDateString("ar-EG")} (متبقٍ ${status.daysRemaining} يوم)`
                      : "باقة مجانية دائمة"}
                  </p>
                </div>
              </div>
            </div>

            {/* إحصائيات الرصيد اليومي المتبقي */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-white border border-line p-3">
                <span className="block text-xs text-muted mb-0.5">الكويزات</span>
                <span className="text-sm sm:text-base font-bold text-navy-900">
                  {status.quotas.quiz.limit === null
                    ? "مفتوح ♾️"
                    : `${status.quotas.quiz.remaining}/${status.quotas.quiz.limit}`}
                </span>
              </div>
              <div className="rounded-xl bg-white border border-line p-3">
                <span className="block text-xs text-muted mb-0.5">التقييمات</span>
                <span className="text-sm sm:text-base font-bold text-navy-900">
                  {status.quotas.assessment.limit === null
                    ? "مفتوح ♾️"
                    : `${status.quotas.assessment.remaining}/${status.quotas.assessment.limit}`}
                </span>
              </div>
              <div className="rounded-xl bg-white border border-line p-3">
                <span className="block text-xs text-muted mb-0.5">المستشار</span>
                <span className="text-sm sm:text-base font-bold text-navy-900">
                  {status.quotas.chat.limit === null
                    ? "مفتوح ♾️"
                    : `${status.quotas.chat.remaining}/${status.quotas.chat.limit}`}
                </span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {checkoutMessage && (
        <div className="max-w-2xl mx-auto rounded-2xl border border-teal-200 bg-teal-50 p-4 text-xs font-semibold text-teal-900 flex items-start gap-2.5">
          <CheckCircle2 size={18} className="text-teal-600 shrink-0 mt-0.5" />
          <span>{checkoutMessage}</span>
        </div>
      )}

      {/* شبكة الباقات */}
      <div className="grid gap-8 lg:grid-cols-3 max-w-6xl mx-auto">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-96 rounded-3xl border border-line bg-canvas/60 animate-pulse" />
          ))
        ) : (
          plans.map((p) => {
            const isCurrent = status?.planCode === p.code;
            const isFeatured = p.code === "PRO_MONTHLY";
            const isUltimate = p.code === "ULTIMATE_TERM";

            return (
              <div
                key={p.id}
                className={`relative flex flex-col justify-between rounded-3xl border p-6 sm:p-8 transition-all duration-200 ${
                  isFeatured
                    ? "border-gold-400 bg-white shadow-xl ring-2 ring-gold-400/30 lg:-translate-y-2"
                    : isUltimate
                      ? "border-navy-900 bg-gradient-to-b from-navy-950 to-navy-900 text-white shadow-xl"
                      : "border-line bg-white shadow-card hover:border-navy-300"
                }`}
              >
                {/* الشارة الترويجية */}
                {p.badge && (
                  <div className="absolute -top-3.5 right-6 rounded-full bg-gradient-to-r from-gold-500 to-amber-500 px-3.5 py-1 text-[11px] font-bold text-white shadow-sm">
                    {p.badge}
                  </div>
                )}

                <div>
                  <h3
                    className={`text-xl font-bold ${
                      isUltimate ? "text-white" : "text-navy-950"
                    }`}
                  >
                    {p.name}
                  </h3>
                  <p
                    className={`mt-2 text-xs leading-5 min-h-[40px] ${
                      isUltimate ? "text-navy-200" : "text-muted"
                    }`}
                  >
                    {p.description}
                  </p>

                  {/* السعر */}
                  <div className="mt-6 flex items-baseline gap-1">
                    <span
                      className={`text-3xl sm:text-4xl font-extrabold ${
                        isUltimate ? "text-gold-400" : "text-navy-950"
                      }`}
                    >
                      {p.price === 0 ? "مجاناً" : `${p.price} ₪`}
                    </span>
                    {p.price > 0 && (
                      <span
                        className={`text-xs ${
                          isUltimate ? "text-navy-300" : "text-muted"
                        }`}
                      >
                        / {p.intervalDays === 30 ? "شهرياً" : `${p.intervalDays} يوماً`}
                      </span>
                    )}
                  </div>

                  {/* الحصص اليومية */}
                  <div
                    className={`mt-6 rounded-2xl p-3.5 space-y-2 text-xs ${
                      isUltimate ? "bg-navy-800/80 text-navy-100" : "bg-canvas text-navy-900"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Zap size={14} className="text-gold-500" />
                        <span>كويزات يومية:</span>
                      </span>
                      <span className="font-bold">
                        {p.dailyQuizLimit === null ? "غير محدود ♾️" : `${p.dailyQuizLimit} كويزات`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Target size={14} className="text-teal-500" />
                        <span>تقييمات معرفية:</span>
                      </span>
                      <span className="font-bold">
                        {p.dailyAssessmentLimit === null
                          ? "غير محدود ♾️"
                          : `${p.dailyAssessmentLimit} تقييم`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <MessageSquare size={14} className="text-sky-500" />
                        <span>استشارات الشات:</span>
                      </span>
                      <span className="font-bold">
                        {p.dailyChatLimit === null ? "غير محدود ♾️" : `${p.dailyChatLimit} رسالة`}
                      </span>
                    </div>
                  </div>

                  {/* قائمة الميزات */}
                  <ul className="mt-6 space-y-2.5 text-xs">
                    {p.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full mt-0.5 ${
                            isUltimate
                              ? "bg-gold-400 text-navy-950 font-bold"
                              : "bg-teal-50 text-teal-700"
                          }`}
                        >
                          <Check size={11} strokeWidth={3} />
                        </span>
                        <span className={isUltimate ? "text-navy-100" : "text-navy-800"}>
                          {feat}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* زر الاشتراك */}
                <div className="mt-8 pt-4 border-t border-line/40">
                  <Button
                    variant={isUltimate ? "accent" : isFeatured ? "primary" : "secondary"}
                    disabled={isCurrent || checkoutLoading === p.code}
                    onClick={() => handleSubscribe(p.code)}
                    className="w-full justify-center py-3 text-xs sm:text-sm font-bold rounded-2xl"
                  >
                    {isCurrent
                      ? "باقتك الحالية المفعلة"
                      : p.price === 0
                        ? "الباقة الأساسية"
                        : checkoutLoading === p.code
                          ? "جاري المعالجة..."
                          : `الاشتراك في ${p.name}`}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* قسم شحن كرت تفعيل أو كود مكتبة */}
      <div className="max-w-2xl mx-auto">
        <Card className="p-6 sm:p-8 border-gold-300/70 bg-gradient-to-tr from-gold-50/40 via-white to-white shadow-raised">
          <div className="flex items-center gap-3 mb-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gold-100 text-gold-700">
              <Ticket size={22} />
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-navy-950">
                هل تمتلك كرت شحن أو كود تفعيل؟
              </h3>
              <p className="text-xs text-muted">
                أدخل الكود المطبوع على بطاقة الشحن لتفعيل الباقة فورياً لحسابك
              </p>
            </div>
          </div>

          <form onSubmit={handleRedeemVoucher} className="mt-5 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={voucherCode}
                onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                placeholder="مثال: TAWJIHI-PRO-8F2A"
                dir="ltr"
                className="flex-1 rounded-2xl border border-line px-4 py-3 text-sm font-mono tracking-wider uppercase text-center placeholder:text-muted focus:border-navy-900 focus:outline-hidden"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={redeemLoading || !voucherCode.trim()}
                className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap"
              >
                {redeemLoading ? "جاري التحقق..." : "تفعيل الكرت الآن"}
              </Button>
            </div>

            {redeemError && (
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                <AlertCircle size={15} className="shrink-0" />
                <span>{redeemError}</span>
              </div>
            )}

            {redeemSuccess && (
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 rounded-xl p-3">
                <CheckCircle2 size={15} className="shrink-0" />
                <span>{redeemSuccess}</span>
              </div>
            )}
          </form>
        </Card>
      </div>

      {/* وسائل الدفع المعتمدة */}
      <div className="max-w-4xl mx-auto rounded-3xl border border-line bg-canvas/40 p-6 sm:p-8 text-center space-y-6">
        <h4 className="text-sm font-bold text-navy-900">طرق الدفع والتفعيل المتاحة</h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-medium text-navy-800">
          <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-line">
            <Ticket size={24} className="text-gold-600" />
            <span>كروت شحن من المكتبات</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-line">
            <CreditCard size={24} className="text-teal-600" />
            <span>بطاقات فيزا وماستركارد</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-line">
            <ShieldCheck size={24} className="text-sky-600" />
            <span>Jawwal Pay & PalPay</span>
          </div>
          <div className="flex flex-col items-center gap-2 p-3 bg-white rounded-2xl border border-line">
            <PhoneCall size={24} className="text-navy-700" />
            <span>تحويل مباشر عبر الواتساب</span>
          </div>
        </div>
      </div>
    </div>
  );
}
