/**
 * نظام المزامنة اللحظية للرصيد اليومي والاشتراكات (Real-time Quota Synchronization)
 * يضمن تحديث أرقام وأشرطة الرصيد في:
 * - الصفحة الرئيسية (/home)
 * - صفحة الكويزات (/quizzes)
 * - صفحة تقييم القدرات (/assessments)
 * - صفحة المسار الذكي (/ai-path)
 * - صفحة الاشتراكات (/subscriptions)
 * تلقائياً عند إجراء أي كويز أو تقييم أو محادثة، أو عبر التبويبات المتعددة دون الحاجة لإعادة تحميل الصفحة.
 */

import type { UserSubscriptionStatus, SubscriptionFeatureType } from "@ai-exam/types";

export type QuotaFeature = SubscriptionFeatureType;

export interface QuotaChangeEventDetail {
  feature?: QuotaFeature;
  deltaUsed?: number;
  newStatus?: UserSubscriptionStatus;
  timestamp: number;
}

const QUOTA_EVENT_NAME = "ai-exam:quota-changed";
const BROADCAST_CHANNEL_NAME = "ai-exam:quota-channel";
const STORAGE_KEY = "ai-exam:last-quota-change";

// ذاكرة كاش مشتركة على مستوى التطبيق (Module-level cache for instant SWR rendering)
let globalQuotaCache: UserSubscriptionStatus | null = null;
let broadcastChannel: BroadcastChannel | null = null;

if (typeof window !== "undefined" && "BroadcastChannel" in window) {
  try {
    broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  } catch {
    broadcastChannel = null;
  }
}

/**
 * الحصول على أحدث حالة رصيد مخزنة في الذاكرة (للرندرة الفورية)
 */
export function getCachedQuotaStatus(): UserSubscriptionStatus | null {
  return globalQuotaCache;
}

/**
 * تحديث الكاش العالمي للرصيد
 */
export function setCachedQuotaStatus(status: UserSubscriptionStatus | null) {
  globalQuotaCache = status;
}

/**
 * تطبيق تعديل فوري ومتفائل (Optimistic Update) على الكاش لتحديث واجهة المستخدم في 0ms
 */
export function applyOptimisticQuotaUpdate(feature: QuotaFeature, deltaUsed = 1): UserSubscriptionStatus | null {
  if (!globalQuotaCache || !globalQuotaCache.quotas?.[feature]) {
    return null;
  }

  const currentFeatureQuota = globalQuotaCache.quotas[feature];
  const newUsed = currentFeatureQuota.used + deltaUsed;
  const newRemaining = currentFeatureQuota.limit !== null
    ? Math.max(0, currentFeatureQuota.limit - newUsed)
    : null;

  globalQuotaCache = {
    ...globalQuotaCache,
    quotas: {
      ...globalQuotaCache.quotas,
      [feature]: {
        ...currentFeatureQuota,
        used: newUsed,
        remaining: newRemaining,
        allowed: currentFeatureQuota.limit === null || newRemaining === null || newRemaining > 0,
      },
    },
  };

  return globalQuotaCache;
}

/**
 * بث إشعار بتحديث الرصيد محلياً وعبر التبويبات
 */
export function notifyQuotaChanged(detail?: {
  feature?: QuotaFeature;
  deltaUsed?: number;
  newStatus?: UserSubscriptionStatus;
}) {
  if (typeof window === "undefined") return;

  // في حال تحديد ميزة، نطبق التعديل المتفائل على الكاش فوراً
  if (detail?.feature) {
    applyOptimisticQuotaUpdate(detail.feature, detail.deltaUsed ?? 1);
  } else if (detail?.newStatus) {
    setCachedQuotaStatus(detail.newStatus);
  }

  const eventPayload: QuotaChangeEventDetail = {
    feature: detail?.feature,
    deltaUsed: detail?.deltaUsed ?? 1,
    newStatus: detail?.newStatus || globalQuotaCache || undefined,
    timestamp: Date.now(),
  };

  // 1. حدث مخصص داخل الصفحة (CustomEvent)
  window.dispatchEvent(new CustomEvent(QUOTA_EVENT_NAME, { detail: eventPayload }));

  // 2. بث عبر BroadcastChannel لجميع النوافذ والتبويبات
  try {
    broadcastChannel?.postMessage(eventPayload);
  } catch {
    // تجاهل في بيئات عدم التوافق
  }

  // 3. تخزين في localStorage لإشعار تبويبات المتصفحات القديمة
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(eventPayload));
  } catch {
    // تجاهل في حالة حظر التخزين المحلي
  }
}

/**
 * الاشتراك في تغييرات الرصيد اليومي لتحديث الواجهة تلقائياً
 */
export function subscribeToQuotaChanges(
  onQuotaChanged: (detail: QuotaChangeEventDetail) => void
): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustomEvent = (e: Event) => {
    const customEvent = e as CustomEvent<QuotaChangeEventDetail>;
    onQuotaChanged(customEvent.detail || { timestamp: Date.now() });
  };

  const handleBroadcastMessage = (e: MessageEvent) => {
    if (e.data && typeof e.data === "object") {
      const data = e.data as QuotaChangeEventDetail;
      if (data.newStatus) {
        setCachedQuotaStatus(data.newStatus);
      }
      onQuotaChanged(data);
    }
  };

  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = JSON.parse(e.newValue);
        if (parsed.newStatus) {
          setCachedQuotaStatus(parsed.newStatus);
        }
        onQuotaChanged(parsed);
      } catch {
        onQuotaChanged({ timestamp: Date.now() });
      }
    }
  };

  window.addEventListener(QUOTA_EVENT_NAME, handleCustomEvent);
  broadcastChannel?.addEventListener("message", handleBroadcastMessage);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(QUOTA_EVENT_NAME, handleCustomEvent);
    broadcastChannel?.removeEventListener("message", handleBroadcastMessage);
    window.removeEventListener("storage", handleStorage);
  };
}
