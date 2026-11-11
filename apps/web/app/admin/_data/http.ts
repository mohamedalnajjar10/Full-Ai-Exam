/**
 * طلبات لوحة التحكم للـ API: الكوكيز، رسائل الخطأ بالعربي، والتنزيل.
 * مشتركة بين بيانات «المحتوى والمعرفة» (knowledge.ts) و«المنصة» (platform.ts).
 */
import { fetchWithAuth, readJson } from "@/lib/apiClient";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetchWithAuth(path, {
    ...init,
    headers: isForm || !init.body ? init.headers : { "Content-Type": "application/json", ...init.headers },
  });
  const body = await readJson<{ message?: string | string[] } & T>(res);
  if (!res.ok) {
    const msg = Array.isArray(body?.message) ? body.message.join("، ") : body?.message;
    throw new ApiError(msg || (res.status === 403 ? "هذه الصفحة للمشرفين فقط." : "تعذّر الاتصال بالخادم."), res.status);
  }
  return body as T;
}

export const json = (body: unknown) => JSON.stringify(body);

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "" && v !== "all") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** بيحمّل ملف من نقطة محمية (الكوكيز) ويحفظه عند المستخدم */
export async function downloadFile(path: string, filename: string) {
  const separator = path.includes("?") ? "&" : "?";
  const finalPath = path.includes("disposition=") ? path : `${path}${separator}disposition=inline`;
  const res = await fetchWithAuth(finalPath, {
    headers: {
      Accept: "application/octet-stream, application/pdf, */*",
    },
  });
  if (!res.ok) throw new ApiError("تعذّر تنزيل الملف.", res.status);
  const rawBlob = await res.blob();
  if (!rawBlob || rawBlob.size === 0) {
    // خط دفاع ثانٍ: محاولة الحصول على رابط موقّع في حال تعذّر أو فرغ الدفق
    try {
      const modeUrlPath = path.includes("/book/file") ? path.replace("/book/file", "/book/download?mode=url") : null;
      if (modeUrlPath) {
        const urlRes = await fetchWithAuth(modeUrlPath);
        if (urlRes.ok) {
          const data = (await urlRes.json().catch(() => null)) as { downloadUrl?: string } | null;
          if (data?.downloadUrl) {
            const directLink = document.createElement("a");
            directLink.href = data.downloadUrl;
            directLink.download = filename;
            directLink.style.display = "none";
            document.body.appendChild(directLink);
            directLink.click();
            setTimeout(() => directLink.remove(), 1000);
            return;
          }
        }
      }
    } catch {
      // ignore
    }

    throw new ApiError("ملف التنزيل فارغ من الخادم.", res.status);
  }
  const isPdf = filename.toLowerCase().endsWith(".pdf");
  const blob = isPdf ? new Blob([rawBlob], { type: "application/pdf" }) : rawBlob;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
      a.remove();
    } catch {
      // ignore
    }
  }, 60_000);
}

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "حدث خطأ غير متوقع.";
}
