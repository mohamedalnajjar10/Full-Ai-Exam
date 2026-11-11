import type { ReactNode } from "react";

type Tone = "navy" | "teal" | "gold" | "neutral" | "rose" | "amber" | "inverse";

const TONES: Record<Tone, string> = {
  navy: "bg-navy-50 text-navy-800 ring-navy-900/10",
  teal: "bg-teal-50 text-teal-800 ring-teal-700/15",
  gold: "bg-gold-50 text-gold-600 ring-gold-500/20",
  neutral: "bg-slate-100 text-slate-600 ring-slate-500/10",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/15",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/15",
  inverse: "bg-white/10 text-white ring-white/20",
};

export default function Badge({
  tone = "navy",
  icon,
  children,
  className = "",
}: {
  tone?: Tone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
