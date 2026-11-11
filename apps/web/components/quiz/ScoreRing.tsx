import { scoreTone } from "@/lib/quiz";

// حلقة دائرية لعرض النسبة المئوية
export default function ScoreRing({
  percent,
  size = 140,
  stroke = 12,
  label,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = scoreTone(percent);
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${percent}% — ${label ?? tone.label}`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-canvas" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * clamped) / 100}
          className={`${tone.text} transition-[stroke-dashoffset] duration-1000 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold text-navy-900" style={{ fontSize: size / 4.6 }} dir="ltr">
          {percent}%
        </span>
        {label !== "" && <span className={`text-xs font-semibold ${tone.text}`}>{label ?? tone.label}</span>}
      </div>
    </div>
  );
}
