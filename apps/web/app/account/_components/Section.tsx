import type { LucideIcon } from "lucide-react";

/** قسم في صفحة الحساب: عنوان ووصف بجهة، والمحتوى بالجهة التانية. */
export default function Section({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 rounded-2xl border border-line bg-white shadow-card">
      <header className="flex items-start gap-3 border-b border-line p-5 sm:p-6">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-900">
          <Icon size={19} strokeWidth={1.75} />
        </span>
        <div>
          <h2 id={`${id}-title`} className="font-semibold text-navy-900">
            {title}
          </h2>
          <p className="mt-0.5 text-sm leading-6 text-muted">{description}</p>
        </div>
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}
