"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Bot,
  CircleCheck,
  ClipboardCheck,
  Cpu,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  UserX,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";
import { AreaChart, BarList, Sparkline } from "./_components/charts";
import {
  AdminPageHeader,
  Code,
  Meter,
  Panel,
  Segmented,
  StatusPill,
  compact,
  fmt,
  type StatusTone,
} from "./_components/ui";
import {
  getAdminOverview,
  type AdminOverviewData,
  type OverviewActivity,
  type OverviewJob,
  type OverviewQueue,
  type OverviewServiceHealth,
} from "./_data/overview";

const ACTIVITY_ICON = {
  upload: UploadCloud,
  check: CircleCheck,
  cpu: Cpu,
  book: BookOpen,
  shield: ShieldAlert,
  user: UserX,
} as const;

const HEALTH_TONE: Record<string, StatusTone> = {
  ok: "ok",
  degraded: "warn",
  down: "error",
};

const HEALTH_LABEL: Record<string, string> = {
  ok: "يعمل بكفاءة",
  degraded: "متذبذب / محلي",
  down: "متوقف",
};

const STAGES = [
  { id: "uploaded", label: "مرفوع" },
  { id: "extracting", label: "الاستخراج" },
  { id: "chunking", label: "التقطيع" },
  { id: "embedding", label: "التضمين" },
  { id: "indexed", label: "مفهرس" },
];

function StatTile({
  label,
  value,
  delta,
  trend,
  note,
  loading = false,
}: {
  label: string;
  value: string;
  delta?: number;
  trend?: number[];
  note?: string;
  loading?: boolean;
}) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-white p-5 shadow-card transition-all">
      <p className="text-[13px] text-muted">{label}</p>
      <div className="flex items-end justify-between gap-3">
        <div>
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded-lg bg-navy-100" />
          ) : (
            <p className="text-[28px] font-bold leading-none text-navy-900">{value}</p>
          )}
          {delta !== undefined && !loading ? (
            <p
              className={`mt-2 inline-flex items-center gap-1 text-xs font-medium ${
                up ? "text-teal-700" : "text-rose-600"
              }`}
            >
              {up ? <ArrowUpRight size={14} aria-hidden /> : <ArrowDownRight size={14} aria-hidden />}
              <span className="tabular" dir="ltr">
                {up ? "+" : ""}
                {delta}%
              </span>
              <span className="font-normal text-muted">عن الشهر الماضي</span>
            </p>
          ) : (
            note && !loading && <p className="mt-2 text-xs text-muted">{note}</p>
          )}
        </div>
        {trend && !loading && <Sparkline values={trend} />}
      </div>
    </div>
  );
}

