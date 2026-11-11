// طلبات الحساب والأمان: الملف الشخصي، كلمة المرور، والمصادقة الثنائية.
import type { AuthUser } from "@ai-exam/types";
import { ApiError, request } from "./api";

export function updateProfile(name: string) {
  return request<AuthUser>("/users/me", { method: "PATCH", body: JSON.stringify({ name }) });
}

export function changePassword(newPassword: string, currentPassword?: string) {
  return request<{ message: string }>("/auth/password/change", {
    method: "POST",
    body: JSON.stringify({ newPassword, ...(currentPassword ? { currentPassword } : {}) }),
  });
}

export function startTwoFactorSetup() {
  return request<{ secret: string; otpauthUrl: string; qrCode: string }>("/auth/2fa/setup", { method: "POST" });
}

export function enableTwoFactor(code: string) {
  return request<{ recoveryCodes: string[] }>("/auth/2fa/enable", { method: "POST", body: JSON.stringify({ code }) });
}

export function disableTwoFactor(code: string, password?: string) {
  return request<{ message: string }>("/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ code, ...(password ? { password } : {}) }),
  });
}

export function regenerateRecoveryCodes(code: string) {
  return request<{ recoveryCodes: string[] }>("/auth/2fa/recovery-codes", { method: "POST", body: JSON.stringify({ code }) });
}

export function changeBranch(branchId: string) {
  return request<unknown>("/branches/change", { method: "POST", body: JSON.stringify({ branchId }) });
}

/** رسائل الأخطاء الخاصة بشاشات الأمان — أدق من الرسائل العامة. */
export function securityError(err: unknown): string {
  if (err instanceof ApiError) {
    const m = err.message.toLowerCase();
    if (err.status === 429) return "محاولات خاطئة كثيرة. انتظر 15 دقيقة ثم حاول مجدداً.";
    if (m.includes("already used")) return "هذا الرمز استُخدم للتو. انتظر ظهور الرمز التالي في التطبيق.";
    if (m.includes("invalid verification code")) return "الرمز غير صحيح. تأكد أن ساعة هاتفك مضبوطة تلقائياً.";
    if (m.includes("invalid password") || m.includes("current password")) return "كلمة المرور الحالية غير صحيحة.";
    if (m.includes("different")) return "اختر كلمة مرور مختلفة عن الحالية.";
    if (m.includes("setup first")) return "انتهت جلسة الإعداد. ابدأ من جديد.";
    if (err.status === 401) return "انتهت صلاحية الجلسة، سجّل الدخول من جديد.";
    if (err.status >= 500) return "الخدمة غير متاحة حالياً، حاول بعد قليل.";
    if (err.status === 400) return "البيانات المدخلة غير صالحة.";
  }
  if (err instanceof TypeError) return "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.";
  return "حدث خطأ غير متوقع، حاول مرة أخرى.";
}
