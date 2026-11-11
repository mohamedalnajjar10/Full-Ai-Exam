import Link from "next/link";
import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "inverse" | "inverse-outline";
type Size = "sm" | "md" | "lg" | "xl" | "icon" | "icon-lg";

const BASE =
  "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold " +
  "transition-[background-color,border-color,color,box-shadow] duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-navy-900 text-white shadow-sm hover:bg-navy-800 active:bg-navy-950",
  accent: "bg-teal-600 text-white shadow-sm hover:bg-teal-700 active:bg-teal-800",
  secondary: "border border-line bg-white text-navy-900 shadow-xs hover:border-navy-200 hover:bg-navy-50",
  ghost: "text-navy-900 hover:bg-navy-50",
  danger: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
  inverse: "bg-white text-navy-900 shadow-sm hover:bg-navy-50",
  "inverse-outline": "border border-white/25 text-white hover:border-white/40 hover:bg-white/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm",
  md: "h-11 px-5 text-sm",
  lg: "h-12 px-6 text-[15px]",
  xl: "h-14 px-8 text-base",
  // أزرار أيقونة فقط — مربعة وبدون حشوة، حتى ما تتعارض px مع العرض
  icon: "h-11 w-11 shrink-0 p-0",
  "icon-lg": "h-12 w-12 shrink-0 p-0",
};

export function buttonClass({
  variant = "primary",
  size = "md",
  block = false,
  className = "",
}: { variant?: Variant; size?: Size; block?: boolean; className?: string } = {}) {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${block ? "w-full" : ""} ${className}`;
}

type StyleProps = { variant?: Variant; size?: Size; block?: boolean };

export function Button({
  variant,
  size,
  block,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ComponentProps<"button"> & StyleProps & { loading?: boolean }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, block, className })}
      {...props}
    >
      {loading && <Loader2 size={17} className="animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  block,
  className,
  ...props
}: ComponentProps<typeof Link> & StyleProps) {
  return <Link className={buttonClass({ variant, size, block, className })} {...props} />;
}
