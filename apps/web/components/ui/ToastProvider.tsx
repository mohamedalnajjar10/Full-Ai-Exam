"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, RefreshCw, X } from "lucide-react";

interface ToastData {
  id: number;
  type: "success" | "error";
  message: string;
  onRetry?: () => void;
  isExiting?: boolean;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastData, "id" | "isExiting">) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast يجب استخدامه داخل ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  // Date.now() كمعرّف بيتكرر لو انعرض إشعارين بنفس الميلي ثانية
  const nextId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  const showToast = useCallback(
    (toast: Omit<ToastData, "id" | "isExiting">) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev.slice(-2), { ...toast, id, isExiting: false }]);
      setTimeout(() => dismissToast(id), 6000);
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2.5 px-4 sm:inset-x-auto sm:end-5 sm:top-5 sm:items-end sm:px-0"
      >
        {toasts.map((toast) => {
          const success = toast.type === "success";
          return (
            <div
              key={toast.id}
              role={success ? "status" : "alert"}
              className={`pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-xl border bg-white shadow-float ${
                toast.isExiting ? "animate-toast-custom-out" : "animate-toast-custom-in"
              } ${success ? "border-teal-200" : "border-rose-200"}`}
            >
              <div className="flex items-start gap-3 p-4">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    success ? "bg-teal-50 text-teal-700" : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {success ? <CircleCheck size={18} /> : <CircleAlert size={18} />}
                </span>

                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-sm font-medium leading-6 text-ink">{toast.message}</p>
                  {toast.onRetry && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.onRetry?.();
                        dismissToast(toast.id);
                      }}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-navy-50 px-2.5 py-1 text-xs font-semibold text-navy-900 transition-colors hover:bg-navy-100"
                    >
                      <RefreshCw size={13} />
                      إعادة المحاولة
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => dismissToast(toast.id)}
                  className="shrink-0 rounded-lg p-1.5 text-subtle transition-colors hover:bg-canvas hover:text-ink"
                  aria-label="إغلاق"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-line">
                <div className={`animate-progress h-full ${success ? "bg-teal-500" : "bg-rose-500"}`} />
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
