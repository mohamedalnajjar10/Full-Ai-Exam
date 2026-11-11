"use client";
import { useEffect, useState } from "react";
import { Sparkles, Brain, CheckCircle2, Loader2, Target } from "lucide-react";

interface AiAssessmentLoaderProps {
  mode: "generate" | "submit";
  subjectName?: string;
}

const GENERATE_STEPS = [
  "تحليل منهاج المادة ومستوى الصعوبة المطلوب",
  "صياغة 5 أسئلة تشخيصية مكثفة متدرجة وفق هرم بلوم المعرفي",
  "بناء المشتتات النموذجية والبدائل التفكيرية",
  "تجهيز ورقة الاختبار الخاصة بك ومزامنة الجلسة...",
];

const SUBMIT_STEPS = [
  "تدقيق الإجابات واحتساب الدرجة المعيارية",
  "تحليل الأداء وتحديد فجوات التعلم عبر مستويات بلوم",
  "المستشار الذكي يستخرج نقاط القوة ويصيغ الخطة الدراسية المخصصة",
  "اللمسات الأخيرة وتجهيز التقرير التشخيصي...",
];

const TIPS = [
  "💡 نصيحة للتفوق: قراءة السؤال بعناية وتحديد المطلوب أولاً يوفر عليك نصف وقت الحل.",
  "🎯 هرم بلوم: الانتقال من الحفظ السطحي إلى التطبيق والتحليل هو جوهر التفوق في الامتحانات الوزارية.",
  "🧠 معلومة تشخيصية: الخطأ في مرحلة التدريب هو أفضل فرصة لردم الفجوات قبل موعد الامتحان الحقيقي.",
  "⚡ اطمئن: يتم حفظ جميع نتائجك التشخيصية في سجلك الأكاديمي لترصد تطور مستواك باستمرار.",
];

export default function AiAssessmentLoader({ mode, subjectName }: AiAssessmentLoaderProps) {
  const steps = mode === "generate" ? GENERATE_STEPS : SUBMIT_STEPS;
  const [currentStep, setCurrentStep] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    // تقدم تدريجي بين الخطوات كل ثانيتين ونصف
    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 2400);

    // تدوير النصائح المعرفية كل 4 ثوانٍ
    const tipInterval = setInterval(() => {
      setTipIndex((prev) => (prev + 1) % TIPS.length);
    }, 4000);

    return () => {
      clearInterval(stepInterval);
      clearInterval(tipInterval);
    };
  }, [steps.length]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center justify-center rounded-3xl border border-line bg-white/95 p-8 text-center shadow-raised backdrop-blur-sm sm:p-12">
      {/* أيقونة نابضة مع تأثير الهالة الضوئية */}
      <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-teal-500/20" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-navy-900 to-navy-700 text-teal-400 shadow-float">
          {mode === "generate" ? (
            <Brain size={32} className="animate-pulse" />
          ) : (
            <Target size={32} className="animate-pulse text-gold-400" />
          )}
        </div>
      </div>

      <h3 className="text-xl font-bold text-navy-900 sm:text-2xl">
        {mode === "generate"
          ? `جاري تجهيز اختبار التقييم ${subjectName ? `في ${subjectName}` : ""}...`
          : "جاري تحليل أدائك وصياغة التقرير التشخيصي..."}
      </h3>
      <p className="mt-2 text-sm text-muted">
        {mode === "generate"
          ? "يتم توظيف الذكاء الاصطناعي لإنشاء 5 أسئلة متدرجة تقيس مستوياتك المعرفية بدقة."
          : "يقوم المستشار الذكي بفحص إجاباتك ورصد فجوات التعلم ووضع خطة علاجية مخصصة."}
      </p>

      {/* شريط خطوات التقدم */}
      <div className="mt-8 w-full space-y-3 text-start">
        {steps.map((step, idx) => {
          const isDone = idx < currentStep;
          const isCurrent = idx === currentStep;

          return (
            <div
              key={step}
              className={`flex items-center gap-3 rounded-xl p-3 text-sm transition-all duration-500 ${
                isCurrent
                  ? "border border-teal-200 bg-teal-50/70 text-navy-900 font-semibold shadow-sm"
                  : isDone
                    ? "bg-canvas/50 text-muted"
                    : "opacity-40 text-subtle"
              }`}
            >
              {isDone ? (
                <CheckCircle2 size={18} className="shrink-0 text-teal-600" />
              ) : isCurrent ? (
                <Loader2 size={18} className="shrink-0 animate-spin text-teal-600" />
              ) : (
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-subtle/40 text-[10px]" />
              )}
              <span className="flex-1 leading-6">{step}</span>
            </div>
          );
        })}
      </div>

      {/* بطاقة النصائح والمعارف المتناوبة */}
      <div className="mt-8 flex w-full items-start gap-2.5 rounded-2xl border border-gold-100 bg-gold-50/60 p-4 text-start text-xs leading-6 text-navy-900 transition-opacity duration-300">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-gold-600" />
        <span className="flex-1 font-medium">{TIPS[tipIndex]}</span>
      </div>

      <p className="mt-4 text-[11px] text-subtle">
        يرجى عدم إغلاق الصفحة، يستغرق التقييم المعرفي بضع ثوانٍ لضمان الدقة والشمول.
      </p>
    </div>
  );
}
