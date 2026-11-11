"use client";
/**
 * قطع واجهة خاصة بلوحة التحكم، مبنية فوق components/ui.
 * كثافتها أعلى من صفحات الطالب: جداول، مفاتيح تشغيل، لوحات جانبية.
 */
import { useEffect, useId, useRef, type ComponentProps, type ReactNode } from "react";
import RichText from "@/components/ui/RichText";
import { CircleAlert, CircleCheck, CircleDashed, CircleX, Loader2, Search, TriangleAlert, X, type LucideIcon } from "lucide-react";

/* ───────── ترويسة الصفحة ───────── */

export function AdminPageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[13px] font-medium text-teal-700">{eyebrow}</p>}
        <h1 className="text-balance text-[22px] font-bold leading-snug text-navy-900 sm:text-2xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-pretty text-sm leading-6 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/* ───────── لوحة (بطاقة بعنوان) ───────── */

export function Panel({
  title,
  description,
  action,
  children,
  className = "",
  bodyClassName = "p-5",
  icon: Icon,
  id,
}: {
  id?: string;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  icon?: LucideIcon;
}) {
  return (
    <section id={id} className={`min-w-0 rounded-2xl border border-line bg-white shadow-card ${className}`}>
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-900">
                <Icon size={18} strokeWidth={1.8} />
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold text-navy-900">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] leading-5 text-muted">{description}</p>}
            </div>
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ───────── الحالة: أيقونة + نص دائماً، مش لون لحاله ───────── */

export type StatusTone = "ok" | "warn" | "error" | "idle" | "busy";

const STATUS: Record<StatusTone, { cls: string; icon: LucideIcon }> = {
  ok: { cls: "bg-teal-50 text-teal-800 ring-teal-700/15", icon: CircleCheck },
  warn: { cls: "bg-amber-50 text-amber-800 ring-amber-600/20", icon: TriangleAlert },
  error: { cls: "bg-rose-50 text-rose-700 ring-rose-600/15", icon: CircleX },
  idle: { cls: "bg-slate-100 text-slate-600 ring-slate-500/10", icon: CircleDashed },
  busy: { cls: "bg-navy-50 text-navy-800 ring-navy-900/10", icon: Loader2 },
};

export function StatusPill({ tone, children, className = "" }: { tone: StatusTone; children: ReactNode; className?: string }) {
  const { cls, icon: Icon } = STATUS[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${cls} ${className}`}>
      <Icon size={13} strokeWidth={2.2} className={tone === "busy" ? "animate-spin" : ""} aria-hidden />
      {children}
    </span>
  );
}

/* ───────── مفتاح تشغيل ───────── */

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const track = size === "sm" ? "h-5 w-9" : "h-6 w-11";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const shift = size === "sm" ? "-translate-x-4" : "-translate-x-5";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:opacity-50 ${track} ${
        checked ? "bg-teal-600" : "bg-slate-300"
      }`}
    >
      {/* RTL: البداية يمين، فالتشغيل بيحرّك المقبض لليسار */}
      <span className={`${knob} rounded-full bg-white shadow-sm transition-transform ${checked ? shift : "translate-x-0"}`} />
    </button>
  );
}

/** سطر إعداد: عنوان + شرح على جهة، والتحكم على الجهة الثانية. */
export function SettingRow({
  title,
  description,
  children,
  htmlFor,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-medium text-navy-900">
            {title}
          </label>
        ) : (
          <p className="text-sm font-medium text-navy-900">{title}</p>
        )}
        {description && <p className="mt-0.5 text-[13px] leading-5 text-muted">{description}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

export function SwitchRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <SettingRow title={title} description={description}>
      <Switch checked={checked} onChange={onChange} label={title} />
    </SettingRow>
  );
}

/* ───────── مدخلات مدمجة ───────── */

const CONTROL =
  "h-10 rounded-xl border border-line bg-white px-3 text-sm text-ink shadow-xs outline-none transition-[border-color,box-shadow] " +
  "hover:border-navy-200 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 disabled:bg-canvas disabled:opacity-70";

