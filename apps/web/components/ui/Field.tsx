"use client";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";

export function inputClass(invalid = false, extra = "") {
  return (
    "block w-full rounded-xl border bg-white px-4 text-[15px] text-ink shadow-xs outline-none transition-[border-color,box-shadow] " +
    "placeholder:text-subtle disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70 " +
    (invalid
      ? "border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 "
      : "border-line hover:border-navy-200 focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10 ") +
    extra
  );
}

/**
 * حقل بعنوان ظاهر ورسالة خطأ مربوطة بالـ input.
 * العنوان مش placeholder: الـ placeholder بيختفي أول ما الطالب يكتب،
 * وقارئ الشاشة ما بيعتمد عليه.
 */
export function Field({
  label,
  hint,
  error,
  optional,
  trailing,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  optional?: boolean;
  trailing?: ReactNode;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-navy-900">
          {label}
          {optional && <span className="ms-1 font-normal text-subtle">(اختياري)</span>}
        </label>
        {trailing}
      </div>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error ? (
        <p id={errorId} role="alert" className="flex items-center gap-1.5 text-[13px] text-rose-600">
          <CircleAlert size={14} className="shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = Omit<ComponentProps<"input">, "id"> & { label: string; error?: string; hint?: ReactNode; optional?: boolean; trailing?: ReactNode };

export function TextField({ label, error, hint, optional, trailing, className = "", ...props }: InputProps) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional} trailing={trailing}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={inputClass(invalid, `h-12 ${className}`)}
          {...props}
        />
      )}
    </Field>
  );
}

export function PasswordField({ label, error, hint, optional, trailing, className = "", ...props }: InputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} error={error} hint={hint} optional={optional} trailing={trailing}>
      {({ id, describedBy, invalid }) => (
        <div className="relative">
          <input
            id={id}
            type={visible ? "text" : "password"}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            className={inputClass(invalid, `h-12 pe-12 ${className}`)}
            {...props}
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
            aria-pressed={visible}
            className="absolute inset-y-0 end-0 flex w-12 items-center justify-center rounded-e-xl text-subtle transition-colors hover:text-navy-900"
          >
            {visible ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
      )}
    </Field>
  );
}

export function TextAreaField({
  label,
  error,
  hint,
  optional,
  className = "",
  ...props
}: Omit<ComponentProps<"textarea">, "id"> & { label: string; error?: string; hint?: ReactNode; optional?: boolean }) {
  return (
    <Field label={label} error={error} hint={hint} optional={optional}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={inputClass(invalid, `min-h-32 resize-y py-3 leading-7 ${className}`)}
          {...props}
        />
      )}
    </Field>
  );
}
