import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";

type Tone = "error" | "success" | "info";

const STYLES: Record<Tone, { box: string; Icon: typeof Info }> = {
  error: { box: "border-rose-200 bg-rose-50 text-rose-800", Icon: CircleAlert },
  success: { box: "border-teal-200 bg-teal-50 text-teal-900", Icon: CircleCheck },
  info: { box: "border-navy-100 bg-navy-50 text-navy-900", Icon: Info },
};

export default function Alert({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = STYLES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm ${box} ${className}`}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 leading-6">
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
      {action}
    </div>
  );
}
