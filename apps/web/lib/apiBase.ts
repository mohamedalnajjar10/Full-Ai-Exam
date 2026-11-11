/**
 * عنوان الـ API حسب مكان التنفيذ.
 *
 * بالمتصفح: مسار نسبي. الطلب بيروح لنفس الـ origin وnext.config.ts
 * بيعمله rewrite على الباك اند — يعني ولا CORS preflight، والكوكيز
 * بتنبعت لحالها لأنها same-origin.
 *
 * على السيرفر (Server Components / proxy): ما في origin نسبي، فمنحكي مع
 * الباك اند مباشرة. API_ORIGIN متغيّر سيرفر فقط — مش NEXT_PUBLIC_ —
 * فما بينزل للباندل.
 */
export const API_ORIGIN = process.env.API_ORIGIN ?? "http://localhost:8088";

export const API_BASE =
  typeof window === "undefined" ? `${API_ORIGIN}/api/v1` : "/api/v1";

/** يبني عنوان نقطة نهاية من مسار مثل "/auth/login". */
export function apiUrl(path: string): string {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}
