import { ArrowLeft, Check } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import ProductPreview from "./ProductPreview";

const POINTS = ["لكل الفروع", "تصحيح فوري مع الشرح", "خطة تتجدد يومياً"];

export default function Hero() {
  return (
    <section id="hero" className="relative overflow-hidden border-b border-line bg-white">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]" />
      <div className="absolute -top-40 start-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-teal-100/40 blur-3xl" />

      <div className="container-page relative grid items-center gap-16 pb-24 pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-12 lg:pb-28 lg:pt-20">
        <div className="animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[13px] font-medium text-navy-800 shadow-card">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-600" />
            منصة التحضير لامتحان التوجيهي
          </p>

          <h1 className="mt-6 text-balance text-[34px] font-bold leading-[1.35] text-navy-900 sm:text-[44px] lg:text-[52px]">
            طريقك الواضح إلى <span className="text-teal-700">التفوّق</span> في التوجيهي
          </h1>

          <p className="mt-5 max-w-xl text-pretty text-lg leading-9 text-muted">
            كويزات على نمط الامتحانات الوزارية بتصحيح فوري وشرح لكل إجابة، ومساعد ذكي في كل مادة، وخطة يومية
            تركّز على ما تحتاجه أكثر.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/register" size="xl">
              ابدأ مجاناً
              <ArrowLeft size={18} />
            </ButtonLink>
            <ButtonLink href="/#how" variant="secondary" size="xl">
              كيف تعمل المنصة
            </ButtonLink>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            {POINTS.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <Check size={12} strokeWidth={3} />
                </span>
                {p}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-rise [animation-delay:120ms]">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}
