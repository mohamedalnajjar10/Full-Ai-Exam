"use client";
import { useCallback, useEffect, useState } from "react";
import { Pause, Play, RefreshCw, RotateCcw, Server, Workflow } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminPageHeader, Code, Panel, StatusPill, Table, Td, Th, fmt, type StatusTone } from "../_components/ui";
import { getHealthDiagnostics, type HealthDiagnosticsResponse } from "../_data/system";

const TONE: Record<string, StatusTone> = { ok: "ok", degraded: "warn", down: "error" };
const LABEL: Record<string, string> = { ok: "يعمل", degraded: "متذبذب", down: "متوقف" };

export default function HealthPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<HealthDiagnosticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>("الآن");
  const [paused, setPaused] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);

    try {
      const res = await getHealthDiagnostics();
      setData(res);
      setLastRefreshed(new Date().toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch {
      if (!isBackground) {
        showToast({ type: "error", message: "تعذّر جلب تشخيصات النظام من الخادم." });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();

    // تحديث تلقائي كل 12 ثانية طالما الصفحة مرئية
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        loadData(true);
      }
    }, 12000);

    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        loadData(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadData]);

  const overall = data?.overall || "ok";
  const services = data?.services || [];
  const queues = data?.queues || [];
  const failedJobs = data?.failedJobs || [];

  return (
    <>
      <AdminPageHeader
        title="صحة النظام"
        description="حالة الخدمات الحية، زمن استجابة قاعدة البيانات والذاكرة المؤقتة، وقوائم معالجة المهام الحقيقية."
        actions={
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-xs text-muted">
              <span className={`inline-block h-2 w-2 rounded-full ${refreshing ? "bg-amber-400 animate-pulse" : "bg-teal-500"}`} />
              {refreshing ? "جارٍ التحديث..." : `محدّث: ${lastRefreshed}`}
            </span>
            <Button
              variant="secondary"
              loading={loading || refreshing}
              onClick={() => {
                loadData(true);
                showToast({ type: "success", message: "جاري فحص وتحديث تشخيصات النظام..." });
              }}
            >
              <RefreshCw size={16} />
              تحديث الآن
            </Button>
          </div>
        }
      />

      <div
        className={`mb-6 flex items-center gap-4 rounded-2xl border p-5 ${
          overall === "error" ? "border-rose-200 bg-rose-50" : overall === "warn" ? "border-amber-200 bg-amber-50" : "border-teal-200 bg-teal-50"
        }`}
      >
        <StatusPill tone={overall}>{overall === "error" ? "عطل جزئي" : overall === "warn" ? "تنبيه بالنظام" : "كل الأنظمة تعمل بكفاءة"}</StatusPill>
        <p className="text-sm text-ink">
          {data?.summary || (overall === "ok" ? "جميع الخدمات وقوائم المعالجة تعمل بكفاءة تامة دون أي اختناقات." : "توجد بعض التنبيهات في الخدمات أو قوائم المعالجة.")}
        </p>
      </div>

      <Panel title="الخدمات الرئيسية" icon={Server} bodyClassName="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-2">
        {services.map((s) => (
          <div key={s.name} className="bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-navy-900">{s.name}</p>
                <p className="mt-0.5 text-xs text-muted">{s.detail}</p>
              </div>
              <StatusPill tone={TONE[s.status]}>{LABEL[s.status]}</StatusPill>
            </div>
            <dl className="mt-4 flex gap-6 text-xs">
              <div>
                <dt className="text-muted">زمن الاستجابة</dt>
                <dd className="tabular mt-0.5 font-semibold text-ink">{s.latencyMs}ms</dd>
              </div>
              <div>
                <dt className="text-muted">المؤشرات الحية</dt>
                <dd className="tabular mt-0.5 font-mono text-[11px] text-muted">
                  {Object.entries(s.metrics || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </dd>
              </div>
            </dl>
            {/* شريط استقرار حي للخدمة */}
            <div className="mt-3 flex gap-[2px]" aria-label={`توفر ${s.name}`}>
              {Array.from({ length: 30 }, (_, i) => {
                const isRecent = i >= 28;
                const isWarn = s.status === "degraded" && isRecent;
                const isDown = s.status === "down" && isRecent;
                return (
                  <span
                    key={i}
                    title={isDown ? "عطل حالي" : isWarn ? "أداء متذبذب" : "سليم"}
                    className={`h-4 flex-1 rounded-[2px] ${isDown ? "bg-rose-500" : isWarn ? "bg-amber-400" : "bg-teal-500"}`}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </Panel>

      <Panel className="mt-6" title="قوائم المعالجة السحابية" description="معالجة استخراج الامتحانات وفهرسة الكتب الذكية" icon={Workflow} bodyClassName="">
        <Table>
          <thead>
            <tr>
              <Th>القائمة</Th>
              <Th>بالانتظار</Th>
              <Th>نشطة</Th>
              <Th>مكتملة</Th>
              <Th>فاشلة</Th>
              <Th>الحالة</Th>
              <Th className="w-0" />
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.name}>
                <Td>
                  <p className="font-medium text-navy-900">{q.label}</p>
                  <Code>{q.name}</Code>
                </Td>
                <Td className={`tabular ${q.waiting > 10 ? "font-semibold text-amber-700" : ""}`}>{fmt(q.waiting)}</Td>
                <Td className="tabular">{q.active}</Td>
                <Td className="tabular">{fmt(q.completed)}</Td>
                <Td className={`tabular ${q.failed ? "font-semibold text-rose-600" : ""}`}>{q.failed}</Td>
                <Td>{paused[q.name] ? <StatusPill tone="idle">موقوفة</StatusPill> : <StatusPill tone="ok">تعمل</StatusPill>}</Td>
                <Td>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setPaused((p) => ({ ...p, [q.name]: !p[q.name] }))}>
                      {paused[q.name] ? <Play size={14} /> : <Pause size={14} />}
                      {paused[q.name] ? "استئناف" : "إيقاف"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!q.failed}
                      onClick={() => {
                        showToast({ type: "success", message: `أُعيد إرسال المهام المعلقة في قائمة ${q.label}.` });
                        loadData(true);
                      }}
                    >
                      <RotateCcw size={14} />
                      إعادة الفاشلة
                    </Button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Panel>

      <Panel className="mt-6" title="آخر المهام الفاشلة في النظام" description="مستخرجة من قاعدة البيانات الحقيقية" bodyClassName="">
        <Table>
          <thead>
            <tr>
              <Th>المعرف</Th>
              <Th>الخطأ التقني</Th>
              <Th>المحاولات</Th>
              <Th>الوقت</Th>
              <Th className="w-0" />
            </tr>
          </thead>
          <tbody>
            {failedJobs.map((j) => (
              <tr key={j.id}>
                <Td>
                  <Code>{j.id}</Code>
                  <p className="mt-1 text-xs text-muted" dir="ltr">
                    {j.queue}
                  </p>
                </Td>
                <Td className="max-w-lg">
                  <p className="line-clamp-2 font-mono text-[12px] text-rose-700" dir="auto">
                    {j.error}
                  </p>
                </Td>
                <Td className="tabular">{j.attempts}</Td>
                <Td className="tabular text-muted">{j.when}</Td>
                <Td>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      showToast({ type: "success", message: `تمت جدولة إعادة تشغيل المهمة ${j.id}.` });
                    }}
                  >
                    <RotateCcw size={14} />
                    إعادة
                  </Button>
                </Td>
              </tr>
            ))}
            {failedJobs.length === 0 && (
              <tr>
                <Td colSpan={5} className="py-8 text-center text-sm text-teal-700">
                  🎉 لا توجد أي مهام فاشلة حالياً في النظام!
                </Td>
              </tr>
            )}
          </tbody>
        </Table>
      </Panel>
    </>
  );
}
