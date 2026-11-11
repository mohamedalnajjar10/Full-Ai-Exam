import Link from "next/link";
import { ArrowRight, CalendarCheck, ListChecks, ShieldCheck, Sparkles } from "lucide-react";
import Logo from "@/components/ui/Logo";

const POINTS = [
  { icon: ListChecks, title: "أسئلة على نمط الوزارة", text: "كويزات تُولَّد من بنك الامتحانات السابقة، مع تصحيح فوري وشرح لكل إجابة." },
  { icon: Sparkles, title: "مساعد ذكي لكل مادة", text: "اسأل، ارفع امتحاناً سابقاً، واحصل على أسئلة مشابهة بحلولها." },
  { icon: CalendarCheck, title: "خطة يومية تتكيّف معك", text: "تركّز على المواد التي تحتاجها أكثر، مع مؤقت تركيز ومتابعة تقدّمك." },
];

/**
 * تخطيط شاشات الدخول والتسجيل: النموذج بجهة، ولوحة الهوية بالجهة التانية
 * (على الشاشات الكبيرة بس). كانت كل شاشة ترسم خلفيتها وكرتها لحالها،
 * بدون شعار وبدون طريق رجوع للموقع.
 */
export default function AuthShell({
  children,
  title,
  description,
  back = { href: "/", label: "العودة إلى الموقع" },
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  back?: { href: string; label: string } | null;
  wide?: boolean;
}) {
  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="flex flex-col">
        <div className="flex h-16 items-center justify-between px-5 sm:px-8 lg:h-20 lg:px-12">
          <Logo />
          {back && (
            <Link
              href={back.href}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-navy-900"
            >
              <ArrowRight size={16} />
              {back.label}
            </Link>
          )}
        </div>

        <main id="main" className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className={`w-full ${wide ? "max-w-2xl" : "max-w-[420px]"}`}>
            <div className="mb-8">
              <h1 className="text-[26px] font-bold leading-snug text-navy-900 sm:text-[28px]">{title}</h1>
              {description && <p className="mt-2 text-[15px] leading-7 text-muted">{description}</p>}
            </div>
            {children}
          </div>
        </main>

        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 px-5 pb-6 text-[13px] text-subtle">
          <Link href="/terms" className="hover:text-navy-900">الشروط والأحكام</Link>
          <Link href="/privacy" className="hover:text-navy-900">سياسة الخصوصية</Link>
          <Link href="/contact" className="hover:text-navy-900">الدعم</Link>
        </div>
      </div>

      <aside className="relative hidden overflow-hidden bg-navy-950 lg:block" aria-hidden>
        <div className="bg-grid-inverse absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
        <div className="absolute -bottom-40 -start-40 h-[28rem] w-[28rem] rounded-full bg-teal-600/20 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-navy-100">
            <ShieldCheck size={14} className="text-teal-300" />
            منصة التحضير لامتحان التوجيهي
          </span>

          <div>
            <p className="max-w-md text-balance text-[32px] font-bold leading-[1.4] text-white">
              استعدّ للتوجيهي بخطة واضحة وأسئلة تشبه الامتحان.
            </p>
            <ul className="mt-10 flex max-w-md flex-col gap-6">
              {POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-teal-300 ring-1 ring-white/10">
                    <Icon size={19} strokeWidth={1.75} />
                  </span>
                  <span>
                    <span className="block font-semibold text-white">{title}</span>
                    <span className="mt-1 block text-sm leading-7 text-navy-200">{text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-sm text-navy-300">لكل الفروع: العلمي، الأدبي، الصناعي، والشرعي.</p>
        </div>
      </aside>
    </div>
  );
}
