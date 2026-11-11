import { BookOpenCheck, Bot, CalendarCheck, ChartColumn, FileCheck2, ListChecks } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";

const FEATURES = [
  {
    icon: ListChecks,
    title: "أسئلة على نمط الوزارة",
    text: "كويزات تُولَّد من بنك أسئلة الامتحانات الوزارية السابقة، مصممة لمنهاج كل فرع ومادة.",
  },
  {
    icon: FileCheck2,
    title: "تصحيح فوري وشرح لكل إجابة",
    text: "اعرف نتيجتك لحظة الانتهاء، وراجع طريقة الحل النموذجية لكل سؤال أخطأت فيه.",
  },
  {
    icon: Bot,
    title: "مسار التميز AI",
    text: "مساعد ذكي في كل مادة: اسأله، اطلب أسئلة بمستوى معيّن، أو ارفع امتحاناً سابقاً ليولّد لك أسئلة مشابهة.",
  },
  {
    icon: CalendarCheck,
    title: "خطة يومية ومؤقت تركيز",
    text: "مهام مقترحة تتجدد كل يوم حسب المواد التي تحتاجها أكثر، مع مؤقت لجلسات دراسة مركّزة.",
  },
  {
    icon: ChartColumn,
    title: "تحليل دقيق لنتائجك",
    text: "معدلك العام، تطوّر درجاتك، وأداؤك في كل مادة ومستوى صعوبة — في لوحة واحدة.",
  },
  {
    icon: BookOpenCheck,
    title: "كتب المنهاج بين يديك",
    text: "حمّل كتب مواد فرعك بصيغة PDF من مكان واحد، دون البحث بين المصادر.",
  },
];

export default function Features() {
  return (
    <section id="features" className="bg-white py-20 lg:py-28">
      <div className="container-page">
        <SectionHeading
          eyebrow="لماذا مسار التميز"
          title="كل ما تحتاجه للتوجيهي في منصة واحدة"
          description="أدوات صُممت حول طريقة الامتحان الفعلية، لا حول محتوى عام."
        />

        <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="reveal bg-white p-7 transition-colors hover:bg-navy-50/40 lg:p-8">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-700/10">
                <Icon size={21} strokeWidth={1.75} />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-navy-900">{title}</h3>
              <p className="mt-2 leading-7 text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
