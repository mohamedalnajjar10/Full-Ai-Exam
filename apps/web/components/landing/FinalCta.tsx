import { ArrowLeft } from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";

export default function FinalCta() {
  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="container-page">
        <div className="relative overflow-hidden rounded-3xl bg-navy-900 px-6 py-14 text-center sm:px-12 lg:py-20">
          <div className="bg-grid-inverse absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
          <div className="absolute -bottom-32 start-1/2 h-72 w-[40rem] -translate-x-1/2 rounded-full bg-teal-500/25 blur-3xl" />
          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-balance text-[28px] font-bold leading-snug text-white sm:text-4xl">جاهز لتبدأ رحلة التميّز؟</h2>
            <p className="mt-4 text-pretty text-lg leading-8 text-navy-100">
              أنشئ حسابك خلال دقيقة، اختر فرعك، وحلّ أول كويز على نمط الوزارة اليوم.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <ButtonLink href="/register" variant="inverse" size="xl">
                أنشئ حسابك مجاناً
                <ArrowLeft size={18} />
              </ButtonLink>
              <ButtonLink href="/login" variant="inverse-outline" size="xl">
                لدي حساب بالفعل
              </ButtonLink>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
