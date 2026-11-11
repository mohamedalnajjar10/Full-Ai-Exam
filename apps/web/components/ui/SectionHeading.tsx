import type { ReactNode } from "react";

/** عنوان قسم موحّد: سطر تمهيدي صغير، عنوان، ووصف اختياري. */
export default function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  inverse = false,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "center" | "start";
  inverse?: boolean;
  action?: ReactNode;
}) {
  const centered = align === "center";
  return (
    <div
      className={`flex flex-col gap-4 ${centered ? "mx-auto max-w-2xl items-center text-center" : "sm:flex-row sm:items-end sm:justify-between"}`}
    >
      <div className={centered ? "" : "max-w-2xl"}>
        {eyebrow && (
          <p className={`mb-3 text-sm font-semibold ${inverse ? "text-teal-300" : "text-teal-700"}`}>{eyebrow}</p>
        )}
        <h2
          className={`text-balance text-[26px] font-bold leading-[1.35] sm:text-[32px] ${inverse ? "text-white" : "text-navy-900"}`}
        >
          {title}
        </h2>
        {description && (
          <p className={`mt-3 text-pretty text-base leading-8 ${inverse ? "text-white/70" : "text-muted"}`}>{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
