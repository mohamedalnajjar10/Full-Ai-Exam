"use client";
import React from "react";
import Link from "next/link";
import { Zap, Crown, ArrowLeft, X, Sparkles, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";

export interface QuotaExceededModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature?: "quiz" | "assessment" | "chat" | string;
  message?: string;
  resetAt?: string;
}

const FEATURE_NAMES: Record<string, string> = {
  quiz: "الكويزات الذكية",
  assessment: "اختبارات التقييم المعرفي",
  chat: "محادثات المستشار الذكي",
};

export default function QuotaExceededModal({
  isOpen,
  onClose,
  feature = "quiz",
  message,
  resetAt,
}: QuotaExceededModalProps) {
  if (!isOpen) return null;

  const featureLabel = FEATURE_NAMES[feature] || "الذكاء الاصطناعي";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md rounded-3xl border border-gold-300/60 bg-white p-6 sm:p-8 shadow-2xl text-center overflow-hidden animate-in zoom-in-95 duration-200"
        dir="rtl"
      >
        {/* شريط خلفي متوهج */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-48 bg-gradient-to-b from-gold-400/25 to-transparent rounded-full blur-2xl pointer-events-none" />

        {/* زر الإغلاق */}
        <button
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full text-muted hover:text-navy-900 hover:bg-canvas transition-colors"
          aria-label="إغلاق"
        >
          <X size={18} />
        </button>

        {/* الأيقونة */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-gold-500 to-amber-400 text-white shadow-lg shadow-gold-500/25">
          <Crown size={32} />
        </div>

        {/* الشارة */}
        <div className="inline-flex items-center gap-1.5 rounded-full bg-gold-50 border border-gold-200 px-3 py-1 text-xs font-bold text-gold-800 mb-3">
          <Zap size={13} className="text-gold-600" />
          <span>وصلت إلى الحد اليومي المجاني</span>
        </div>

        <h3 className="text-xl font-bold text-navy-900 sm:text-2xl">
          أتممت رصيدك اليومي من {featureLabel}
        </h3>

        <p className="mt-2.5 text-xs sm:text-sm leading-6 text-muted">
          {message ||
            `لقد استنفدت حصتك اليومية المخصصة. يتم تصفير وتجديد رصيدك تلقائياً عند منتصف الليل، أو يمكنك الترقية الآن للاستمرار دون توقف!`}
        </p>

        {/* وقت التجديد */}
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-canvas p-2.5 text-xs text-navy-700">
          <Clock size={15} className="text-muted" />
          <span>يتجدد الرصيد تلقائياً منتصف الليل (00:00 بتوقيت القدس)</span>
        </div>

        {/* ميزات الترقية */}
        <div className="mt-5 space-y-2 rounded-2xl border border-line bg-canvas/40 p-3.5 text-start text-xs">
          <div className="flex items-center gap-2 text-navy-900 font-semibold">
            <Sparkles size={14} className="text-gold-600 shrink-0" />
            <span>كويزات واختبارات غير محدودة طوال اليوم</span>
          </div>
          <div className="flex items-center gap-2 text-navy-900 font-semibold">
            <Sparkles size={14} className="text-gold-600 shrink-0" />
            <span>مستشار ذكي متواصل 24/7 دون سقف للأسئلة</span>
          </div>
          <div className="flex items-center gap-2 text-navy-900 font-semibold">
            <Sparkles size={14} className="text-gold-600 shrink-0" />
            <span>تحليل فجوات التعلم وخطط مخصصة للتفوق الوزاري</span>
          </div>
        </div>

        {/* الأزرار */}
        <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
          <Link
            href="/subscriptions"
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-navy-900 to-navy-800 px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-md hover:from-navy-800 hover:to-navy-700 transition-all"
          >
            <Crown size={16} className="text-gold-400" />
            عرض باقات الاشتراك والترقية
            <ArrowLeft size={16} />
          </Link>
          <Button
            variant="secondary"
            onClick={onClose}
            className="rounded-2xl text-xs py-3"
          >
            المتابعة لاحقاً
          </Button>
        </div>
      </div>
    </div>
  );
}
