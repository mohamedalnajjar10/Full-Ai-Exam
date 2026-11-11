import type { LucideIcon } from "lucide-react";

/**
 * ترويسة الصفحات الداخلية. كانت لوحة متدرجة ثقيلة بكل صفحة — صارت
 * عنوان واضح بمستوى الصفحة، والمحتوى هو يلي بياخد الانتباه.
 */
export default function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-line pb-7 md:flex-row md:items-end md:justify-between">
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-line bg-white text-navy-900 shadow-card sm:flex">
            <Icon size={22} strokeWidth={1.75} />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1.5 text-sm font-medium text-teal-700">{eyebrow}</p>}
          <h1 className="text-balance text-2xl font-bold leading-snug text-navy-900 sm:text-[28px]">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-pretty text-[15px] leading-7 text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div>}
    </header>
  );
}
