import type { Metadata } from "next";
import { MessageCircle } from "lucide-react";
import PublicShell from "@/components/layout/PublicShell";
import PublicPageHeader from "@/components/layout/PublicPageHeader";
import { FaqList } from "@/components/landing/Faq";
import FinalCta from "@/components/landing/FinalCta";
import { ButtonLink } from "@/components/ui/Button";

export const metadata: Metadata = { title: "الأسئلة الشائعة" };

export default function FAQPage() {
  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="الأسئلة الشائعة"
        title="الأسئلة الشائعة"
        description="إجابات سريعة لأكثر الأسئلة تكراراً حول منصة مسار التميز وطريقة استخدامها."
      />
      <div className="container-page grid gap-10 py-14 lg:grid-cols-[1fr_320px] lg:py-20">
        <FaqList />
        <aside className="h-fit rounded-2xl border border-line bg-canvas p-6 lg:sticky lg:top-28">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-navy-900 shadow-card">
            <MessageCircle size={20} strokeWidth={1.75} />
          </span>
          <h2 className="mt-4 font-semibold text-navy-900">لم تجد إجابتك؟</h2>
          <p className="mt-1.5 text-sm leading-7 text-muted">راسل فريق الدعم وسنرد عليك خلال 24 ساعة.</p>
          <ButtonLink href="/contact" block className="mt-5">
            تواصل معنا
          </ButtonLink>
        </aside>
      </div>
      <FinalCta />
    </PublicShell>
  );
}
