import { ChartColumn, GraduationCap, ListChecks } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";

const STEPS = [
  {
    icon: GraduationCap,
    title: "اختر فرعك",
    text: "أنشئ حسابك واختر فرعك الدراسي، فتظهر لك مواده ومعلموه وكتبه مباشرة.",
  },
  {
    icon: ListChecks,
    title: "تدرّب على نمط الوزارة",
    text: "حدّد المادة والمستوى وعدد الأسئلة، واحصل على كويز جديد بتصحيح فوري وشرح لكل إجابة.",
  },
  {
    icon: ChartColumn,
    title: "تابع تقدّمك",
    text: "نتائجك تتحوّل إلى صورة واضحة عن نقاط قوتك وضعفك، وخطة يومية تركّز على ما تحتاجه أكثر.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="bg-canvas py-20 lg:py-28">
      <div className="container-page">
        <SectionHeading
          eyebrow="كيف تعمل المنصة"
          title="ثلاث خطوات من التسجيل إلى الاستعداد الكامل"
          description="بدون إعدادات معقدة: كل ما تحتاجه لتبدأ التدريب اليوم."
        />

        <ol className="mt-14 grid gap-5 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="reveal relative rounded-2xl border border-line bg-white p-7 shadow-card">
              <div className="flex items-center justify-between">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy-900 text-white">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <span className="text-4xl font-bold text-navy-100 tabular" aria-hidden>
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold text-navy-900">
                <span className="sr-only">الخطوة {i + 1}: </span>
                {title}
              </h3>
              <p className="mt-2 leading-7 text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
