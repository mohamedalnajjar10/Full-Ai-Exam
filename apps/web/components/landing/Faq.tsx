import { ChevronDown } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import { ButtonLink } from "@/components/ui/Button";
import { FAQ } from "@/lib/content/faq";

/**
 * أكورديون بعناصر <details> الأصلية: بيشتغل بدون JavaScript، ومفهوم
 * لقارئ الشاشة ولوحة المفاتيح من غير أي كود إضافي.
 */
export function FaqList({ items = FAQ }: { items?: typeof FAQ }) {
  return (
    <div className="divide-y divide-line rounded-2xl border border-line bg-white shadow-card">
      {items.map((item, i) => (
        <details key={item.question} className="group" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-start font-semibold text-navy-900 transition-colors hover:bg-canvas/60 sm:px-7 [&::-webkit-details-marker]:hidden">
            {item.question}
            <ChevronDown size={18} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <p className="px-5 pb-6 leading-8 text-muted sm:px-7">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

export default function Faq({ limit = 5 }: { limit?: number }) {
  return (
    <section id="asked-questions" className="bg-canvas py-20 lg:py-28">
      <div className="container-page grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <SectionHeading
            eyebrow="الأسئلة الشائعة"
            title="أسئلة يطرحها الطلاب قبل البدء"
            description="لم تجد إجابتك؟ راسلنا وسيرد فريق الدعم خلال 24 ساعة."
            align="start"
          />
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/faq" variant="secondary">
              كل الأسئلة
            </ButtonLink>
            <ButtonLink href="/contact" variant="ghost">
              تواصل معنا
            </ButtonLink>
          </div>
        </div>
        <FaqList items={FAQ.slice(0, limit)} />
      </div>
    </section>
  );
}
