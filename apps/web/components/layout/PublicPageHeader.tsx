import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** ترويسة الصفحات العامة: مسار التنقل، العنوان، والوصف. */
export default function PublicPageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-line bg-canvas">
      <div className="bg-grid absolute inset-0 [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="container-page relative py-14 lg:py-20">
        <nav aria-label="مسار التنقل" className="mb-5 flex items-center gap-1.5 text-sm text-muted">
          <Link href="/" className="hover:text-navy-900">
            الرئيسية
          </Link>
          <ChevronLeft size={14} aria-hidden />
          <span className="text-navy-900">{eyebrow}</span>
        </nav>
        <h1 className="max-w-3xl text-balance text-[32px] font-bold leading-[1.3] text-navy-900 sm:text-[40px]">{title}</h1>
        {description && <p className="mt-4 max-w-2xl text-pretty text-lg leading-8 text-muted">{description}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}
