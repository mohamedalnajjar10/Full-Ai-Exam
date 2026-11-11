"use client";

import { useNetworkStatus } from "@/lib/useNetworkStatus";
import { CheckCircle2, Wifi, WifiOff } from "lucide-react";

export default function OfflineBanner({
  message = "أنت الآن في وضع عدم الاتصال بالإنترنت. إجاباتك محفوظة محلياً على هذا الجهاز تلقائياً وبأمان.",
  onlineMessage = "تمت استعادة الاتصال بالإنترنت بنجاح.",
  className = "",
}: {
  message?: string;
  onlineMessage?: string;
  className?: string;
}) {
  const { isOnline, wasOffline } = useNetworkStatus();

  if (!isOnline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900 shadow-xs animate-fade ${className}`}
      >
        <WifiOff size={16} className="shrink-0 text-amber-600 animate-pulse" />
        <span>{message}</span>
      </div>
    );
  }

  if (wasOffline) {
    return (
      <div
        role="status"
        aria-live="polite"
        className={`flex items-center gap-2.5 rounded-xl border border-teal-300 bg-teal-50 px-4 py-2.5 text-xs font-semibold text-teal-900 shadow-xs animate-fade ${className}`}
      >
        <Wifi size={16} className="shrink-0 text-teal-600" />
        <span>{onlineMessage}</span>
      </div>
    );
  }

  return null;
}
