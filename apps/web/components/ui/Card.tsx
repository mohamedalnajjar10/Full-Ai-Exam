import type { ComponentProps, ReactNode } from "react";

/** السطح الأساسي لكل المحتوى: حد خفيف وظل بالكاد يبان. */
export function Card({ className = "", padded = true, ...props }: ComponentProps<"div"> & { padded?: boolean }) {
  return <div className={`rounded-2xl border border-line bg-white shadow-card ${padded ? "p-5 sm:p-6" : ""} ${className}`} {...props} />;
}

export function CardHeader({
  title,
  description,
  action,
  icon,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-900">{icon}</span>
        )}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-navy-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
