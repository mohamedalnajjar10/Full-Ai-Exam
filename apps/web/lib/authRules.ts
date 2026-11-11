// قواعد التحقق يلي بيطبقها الباك اند (register.dto / reset-password.dto)
// بنفس الحرف. كانت الواجهة تقبل 8 أحرف بدون رقم بالتسجيل، و6 أحرف
// بإعادة التعيين، والسيرفر يرفض الاثنين برسالة عامة.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const PASSWORD_RULES = [
  { id: "length", label: "8 أحرف على الأقل", test: (p: string) => p.length >= 8 },
  { id: "letter", label: "حرف إنجليزي واحد على الأقل", test: (p: string) => /[A-Za-z]/.test(p) },
  { id: "digit", label: "رقم واحد على الأقل", test: (p: string) => /[0-9]/.test(p) },
] as const;

export function passwordError(p: string): string {
  if (!p) return "كلمة المرور مطلوبة";
  if (p.length > 100) return "كلمة المرور طويلة جداً";
  const failed = PASSWORD_RULES.find((r) => !r.test(p));
  return failed ? `كلمة المرور يجب أن تحتوي على ${failed.label}` : "";
}

/** رسالة موحّدة للحالات المشتركة بين كل نماذج الدخول والتسجيل. */
export function commonAuthError(status: number): string | null {
  if (status === 429) return "محاولات كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة.";
  if (status >= 500) return "الخدمة غير متاحة حالياً. تأكد أن الخادم يعمل ثم أعد المحاولة.";
  return null;
}

export const NETWORK_ERROR = "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.";

/** يمنع التحويل لموقع خارجي عبر ?next=//evil.com */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