export function Select({ className = "", children, ...props }: ComponentProps<"select">) {
  return (
    <select className={`${CONTROL} cursor-pointer pe-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Input({ className = "", ...props }: ComponentProps<"input">) {
  return <input className={`${CONTROL} ${className}`} {...props} />;
}

export function Textarea({ className = "", ...props }: ComponentProps<"textarea">) {
  return <textarea className={`${CONTROL} h-auto py-2.5 leading-6 ${className}`} {...props} />;
}

export function SearchInput({ className = "", ...props }: ComponentProps<"input">) {
  return (
    <div className={`relative ${className}`}>
      <Search size={16} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-subtle" aria-hidden />
      <input type="search" className={`${CONTROL} w-full ps-9`} {...props} />
    </div>
  );
}

export function LabeledControl({ label, hint, children }: { label: string; hint?: ReactNode; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-navy-900">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

/** منزلق رقمي مع القيمة ظاهرة جنبه. */
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format = (v) => String(v),
  hint,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-medium text-navy-900">
          {label}
        </label>
        <output htmlFor={id} className="tabular rounded-md bg-navy-50 px-2 py-0.5 text-xs font-semibold text-navy-900" dir="ltr">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="h-2 w-full cursor-pointer accent-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
      />
      {hint && <p className="text-xs leading-5 text-muted">{hint}</p>}
    </div>
  );
}

/* ───────── مجموعة أزرار متقاطعة ───────── */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-xl border border-line bg-canvas p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`rounded-lg font-medium transition-colors ${size === "sm" ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${
              active ? "bg-white text-navy-900 shadow-card" : "text-muted hover:text-navy-900"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────── تبويبات ───────── */

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { value: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={`flex shrink-0 items-center gap-2 border-b-2 px-3.5 pb-3 pt-1 text-sm font-medium transition-colors ${
              active ? "border-teal-600 text-navy-900" : "border-transparent text-muted hover:text-navy-900"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className={`tabular rounded-full px-1.5 py-0.5 text-[11px] ${active ? "bg-teal-50 text-teal-800" : "bg-slate-100 text-slate-600"}`}>
                {t.count.toLocaleString("en-US")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ───────── جدول ───────── */

export function Table({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full min-w-[640px] border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: ReactNode; className?: string }) {
  return (
    <th scope="col" className={`whitespace-nowrap border-b border-line bg-canvas/60 px-4 py-2.5 text-start text-xs font-semibold text-muted ${className}`}>
      {children}
    </th>
  );
}

export function Td({ children, className = "", colSpan }: { children?: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`border-b border-line px-4 py-3 align-middle text-ink ${className}`}>{children}</td>;
}

/* ───────── عدّاد/مقياس ───────── */

export function Meter({ value, max = 100, tone = "teal", label }: { value: number; max?: number; tone?: "teal" | "amber" | "rose" | "navy"; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const fill = { teal: "bg-teal-600", amber: "bg-amber-500", rose: "bg-rose-500", navy: "bg-navy-800" }[tone];
  const track = { teal: "bg-teal-100", amber: "bg-amber-100", rose: "bg-rose-100", navy: "bg-navy-100" }[tone];
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} className={`h-1.5 w-full overflow-hidden rounded-full ${track}`}>
      <div className={`h-full rounded-full ${fill} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ───────── نوافذ ───────── */

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEscape(open, onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 animate-fade bg-navy-950/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      {/* RTL: اللوحة بتطلع من جهة البداية (اليسار بالعربي = end) */}
      <aside
        role="dialog"
        aria-modal="true"
        className={`absolute inset-y-0 end-0 flex w-full ${width} animate-fade flex-col bg-white shadow-float`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-navy-900">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-[13px] text-muted">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="-me-2 flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-navy-50 hover:text-navy-900"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-canvas/60 px-6 py-3.5">{footer}</div>}
      </aside>
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  tone = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: "default" | "danger";
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 animate-fade bg-navy-950/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-md animate-rise rounded-2xl bg-white p-6 shadow-float">
        <div className="flex items-start gap-3">
          {tone === "danger" && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <CircleAlert size={20} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-navy-900">{title}</h2>
            {description && <div className="mt-1.5 text-sm leading-6 text-muted">{description}</div>}
          </div>
        </div>
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────── صغائر ───────── */

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line bg-white px-1 font-sans text-[11px] font-medium text-muted shadow-xs">
      {children}
    </kbd>
  );
}

/** معرّف تقني (موديل، مفتاح، مسار) — دايماً LTR وبخط ثابت العرض. */
export function Code({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <code dir="ltr" className={`rounded-md bg-navy-50 px-1.5 py-0.5 font-mono text-[12px] text-navy-900 ${className}`}>
      {children}
    </code>
  );
}

export function fmt(n: number) {
  return n.toLocaleString("en-US");
}

export function compact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/**
 * نص فيه معادلات أو آيات أو تشكيل — نفس عارض صفحات الطالب (RichText)،
 * حتى المراجع يشوف السؤال متل ما رح يشوفه الطالب. مضمّن افتراضياً لأنه
 * غالباً بصفوف مقصوصة بـ line-clamp.
 */
export function MathText({ children, className = "", block = false }: { children: string; className?: string; block?: boolean }) {
  return <RichText text={children} className={className} inline={!block} />;
}
