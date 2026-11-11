import type { LucideIcon } from "lucide-react";
import { ButtonLink } from "./Button";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
  tone = "neutral",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  tone?: "neutral" | "error";
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-navy-200 bg-white px-6 py-14 text-center">
      <span
        className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${
          tone === "error" ? "bg-rose-50 text-rose-600" : "bg-navy-50 text-navy-900"
        }`}
      >
        <Icon size={26} strokeWidth={1.75} />
      </span>
      <h3 className="text-lg font-semibold text-navy-900">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-7 text-muted">{description}</p>}
      {actionHref && actionLabel && (
        <ButtonLink href={actionHref} className="mt-6">
          {actionLabel}
        </ButtonLink>
      )}
    </div>
  );
}
