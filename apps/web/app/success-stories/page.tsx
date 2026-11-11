import type { Metadata } from "next";
import PublicShell from "@/components/layout/PublicShell";
import PublicPageHeader from "@/components/layout/PublicPageHeader";
import { TestimonialCard } from "@/components/landing/Testimonials";
import StatsBand from "@/components/landing/StatsBand";
import FinalCta from "@/components/landing/FinalCta";
import { TESTIMONIALS } from "@/lib/content/testimonials";

export const metadata: Metadata = { title: "قصص النجاح" };

export default function SuccessStoriesPage() {
  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="قصص النجاح"
        title="قصص نجاح طلابنا"
        description="طلاب حققوا أهدافهم في التوجيهي بمساعدة المنصة — تجاربهم قد تكون بداية قصتك."
      />
      <div className="container-page grid gap-5 py-14 md:grid-cols-2 lg:py-20">
        {TESTIMONIALS.map((t) => (
          <TestimonialCard key={t.name} item={t} />
        ))}
      </div>
      <div className="border-t border-line">
        <StatsBand />
      </div>
      <FinalCta />
    </PublicShell>
  );
}
