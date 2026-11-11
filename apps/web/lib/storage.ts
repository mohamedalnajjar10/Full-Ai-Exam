"use client";
// تخزين محلي تفاعلي ومفصول لكل مستخدم (سجل الكويزات، خطة اليوم...)
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useAuth } from "@/context/AuthContext";

const CHANGE_EVENT = "local-store-change";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStore<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // المساحة ممتلئة أو التخزين محظور — نتجاهل بهدوء
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function readStore<T>(key: string, fallback: T): T {
  const raw = safeRead(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** مفتاح تخزين خاص بالمستخدم الحالي حتى لا تختلط بيانات حسابين على نفس المتصفح */
export function useUserKey(base: string) {
  const { user } = useAuth();
  return `${base}:${user?.id ?? user?.email ?? "me"}`;
}

/** قيمة من localStorage تتحدث تلقائياً عند أي تغيير (بنفس التبويب أو تبويب آخر) */
export function useLocalStore<T>(key: string, fallback: T) {
  const raw = useSyncExternalStore(
    subscribe,
    () => safeRead(key),
    () => null,
  );

  const value = useMemo<T>(() => {
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
    // fallback مقصود خارج الاعتماديات حتى لا يعاد الحساب مع كل render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = readStore<T>(key, fallback);
      const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
      writeStore(key, resolved);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, setValue] as const;
}
