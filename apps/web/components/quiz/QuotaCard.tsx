"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Zap, Crown, Target, MessageSquare, ArrowLeft } from "lucide-react";
import {
  getMySubscriptionStatus,
  getQuota,
  type UserSubscriptionStatus,
} from "@/lib/api";
import {
  getCachedQuotaStatus,
  setCachedQuotaStatus,
  subscribeToQuotaChanges,
  applyOptimisticQuotaUpdate,
} from "@/lib/quotaSync";
import { Card } from "@/components/ui/Card";

export default function QuotaCard({ refreshKey = 0 }: { refreshKey?: number }) {
  const pathname = usePathname();
  const initialCache = getCachedQuotaStatus();
  const [subStatus, setSubStatus] = useState<UserSubscriptionStatus | null>(initialCache);
  const [legacyRemaining, setLegacyRemaining] = useState<number | null>(null);
  const [legacyLimit, setLegacyLimit] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(!initialCache);
  const isFetchingRef = useRef(false);
  const subStatusRef = useRef(subStatus);
  subStatusRef.current = subStatus;

  const fetchStatus = useCallback((showSkeleton = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (showSkeleton && !subStatusRef.current) {
      setLoading(true);
    }

    getMySubscriptionStatus()
      .then((status) => {
        setSubStatus(status);
        setCachedQuotaStatus(status);
        setFailed(false);
        setLoading(false);
      })
      .catch(() => {
        // Fallback to legacy getQuota if subscriptions endpoint is unreachable
        getQuota()
          .then((q) => {
            setLegacyRemaining(q.remaining);
            setLegacyLimit(q.quotaLimit);
            setFailed(false);
            setLoading(false);
          })
          .catch(() => {
            if (!subStatusRef.current) {
              setFailed(true);
            }
            setLoading(false);
          });
      })
      .finally(() => {
        isFetchingRef.current = false;
      });
  }, []);

  // جلب أولي أو عند تغيّر مفتاح التحديث
  useEffect(() => {
    fetchStatus(!initialCache);
  }, [refreshKey]);

  // إعادة الجلب الصامت عند الانتقال بين الصفحات (/home, /quizzes, /assessments)
  useEffect(() => {
    fetchStatus(false);
  }, [pathname]);

  // الاشتراك في أحداث تحديث الرصيد اللحظية (عبر المكونات والتبويبات)
  useEffect(() => {
    const unsubscribe = subscribeToQuotaChanges((detail) => {
      if (detail.feature) {
        // تطبيق فوري متفائل لتغيير الأرقام في 0ms
        const updated = applyOptimisticQuotaUpdate(detail.feature, detail.deltaUsed ?? 1);
        if (updated) {
          setSubStatus({ ...updated });
        } else {
          setSubStatus((prev) => {
            if (!prev || !prev.quotas?.[detail.feature!]) return prev;
            const f = prev.quotas[detail.feature!];
            const newUsed = f.used + (detail.deltaUsed ?? 1);
            const newRemaining = f.limit !== null ? Math.max(0, f.limit - newUsed) : null;
            const next = {
              ...prev,
              quotas: {
                ...prev.quotas,
                [detail.feature!]: {
                  ...f,
                  used: newUsed,
                  remaining: newRemaining,
                  allowed: f.limit === null || newRemaining === null || newRemaining > 0,
                },
              },
            };
            setCachedQuotaStatus(next);
            return next;
          });
        }
      } else if (detail.newStatus) {
        setSubStatus(detail.newStatus);
      }
      // جلب صامت من الخادم للتأكيد والمزامنة التامة
      fetchStatus(false);
    });

    // استماع لرجوع الطالب إلى التبويب أو إعادة تركيز النافذة
    const onFocus = () => fetchStatus(false);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchStatus(false);
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      unsubscribe();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchStatus]);

  if (loading && !subStatus) {
    return (
      <Card>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-canvas" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-canvas" />
            <div className="h-2 w-20 animate-pulse rounded bg-canvas" />
          </div>
        </div>
        <div className="mt-4 h-2 animate-pulse rounded-full bg-canvas" />
      </Card>
    );
  }

  if (failed && !subStatus) {
    return (
      <Card>
        <p className="text-xs text-muted">تعذّر تحميل تفاصيل الرصيد حالياً.</p>
      </Card>
    );
  }

  const planName = subStatus?.planName || "الباقة المجانية";
  const badge = subStatus?.badge;
  const isPaid = subStatus?.isPaid || false;

  const quiz = subStatus?.quotas?.quiz ?? {
    limit: legacyLimit ?? 3,
    remaining: legacyRemaining ?? 3,
    used: 0,
    allowed: true,
  };
  const assessment = subStatus?.quotas?.assessment ?? {
    limit: 1,
    remaining: 1,
    used: 0,
    allowed: true,
  };
  const chat = subStatus?.quotas?.chat ?? {
    limit: 10,
    remaining: 10,
    used: 0,
    allowed: true,
  };

  const renderFeatureRow = (
    label: string,
    icon: React.ReactNode,
    quotaItem: { limit: number | null; remaining: number | null },
  ) => {
    const isUnlimited = quotaItem.limit === null;
    const remaining = Number(quotaItem.remaining ?? 0);
    const limit = Math.max(1, Number(quotaItem.limit ?? 1));
    const percent = isUnlimited ? 100 : Math.min(100, (remaining / limit) * 100);

    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 font-medium text-navy-800">
            {icon}
            <span>{label}</span>
          </span>
          {isUnlimited ? (
            <span className="font-bold text-teal-700">غير محدود ♾️</span>
          ) : (
            <span className="tabular font-bold text-navy-900">
              <span className={remaining > 0 ? "text-navy-900" : "text-rose-600"}>
                {remaining}
              </span>
              <span className="text-muted font-normal"> / {limit} متبقٍ</span>
            </span>
          )}
        </div>
        {!isUnlimited && (
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
            <div
              className={`h-full rounded-full transition-[width] duration-700 ${
                percent > 35 ? "bg-gold-500" : percent > 0 ? "bg-amber-500" : "bg-rose-500"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="relative overflow-hidden">
      {/* رأس البطاقة */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
            <Zap size={18} />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold text-navy-900">رصيدك اليومي</p>
              {badge ? (
                <span className="rounded-full bg-gold-50 border border-gold-200/60 px-2 py-0.5 text-[10px] font-bold text-gold-800">
                  {badge}
                </span>
              ) : (
                <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] font-semibold text-muted">
                  {planName}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted">يتجدد تلقائياً منتصف الليل</p>
          </div>
        </div>

        {!isPaid && (
          <Link
            href="/subscriptions"
            className="flex items-center gap-1 text-[11px] font-bold text-gold-700 hover:text-gold-800 transition-colors"
          >
            <Crown size={12} className="text-gold-600" />
            <span>ترقية</span>
          </Link>
        )}
      </div>

      {/* تفصيل الحصص الثلاث */}
      <div className="mt-4 space-y-3 pt-3 border-t border-line">
        {renderFeatureRow(
          "الكويزات السريعة",
          <Zap size={13} className="text-gold-500" />,
          quiz,
        )}
        {renderFeatureRow(
          "اختبارات التقييم",
          <Target size={13} className="text-teal-600" />,
          assessment,
        )}
        {renderFeatureRow(
          "شات المستشار الذكي",
          <MessageSquare size={13} className="text-sky-500" />,
          chat,
        )}
      </div>

      {/* شريط الإجراء السفلي */}
      <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-xs">
        <Link
          href="/subscriptions"
          className="w-full flex items-center justify-between font-semibold text-navy-800 hover:text-teal-700 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Crown size={13} className="text-gold-600" />
            <span>باقات الاشتراك وكروت الشحن</span>
          </span>
          <ArrowLeft size={13} className="text-muted" />
        </Link>
      </div>
    </Card>
  );
}