export default function AdminOverview() {
  const { user } = useAuth();
  const [range, setRange] = useState<"7" | "30">("30");
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const loadData = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setIsLoading(true);
      else setIsRefreshing(true);

      try {
        const res = await getAdminOverview(range);
        setData(res);
        setError(null);
        setLastUpdated(
          new Date().toLocaleTimeString("ar-EG", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
        );
      } catch (err: any) {
        if (!isBackground) {
          setError(err?.message || "تعذر تحميل بيانات لوحة التحكم.");
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [range],
  );

  useEffect(() => {
    void loadData(false);

    // تحديث تلقائي دوري كل 15 ثانية طالما التبويب نشط
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void loadData(true);
      }
    }, 15_000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadData(true);
      }
    };

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onVisibilityChange);
    };
  }, [loadData]);

  const series = data?.aiRequestsSeries || [];
  const totalRequests = series.reduce((s, d) => s + d.value, 0);
  const activeJobs = data?.pipeline?.jobs || [];
  const subjects = data?.knowledgeReadiness?.subjects || [];
  const totalChunks = data?.knowledgeReadiness?.totalChunks || 0;
  const indexedChunks = data?.knowledgeReadiness?.indexedChunks || 0;
  const overallPercent = data?.knowledgeReadiness?.overallPercent || 100;

  return (
    <>
      <AdminPageHeader
        eyebrow={user?.name ? `أهلاً وسهلاً، ${user.name}` : "نظرة عامة على المنصة"}
        title="لوحة المتابعة اللحظية"
        description="بيانات حية مباشرة من قاعدة البيانات: تفاعل الطلاب، خط معالجة الامتحانات والكتب، وأداء النماذج."
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {lastUpdated && (
              <div
                className="hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 text-xs text-muted md:flex"
                title="يتم تحديث البيانات بشكل تلقائي فور حدوث أي نشاط"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
                </span>
                <span>تحديث حي: {lastUpdated}</span>
              </div>
            )}
            <button
              type="button"
              onClick={() => void loadData(true)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-white px-3 py-2 text-xs font-medium text-navy-800 shadow-sm transition-colors hover:bg-navy-50 disabled:opacity-50"
              title="تحديث فوري لجميع المؤشرات"
            >
              <RefreshCw size={13} className={isRefreshing ? "animate-spin text-teal-600" : ""} />
              تحديث فوري
            </button>
            <Segmented
              label="الفترة"
              value={range}
              onChange={(v) => setRange(v as "7" | "30")}
              options={[
                { value: "7", label: "7 أيام" },
                { value: "30", label: "30 يوماً" },
              ]}
            />
            <ButtonLink href="/admin/ingestion" variant="accent" size="md">
              <UploadCloud size={17} />
              رفع ملفات
            </ButtonLink>
          </div>
        }
      />

      {error && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 shadow-sm">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => void loadData(false)}
            className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-700"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* المؤشرات الرئيسية (Live KPIs) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="الطلاب المسجّلون"
          value={data ? fmt(data.kpis.students.value) : "—"}
          delta={data?.kpis.students.delta}
          trend={data?.kpis.students.trend}
          loading={isLoading}
        />
        <StatTile
          label="نشطون اليوم"
          value={data ? fmt(data.kpis.activeToday.value) : "—"}
          delta={data?.kpis.activeToday.delta}
          trend={data?.kpis.activeToday.trend}
          loading={isLoading}
        />
        <StatTile
          label="أسئلة البنك المعتمدة"
          value={data ? fmt(data.kpis.bankQuestions.value) : "—"}
          delta={data?.kpis.bankQuestions.delta}
          trend={data?.kpis.bankQuestions.trend}
          loading={isLoading}
        />
        <StatTile
          label="تكلفة الذكاء الاصطناعي هذا الشهر"
          value={data?.kpis.aiCost.value || "$0.00"}
          note={data?.kpis.aiCost.note}
          loading={isLoading}
        />
      </div>

      {/* رسوم الاستهلاك والمهام */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="طلبات الذكاء الاصطناعي اليومية"
          description={
            <>
              <span className="tabular font-semibold text-ink">{fmt(totalRequests)}</span> طلباً فعلياً خلال آخر{" "}
              {range === "7" ? "7 أيام" : "30 يوماً"}
            </>
          }
          action={
            <Link href="/admin/usage" className="text-[13px] font-medium text-teal-700 hover:underline">
              التفاصيل
            </Link>
          }
        >
          {isLoading ? (
            <div className="flex h-56 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            </div>
          ) : (
            <AreaChart data={series} unit="طلب" label="عدد طلبات الذكاء الاصطناعي في اليوم" />
          )}
        </Panel>

        <Panel title="الطلبات حسب المهمة" description={`آخر ${range} يوماً`}>
          {isLoading ? (
            <div className="flex h-56 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
            </div>
          ) : (
            <BarList items={data?.requestsByTask || []} />
          )}
        </Panel>
      </div>

      {/* خط المعالجة وجاهزية قاعدة المعرفة */}
      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="خط معالجة المحتوى"
          description={`${data?.pipeline.activeJobsCount ?? 0} مهام قيد التنفيذ`}
          icon={UploadCloud}
          action={
            <Link
              href="/admin/ingestion"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-teal-700 hover:underline"
            >
              كل المهام <ArrowLeft size={14} />
            </Link>
          }
          bodyClassName="divide-y divide-line"
        >
          {isLoading ? (
            <div className="p-8 text-center text-sm text-muted">جاري تحميل مهام المعالجة الحية…</div>
          ) : activeJobs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted">
              لا توجد مهام معالجة حالياً — جميع الكتب والامتحانات المرفوعة مكتملة ومفهرسة بنجاح.
            </div>
          ) : (
            activeJobs.slice(0, 5).map((job: OverviewJob) => {
              const stageIndex = Math.max(
                0,
                STAGES.findIndex((s) => s.id === job.stage),
              );
              return (
                <div key={job.id} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink" dir="auto">
                      {job.name}
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      {job.kind === "book" ? "كتاب مدرسي" : "امتحان وزاري"} · {job.subject} · {job.branch}
                    </p>
                  </div>
                  <div className="flex w-full items-center gap-3 sm:w-72">
                    {job.stage === "failed" ? (
                      <StatusPill tone="error">فشل الاستخراج</StatusPill>
                    ) : job.stage === "indexed" ? (
                      <StatusPill tone="ok">مفهرس</StatusPill>
                    ) : (
                      <div className="flex-1">
                        <div className="mb-1 flex justify-between text-[11px] text-muted">
                          <span>{STAGES[stageIndex]?.label || "قيد المعالجة"}</span>
                          <span className="tabular">
                            {stageIndex + 1}/{STAGES.length}
                          </span>
                        </div>
                        <Meter value={job.progress || stageIndex * 25} label={`تقدّم ${job.name}`} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </Panel>

        <Panel title="جاهزية قاعدة المعرفة" description="مقاطع الكتب المفهرسة للبحث الدلالي والـ RAG" icon={BookOpen}>
          <p className="text-[40px] font-bold leading-none text-navy-900">
            {overallPercent}
            <span className="text-2xl">%</span>
          </p>
          <p className="mt-2 text-[13px] text-muted">
            <span className="tabular font-semibold text-ink">{fmt(indexedChunks)}</span> من{" "}
            <span className="tabular">{fmt(totalChunks || 1)}</span> مقطعاً
          </p>
          <ul className="mt-5 flex flex-col gap-3">
            {subjects.slice(0, 6).map((s) => (
              <li key={s.id}>
                <div className="mb-1 flex justify-between text-[13px]">
                  <span className="text-ink">
                    {s.name} <span className="text-subtle">· {s.branch}</span>
                  </span>
                  <span className="tabular text-muted">{s.percent}%</span>
                </div>
                <Meter
                  value={s.indexed}
                  max={s.chunks}
                  tone={s.percent === 100 ? "teal" : s.percent > 0 ? "amber" : "rose"}
                  label={`فهرسة ${s.name}`}
                />
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* صحة الخدمات، القوائم، والنشاطات الأخيرة */}
      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <Panel
          title="صحة الخدمات والمنظومة"
          icon={Cpu}
          action={
            <Link href="/admin/health" className="text-[13px] font-medium text-teal-700 hover:underline">
              عرض التفاصيل
            </Link>
          }
          bodyClassName="divide-y divide-line"
        >
          {data?.services?.map((s: OverviewServiceHealth) => (
            <div key={s.name} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{s.name}</p>
                <p className="truncate text-xs text-muted">{s.detail}</p>
              </div>
              <StatusPill tone={HEALTH_TONE[s.status] || "ok"}>{HEALTH_LABEL[s.status] || "يعمل"}</StatusPill>
            </div>
          ))}
        </Panel>

        <Panel title="قوائم المعالجة الخلفية" icon={ClipboardCheck} bodyClassName="p-5 flex flex-col gap-5">
          {data?.queues?.map((q: OverviewQueue) => (
            <div key={q.name}>
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium text-ink">{q.label}</p>
                <Code>{q.name}</Code>
              </div>
              <dl className="mt-2.5 grid grid-cols-4 gap-2 text-center">
                {[
                  ["بالانتظار", q.waiting],
                  ["نشطة", q.active],
                  ["مكتملة", q.completed],
                  ["فاشلة", q.failed],
                ].map(([k, v]) => (
                  <div key={k as string} className="rounded-lg bg-canvas px-2 py-2">
                    <dt className="text-[11px] text-muted">{k}</dt>
                    <dd
                      className={`tabular text-sm font-semibold ${
                        k === "فاشلة" && (v as number) > 0 ? "text-rose-600" : "text-ink"
                      }`}
                    >
                      {compact(v as number)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </Panel>

        <Panel
          title="آخر النشاطات الحية"
          className="lg:col-span-2 xl:col-span-1"
          action={
            <Link href="/admin/audit" className="text-[13px] font-medium text-teal-700 hover:underline">
              السجل الكامل
            </Link>
          }
          bodyClassName="px-5 py-2"
        >
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted">جاري تحميل النشاطات…</div>
          ) : (data?.activity || []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">لا توجد نشاطات مسجلة حديثاً</div>
          ) : (
            <ol className="relative">
              {data!.activity.map((a: OverviewActivity, i: number) => {
                const Icon = ACTIVITY_ICON[a.icon] ?? Bot;
                return (
                  <li key={a.id} className="relative flex gap-3 py-3">
                    {i < data!.activity.length - 1 && (
                      <span className="absolute bottom-0 start-[15px] top-11 w-px bg-line" aria-hidden />
                    )}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-navy-50 text-navy-800">
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-5 text-ink">
                        <span className="font-semibold">{a.who}</span> {a.what}
                      </p>
                      <p className="truncate text-xs text-muted" dir="auto">
                        {a.target}
                      </p>
                    </div>
                    <span className="shrink-0 text-[11px] text-subtle">{a.when}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </Panel>
      </div>
    </>
  );
}
