"use client";
import { useRef } from "react";

/**
 * خانات رمز التحقق. بتقبل اللصق، والتنقل بالأسهم، والحذف بـ Backspace،
 * وأرقام عربية-هندية (٠-٩) لأنها يلي بتطلع على كيبورد الموبايل العربي.
 */
function toLatinDigits(value: string) {
  return value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^0-9]/g, "");
}

export default function OtpInput({
  length = 6,
  value,
  onChange,
  disabled,
  invalid,
  label = "رمز التحقق",
  onComplete,
}: {
  length?: number;
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
  onComplete?: (code: string) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function commit(next: string[]) {
    onChange(next);
    if (next.every(Boolean)) onComplete?.(next.join(""));
  }

  function handleChange(index: number, raw: string) {
    const digits = toLatinDigits(raw);
    if (!digits) return;
    const next = [...value];
    // لصق عبر لوحة مفاتيح الموبايل بيوصل كقيمة طويلة لخانة وحدة
    for (let i = 0; i < digits.length && index + i < length; i++) next[index + i] = digits[i];
    commit(next);
    inputs.current[Math.min(index + digits.length, length - 1)]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = [...value];
      if (next[index]) {
        next[index] = "";
      } else if (index > 0) {
        next[index - 1] = "";
        inputs.current[index - 1]?.focus();
      }
      onChange(next);
    } else if (e.key === "ArrowLeft") {
      // الخانات مرتبة من اليسار (dir="ltr") لأن الرمز بيتكتب من اليسار
      inputs.current[Math.max(0, index - 1)]?.focus();
    } else if (e.key === "ArrowRight") {
      inputs.current[Math.min(length - 1, index + 1)]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const digits = toLatinDigits(e.clipboardData.getData("text")).slice(0, length);
    if (!digits) return;
    const next = Array.from({ length }, (_, i) => digits[i] ?? "");
    commit(next);
    inputs.current[Math.min(digits.length, length - 1)]?.focus();
  }

  return (
    <div role="group" aria-label={label} className="flex justify-between gap-2 sm:gap-3" dir="ltr">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`الرقم ${i + 1} من ${length}`}
          value={value[i] || ""}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={`h-14 w-full min-w-0 max-w-14 rounded-xl border bg-white text-center text-xl font-semibold text-navy-900 shadow-xs outline-none transition-[border-color,box-shadow] tabular disabled:opacity-50 ${
            invalid
              ? "border-rose-400 focus:ring-4 focus:ring-rose-500/10"
              : "border-line focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
          }`}
        />
      ))}
    </div>
  );
}
