import { Loader2 } from "lucide-react";

export default function Spinner({ label = "جاري التحميل", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" className={`flex items-center justify-center gap-3 text-sm text-muted ${className}`}>
      <Loader2 className="animate-spin text-teal-600" size={22} aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}
