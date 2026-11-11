import Image from "next/image";
import { Quote } from "lucide-react";
import SectionHeading from "@/components/ui/SectionHeading";
import { ButtonLink } from "@/components/ui/Button";
import { TESTIMONIALS, type Testimonial } from "@/lib/content/testimonials";

export function TestimonialCard({ item }: { item: Testimonial }) {
  return (
    <figure className="reveal flex h-full flex-col rounded-2xl border border-line bg-white p-7 shadow-card">
      <Quote size={28} className="text-gold-400" aria-hidden />
      <blockquote className="mt-4 flex-1 text-[15px] leading-8 text-ink">{item.text}</blockquote>
      <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-5">
        <Image src={item.image} alt="" width={48} height={48} className="h-12 w-12 rounded-full object-cover ring-2 ring-white shadow-card" />
        <div>
          <p className="font-semibold text-navy-900">{item.name}</p>
          <p className="text-sm text-muted">{item.track}</p>
        </div>
      </figcaption>
    </figure>
  );
}

/**
 * كانت سلايدر Swiper بتقليب تلقائي كل 1.8 ثانية — آخر مستهلك للمكتبة
 * بالموقع (~130KB). شبكة ثابتة بتنقرا أسهل وما بتحتاج ولا سطر JS.
 */
export default function Testimonials({ limit = 3 }: { limit?: number }) {
  return (
    <section id="success-stories" className="bg-white py-20 lg:py-28">
      <div className="container-page">
        <SectionHeading
          eyebrow="قصص النجاح"
          title="طلاب سبقوك على نفس الطريق"
          align="start"
          action={
            <ButtonLink href="/success-stories" variant="secondary">
              كل القصص
            </ButtonLink>
          }
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {TESTIMONIALS.slice(0, limit).map((t) => (
            <TestimonialCard key={t.name} item={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
