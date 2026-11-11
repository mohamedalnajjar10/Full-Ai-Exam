// نقطة واحدة لكل طلب بيروح على الباك اند.
//
// قبل هيك كان في 4 طرق مختلفة (fetch مباشر بـ 3 ثوابت base مختلفة +
// fetchWithAuth + نسخة محلية بصفحة select-branch)، والتوكن كان متخزّن
// بـ localStorage رغم إنو الباك اند أصلاً بيسيت كوكيز httpOnly.
//
// هلق: الكوكيز هي مصدر الحقيقة الوحيد. ما في توكن بالـ JS، يعني XSS
// ما بيقدر يسرقه، والسيرفر بيقدر يقرأ الجلسة — وهاد يلي بيخلّي
// الـ Server Components ممكنة.

import { apiUrl } from "./apiBase";

/** بينبّه الـ AuthContext إنو حالة الجلسة تغيّرت. */
export function notifyAuthChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth-change"));
  }
}

import {
  clearParentDeviceTrustToken,
  getParentDeviceTrustToken,
  saveParentDeviceTrustToken,
} from "./parentStorage";

// لو صار أكتر من 401 بنفس الوقت، منعمل تجديد واحد بس ومنخلي الباقي ينتظره.
let studentRefreshPromise: Promise<boolean> | null = null;
let parentRefreshPromise: Promise<boolean> | null = null;

// بعد فشل تجديد، ما في داعي نحاول من جديد مع كل طلب — الجلسة ميتة لحد
// ما يسجّل دخول. هيك ما منستهلك حد الـ throttle على الباك اند.
let studentRefreshFailedUntil = 0;
let parentRefreshFailedUntil = 0;
const REFRESH_COOLDOWN_MS = 30_000;

/** يُستدعى بعد تسجيل دخول ناجح حتى نسمح بالتجديد من جديد. */
export function resetRefreshCooldown() {
  studentRefreshFailedUntil = 0;
  parentRefreshFailedUntil = 0;
}

async function refreshStudentSession(): Promise<boolean> {
  if (Date.now() < studentRefreshFailedUntil) return false;
  if (studentRefreshPromise) return studentRefreshPromise;

  studentRefreshPromise = (async () => {
    try {
      const res = await fetch(apiUrl("/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        // الـ refresh token جاي من كوكي httpOnly، مش من الـ body
        body: "{}",
      });
      if (!res.ok) studentRefreshFailedUntil = Date.now() + REFRESH_COOLDOWN_MS;
      return res.ok;
    } catch (error) {
      console.error("تعذر تجديد جلسة الطالب:", error);
      return false;
    } finally {
      studentRefreshPromise = null;
    }
  })();

  return studentRefreshPromise;
}

async function refreshParentSession(): Promise<boolean> {
  if (Date.now() < parentRefreshFailedUntil) return false;
  if (parentRefreshPromise) return parentRefreshPromise;

  parentRefreshPromise = (async () => {
    try {
      // 1. محاولة التجديد عبر كوكي parent_refresh_token
      const res = await fetch(apiUrl("/auth/parent/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (res.ok) return true;

      // 2. خط الدفاع: إذا انمسحت الكوكيز بسبب سياسة Safari، استعادة الجلسة عبر رمز توثيق الجهاز
      const trustToken = getParentDeviceTrustToken();
      if (trustToken) {
        const deviceRes = await fetch(apiUrl("/auth/parent/device-login"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceTrustToken: trustToken }),
        });
        if (deviceRes.ok) {
          const data = (await deviceRes.json().catch(() => null)) as {
            deviceTrustToken?: string;
          } | null;
          if (data?.deviceTrustToken) {
            saveParentDeviceTrustToken(data.deviceTrustToken);
          }
          return true;
        } else {
          clearParentDeviceTrustToken();
        }
      }

      parentRefreshFailedUntil = Date.now() + REFRESH_COOLDOWN_MS;
      return false;
    } catch (error) {
      console.error("تعذر تجديد جلسة ولي الأمر:", error);
      return false;
    } finally {
      parentRefreshPromise = null;
    }
  })();

  return parentRefreshPromise;
}

/**
 * استخدمها لأي طلب محمي. بترفق الكوكيز تلقائياً، وإذا رجع 401 بتجدّد
 * الجلسة مرة وحدة وبتعيد الطلب.
 */
export async function fetchWithAuth(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : apiUrl(path);
  const request = () =>
    fetch(url, { ...init, credentials: "include" });

  let res = await request();

  if (res.status === 401) {
    const isParentRequest =
      path.startsWith("/auth/parent") ||
      (typeof window !== "undefined" &&
        window.location.pathname.startsWith("/parent"));

    const refreshed = isParentRequest
      ? await refreshParentSession()
      : await refreshStudentSession();

    if (refreshed) {
      res = await request();
    }
    // لو فشل التجديد، منرجّع الـ 401 للمستدعي وهو بيقرر.
  }

  return res;
}

/** طلب عام بدون مصادقة (تسجيل دخول، تسجيل، إلخ). */
export function fetchPublic(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(apiUrl(path), { ...init, credentials: "include" });
}

export async function logout(): Promise<void> {
  try {
    await fetchWithAuth("/auth/logout", { method: "POST" });
  } catch (error) {
    // حتى لو فشل الطلب، منكمّل — الكوكيز بتنمسح من السيرفر أو بتنتهي لحالها
    console.error("تعذر إنهاء الجلسة على السيرفر:", error);
  } finally {
    notifyAuthChange();
  }
}

/**
 * بيقرأ جسم الرد كـ JSON، وبيرجّع null إذا ما كان JSON.
 *
 * مش كل رد بيجي من الباك اند. إذا الـ rewrite ما لقي الباك اند، Next
 * بيرجّع 500 بنص عادي "Internal Server Error"، وres.json() بترمي
 * SyntaxError بتخفي الخطأ الحقيقي وبتقفز عالـ catch تبع الشبكة.
 * منقرا الجسم بأمان ومنخلّي القرار على res.status.
 */
export async function readJson<T = unknown>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
