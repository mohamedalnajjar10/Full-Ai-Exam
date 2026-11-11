import { Check } from "lucide-react";
import { PASSWORD_RULES } from "@/lib/authRules";

export default function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid gap-1.5 text-[13px] sm:grid-cols-3" aria-label="متطلبات كلمة المرور">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(value);
        return (
          <li key={r.id} className={`flex items-center gap-1.5 transition-colors ${ok ? "text-teal-700" : "text-subtle"}`}>
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${ok ? "bg-teal-600 text-white" : "border border-navy-200"}`}
              aria-hidden
            >
              {ok && <Check size={10} strokeWidth={3.5} />}
            </span>
            {r.label}
            <span className="sr-only">{ok ? " (متحقق)" : " (غير متحقق)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
