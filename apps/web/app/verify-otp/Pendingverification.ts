"use client";

import { useSyncExternalStore, useCallback } from "react";

const KEY = "pendingVerificationEmail";

function subscribe(callback: () => void) {
  window.addEventListener("pending-email-change", callback);
  return () => window.removeEventListener("pending-email-change", callback);
}

function getSnapshot() {
  return sessionStorage.getItem(KEY);
}

function getServerSnapshot() {
  return null;
}

/**
 * يخزن ويقرأ إيميل التسجيل المعلّق (بانتظار OTP) بدون تمريره بالـ URL.
 * يُمسح تلقائياً بعد إغلاق التاب لأنه sessionStorage.
 */
export function usePendingEmail() {
  const email = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setPendingEmail = useCallback((value: string) => {
    sessionStorage.setItem(KEY, value);
    window.dispatchEvent(new Event("pending-email-change"));
  }, []);

  const clearPendingEmail = useCallback(() => {
    sessionStorage.removeItem(KEY);
    window.dispatchEvent(new Event("pending-email-change"));
  }, []);

  return { email, setPendingEmail, clearPendingEmail };
}