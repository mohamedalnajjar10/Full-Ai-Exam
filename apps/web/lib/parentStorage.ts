/**
 * إدارة تخزين واسترجاع رمز استرداد جلسة ولي الأمر (Device Trust Token).
 * يعمل كخط دفاع أساسي ضد سياسة Safari و iOS في مسح الـ httpOnly Cookies بعد فترات الخمول.
 */

export const PARENT_DEVICE_TRUST_KEY = "masar_parent_device_token";

/**
 * حفظ رمز توثيق الجهاز في localStorage
 */
export function saveParentDeviceTrustToken(token: string): void {
  if (typeof window === "undefined" || !token) return;
  try {
    localStorage.setItem(PARENT_DEVICE_TRUST_KEY, token);
  } catch (err) {
    console.warn("تعذر حفظ رمز توثيق الجهاز في التخزين المحلي:", err);
  }
}

/**
 * قراءة رمز توثيق الجهاز المحفوظ
 */
export function getParentDeviceTrustToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(PARENT_DEVICE_TRUST_KEY);
  } catch {
    return null;
  }
}

/**
 * مسح رمز توثيق الجهاز عند تسجيل الخروج
 */
export function clearParentDeviceTrustToken(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(PARENT_DEVICE_TRUST_KEY);
  } catch {
    // تجاهل أخطاء التخزين
  }
}
