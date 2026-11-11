"use client";
/**
 * رسوم خفيفة بـ SVG بدون مكتبات.
 * كل رسم سلسلة وحدة، فما في مفتاح ألوان: العنوان بيقول شو المرسوم.
 * المحاور والأرقام بخط الواجهة وبلون النص، والبيانات بس هي الملوّنة.
 */
import { useId, useMemo, useRef, useState } from "react";
import { fmt } from "./ui";

/* ───────── منحنى مساحي مع مؤشر عمودي ───────── */

export function AreaChart({
  data,
  height = 220,
  unit = "",
  label,
}: {
  data: { day: string; value: number }[];
  height?: number;
  unit?: string;
  label: string;
}) {
  const gradId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 720;
  const H = height;
  const pad = { top: 16, right: 12, bottom: 26, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const { max, ticks, points, line, area } = useMemo(() => {
    const raw = Math.max(...data.map((d) => d.value));
    const step = niceStep(raw / 4);
    const max = Math.ceil(raw / step) * step;
    const ticks = Array.from({ length: Math.round(max / step) + 1 }, (_, i) => i * step);
    const points = data.map((d, i) => ({
      x: pad.left + (i / (data.length - 1)) * innerW,
      y: pad.top + innerH - (d.value / max) * innerH,
    }));
    const line = points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("");
    const area = `${line}L${points.at(-1)!.x},${pad.top + innerH}L${points[0].x},${pad.top + innerH}Z`;
    return { max, ticks, points, line, area };
  }, [data, innerW, innerH, pad.left, pad.top]);

  function locate(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((x - pad.left) / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  }

  const active = hover !== null ? points[hover] : null;
  const last = points.at(-1)!;

  return (
    <figure className="relative" dir="ltr">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none outline-none"
        role="img"
        aria-label={label}
        tabIndex={0}
        onPointerMove={(e) => locate(e.clientX)}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(data.length - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setHover((h) => Math.max(0, (h ?? data.length) - 1));
          if (e.key === "ArrowRight") setHover((h) => Math.min(data.length - 1, (h ?? -1) + 1));
        }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--color-teal-600)" stopOpacity="0.14" />
            <stop offset="100%" stopColor="var(--color-teal-600)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => {
          const y = pad.top + innerH - (t / max) * innerH;
          return (
            <g key={t}>
              <line x1={pad.left} x2={W - pad.right} y1={y} y2={y} stroke="var(--color-line)" strokeWidth="1" />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" className="fill-subtle text-[11px] tabular">
                {fmt(t)}
              </text>
            </g>
          );
        })}

        {data.map((d, i) =>
          i % 5 === 0 || i === data.length - 1 ? (
            <text key={d.day} x={points[i].x} y={H - 6} textAnchor="middle" className="fill-subtle text-[11px] tabular">
              {d.day}
            </text>
          ) : null,
        )}

        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke="var(--color-teal-600)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {/* القيمة الأخيرة معنونة مباشرة — باقي القيم بالمؤشر */}
        {!active && (
          <>
            <circle cx={last.x} cy={last.y} r="4.5" fill="var(--color-teal-600)" stroke="white" strokeWidth="2" />
            <text x={last.x - 8} y={last.y - 10} textAnchor="end" className="fill-ink text-[12px] font-semibold tabular">
              {fmt(data.at(-1)!.value)}
            </text>
          </>
        )}

        {active && (
          <>
            <line x1={active.x} x2={active.x} y1={pad.top} y2={pad.top + innerH} stroke="var(--color-navy-300)" strokeWidth="1" />
            <circle cx={active.x} cy={active.y} r="4.5" fill="var(--color-teal-600)" stroke="white" strokeWidth="2" />
          </>
        )}
      </svg>

      {active && hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-line bg-white px-3 py-2 text-center shadow-raised"
          style={{ left: `${(active.x / W) * 100}%` }}
        >
          <div className="text-sm font-semibold text-ink tabular">
            {fmt(data[hover].value)}
            {unit && <span className="ms-1 text-xs font-normal text-muted">{unit}</span>}
          </div>
          <div className="text-[11px] text-muted tabular">{data[hover].day}</div>
        </div>
      )}
    </figure>
  );
}

function niceStep(x: number) {
  const pow = 10 ** Math.floor(Math.log10(x));
  const n = x / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/* ───────── أشرطة أفقية معنونة ───────── */

export function BarList({
  items,
  format = fmt,
  tone = "navy",
}: {
  items: { label: string; value: number; hint?: string }[];
  format?: (v: number) => string;
  tone?: "navy" | "teal";
}) {
  const max = Math.max(...items.map((i) => i.value));
  const fill = tone === "teal" ? "bg-teal-600" : "bg-navy-800";
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((it) => (
        <li key={it.label} className="group" title={`${it.label}: ${format(it.value)}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-ink">{it.label}</span>
            <span className="shrink-0 font-semibold text-ink tabular">{format(it.value)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-navy-50">
            <div
              className={`h-full rounded-full ${fill} transition-opacity group-hover:opacity-80`}
              style={{ width: `${Math.max(2, (it.value / max) * 100)}%` }}
            />
          </div>
          {it.hint && <p className="mt-1 text-[11px] text-muted">{it.hint}</p>}
        </li>
      ))}
    </ul>
  );
}

/* ───────── خط صغير داخل بطاقة رقم ───────── */

export function Sparkline({ values, className = "" }: { values: number[]; className?: string }) {
  const W = 96;
  const H = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (W - 4) + 2, H - 3 - ((v - min) / span) * (H - 6)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  const [lx, ly] = pts.at(-1)!;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`h-7 w-24 ${className}`} aria-hidden>
      <path d={d} fill="none" stroke="var(--color-navy-200)" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="2.75" fill="var(--color-teal-600)" />
    </svg>
  );
}
