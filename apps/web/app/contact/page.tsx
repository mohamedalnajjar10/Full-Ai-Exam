import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock, Mail, Phone } from "lucide-react";
import PublicShell from "@/components/layout/PublicShell";
import PublicPageHeader from "@/components/layout/PublicPageHeader";
import ContactForm from "./ContactForm";

export const metadata: Metadata = { title: "تواصل معنا" };

const CHANNELS = [
  { icon: Phone, title: "اتصل بنا", value: "0912345678", href: "tel:0912345678", hint: "من الأحد إلى الخميس", ltr: true },
  { icon: Mail, title: "راسلنا", value: "support@masar-altamayoz.edu", href: "mailto:support@masar-altamayoz.edu", hint: "نرد خلال 24 ساعة", ltr: true },
  { icon: Clock, title: "ساعات الدعم", value: "9:00 ص – 5:00 م", hint: "بتوقيت فلسطين" },
];

export default function ContactPage() {
  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="تواصل معنا"
        title="نحن هنا لمساعدتك"
        description="لديك سؤال عن المنصة أو اقتراح لتحسينها؟ فريق مسار التميز جاهز للرد على استفساراتك."
      />

      <div className="container-page grid gap-10 py-14 lg:grid-cols-[1fr_1.4fr] lg:gap-16 lg:py-20">
        <div className="flex flex-col gap-4">
          {CHANNELS.map(({ icon: Icon, title, value, href, hint, ltr }) => {
            const body = (
              <>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm text-muted">{title}</span>
                  <span dir={ltr ? "ltr" : undefined} className="block break-all font-semibold text-navy-900">
                    {value}
                  </span>
                  <span className="block text-[13px] text-subtle">{hint}</span>
                </span>
              </>
            );
            const cls = "flex items-center gap-4 rounded-2xl border border-line bg-white p-5 shadow-card";
            return href ? (
              <a key={title} href={href} className={`${cls} transition-colors hover:border-navy-200`}>
                {body}
              </a>
            ) : (
              <div key={title} className={cls}>
                {body}
              </div>
            );
          })}

          <Link
            href="/faq"
            className="group mt-2 flex items-center justify-between gap-4 rounded-2xl bg-navy-900 p-5 text-white transition-colors hover:bg-navy-800"
          >
            <span>
              <span className="block font-semibold">ربما تجد إجابتك أسرع</span>
              <span className="text-sm text-navy-200">تصفّح الأسئلة الشائعة حول المنصة</span>
            </span>
            <ArrowLeft size={18} className="shrink-0 transition-transform group-hover:-translate-x-1" />
          </Link>
        </div>

        <div className="rounded-2xl border border-line bg-white p-6 shadow-card sm:p-8">
          <h2 className="text-xl font-semibold text-navy-900">أرسل لنا رسالة</h2>
          <p className="mt-1.5 text-sm leading-7 text-muted">اكتب رسالتك وسيتولى فريق الدعم متابعتها فوراً وإرسال تأكيد إلى بريدك الإلكتروني.</p>
          <div className="mt-6">
            <ContactForm />
          </div>
        </div>
      </div>
    </PublicShell>
  );
}
