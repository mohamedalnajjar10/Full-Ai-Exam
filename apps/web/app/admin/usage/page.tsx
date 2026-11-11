"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Gauge, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/ToastProvider";
import { useAuth } from "@/context/AuthContext";
import { AreaChart, BarList } from "../_components/charts";
import { AdminPageHeader, Code, Input, Meter, Panel, SettingRow, Slider, StatusPill, Switch, Table, Td, Th, compact, fmt } from "../_components/ui";
import { can } from "../_components/nav";
import { errorMessage } from "../_data/http";
import { TASK_LABEL, getUsage, pct, saveRoleQuotas, saveUsageLimits, usd, type UsageLimits, type UsageOverview } from "../_data/platform";

const LIMIT_KEYS: (keyof UsageLimits)[] = ["dailyQuota", "perRequestMax", "monthlyBudgetUsd", "alertAtPct", "hardStop"];

export default function UsagePage() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const canManage = can(user, "billing.manage");
  const [data, setData] = useState<UsageOverview | null>(null);
  const [limits, setLimits] = useState<UsageLimits | null>(null);
  const [roleQuotas, setRoleQuotas] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);

  const apply = useCallback((d: UsageOverview) => {
    setData(d);
    const { dailyQuota, perRequestMax, monthlyBudgetUsd, alertAtPct, hardStop } = d.budget;
    setLimits({ dailyQuota, perRequestMax, monthlyBudgetUsd, alertAtPct, hardStop });
    setRoleQuotas(Object.fromEntries(d.roleQuotas.map((r) => [r.id, r.dailyQuota?.toString() ?? ""])));
  }, []);

  useEffect(() => {
    getUsage()
      .then(apply)
      .catch((e) => setLoadError(errorMessage(e)));
  }, [apply]);

  const limitsDirty = !!data && !!limits && LIMIT_KEYS.some((k) => limits[k] !== data.budget[k]);
  const changedRoles = useMemo(
    () =>
      (data?.roleQuotas ?? [])
        .filter((r) => (roleQuotas[r.id] ?? "") !== (r.dailyQuota?.toString() ?? ""))
        .map((r) => ({ id: r.id, dailyQuota: roleQuotas[r.id]?.trim() ? Number(roleQuotas[r.id]) : null })),
    [data, roleQuotas],
  );
  const rolesValid = changedRoles.every((r) => r.dailyQuota === null || (Number.isInteger(r.dailyQuota) && r.dailyQuota >= 0));

  async function save() {
    if (!limits) return;
    setSaving(true);
    try {
      if (limitsDirty) await saveUsageLimits(limits);
      apply(changedRoles.length ? await saveRoleQuotas(changedRoles) : await getUsage());
      showToast({ type: "success", message: "حُفظت الحصص والميزانية — تسري خلال نصف دقيقة." });
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  if (!data || !limits) {
    return (
      <>
        <AdminPageHeader title="الاستهلاك والحصص" />
        {loadError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{loadError}</p> : <Spinner className="py-24" />}
      </>
    );
  }

  const { budget } = data;
  const spentPct = budget.monthlyBudgetUsd > 0 ? (budget.spentUsd / budget.monthlyBudgetUsd) * 100 : 0;
  const series = data.series.map((d) => {
    const [, m, day] = d.day.split("-");
    return { day: `${Number(day)}/${Number(m)}`, value: d.requests };
  });
  const L = limits;
  const set = <K extends keyof UsageLimits>(k: K) => (v: UsageLimits[K]) => setLimits({ ...L, [k]: v });

  return (
    <>
      <AdminPageHeader
        title="الاستهلاك والحصص"
        description="كم يستهلك الذكاء الاصطناعي، وكم يُسمح لكل طالب، ومتى يتوقف الصرف. الأرقام من سجل كل طلب لنموذج."
        actions={
          canManage && (
            <Button variant="primary" disabled={(!limitsDirty && changedRoles.length === 0) || !rolesValid || saving} onClick={save}>
              حفظ
            </Button>
          )
        }
      />

      {budget.blocked && (
        <p className="mb-6 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-3.5 text-sm text-rose-800">
          <AlertTriangle size={17} className="shrink-0" />
          بُلغ سقف الصرف الشهري: النماذج المدفوعة متوقفة، والتوليد يعمل بالنماذج المجانية فقط حتى بداية الشهر القادم أو رفع السقف.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="الطلبات اليومية"
          description={
            <>
              كل المهام، آخر {data.days} يوماً · <span className="tabular">{fmt(data.totals.requests)}</span> طلب · <span className="tabular">{pct(data.totals.requests ? data.totals.errors / data.totals.requests : null)}</span> أخطاء
            </>
          }
        >
          {data.totals.requests === 0 ? (
            <p className="py-16 text-center text-sm text-muted">لا طلبات مسجّلة بعد — يبدأ السجل مع أول طلب للنموذج.</p>
          ) : (
            <AreaChart data={series} unit="طلب" label="طلبات الذكاء الاصطناعي اليومية" />
          )}
        </Panel>

        <Panel title="الميزانية الشهرية" icon={Wallet} bodyClassName="p-5 flex flex-col gap-4">
          <div>
            <p className="text-[40px] font-bold leading-none text-navy-900" dir="ltr">
              {usd(budget.spentUsd)}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              {L.monthlyBudgetUsd > 0 ? (
                <>
                  من <span className="tabular">${L.monthlyBudgetUsd}</span> هذا الشهر (UTC)
                </>
              ) : (
                "بلا سقف شهري"
              )}
            </p>
          </div>
          {L.monthlyBudgetUsd > 0 && <Meter value={Math.min(budget.spentUsd, L.monthlyBudgetUsd)} max={L.monthlyBudgetUsd} tone={spentPct >= 100 ? "rose" : spentPct >= L.alertAtPct ? "amber" : "teal"} label="الصرف من الميزانية" />}
          {spentPct >= L.alertAtPct && spentPct < 100 && <StatusPill tone="warn">تجاوز الصرف {Math.round(spentPct)}% من السقف</StatusPill>}
          <Slider label="سقف الصرف الشهري" value={L.monthlyBudgetUsd} onChange={set("monthlyBudgetUsd")} min={0} max={500} step={5} format={(v) => (v === 0 ? "∞" : `$${v}`)} disabled={!canManage} />
          <Slider label="تنبيه عند" value={L.alertAtPct} onChange={set("alertAtPct")} min={50} max={100} step={5} format={(v) => `${v}%`} disabled={!canManage} />
          <SettingRow title="إيقاف صارم عند السقف" description="يتوقف Claude والنماذج المدفوعة، ويكمل التوليد بالنماذج المجانية.">
            <Switch checked={L.hardStop} onChange={set("hardStop")} label="إيقاف صارم" disabled={!canManage} />
          </SettingRow>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel title="الاستهلاك حسب النموذج" description={`آخر ${data.days} يوماً`} bodyClassName="">
          {data.models.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">لا بيانات بعد.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>النموذج</Th>
                  <Th>الطلبات</Th>
                  <Th>التوكنات (إدخال/إخراج)</Th>
                  <Th>الأخطاء</Th>
                  <Th>الزمن الوسيط</Th>
                  <Th>التكلفة</Th>
                </tr>
              </thead>
              <tbody>
                {data.models.map((m) => (
                  <tr key={m.model}>
                    <Td>
                      <Code>{m.model}</Code>
                    </Td>
                    <Td className="tabular">{fmt(m.requests)}</Td>
                    <Td className="tabular text-[13px]" >
                      <span dir="ltr">
                        {compact(m.inputTokens)} / {compact(m.outputTokens)}
                      </span>
                    </Td>
                    <Td>
                      <StatusPill tone={m.errorRate < 0.1 ? "ok" : m.errorRate < 0.25 ? "warn" : "error"}>{pct(m.errorRate, 0)}</StatusPill>
                    </Td>
                    <Td className="tabular text-[13px]">{m.medianLatencyMs === null ? "—" : `${(m.medianLatencyMs / 1000).toFixed(1)} ث`}</Td>
                    <Td className="tabular">{usd(m.cost)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel title="حسب المهمة" description={`آخر ${data.days} يوماً`}>
            {data.tasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">لا بيانات بعد.</p>
            ) : (
              <BarList items={data.tasks.map((t) => ({ label: TASK_LABEL[t.task] ?? t.task, value: t.requests, hint: t.cost > 0 ? usd(t.cost) : undefined }))} />
            )}
          </Panel>
          <Panel title="أعلى الطلاب استهلاكاً" description="آخر 7 أيام — طلبات توليد وشرح">
            {data.topStudents.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">لا طلبات طلاب بعد.</p>
            ) : (
              <BarList items={data.topStudents.map((s) => ({ label: s.branch ? `${s.name} · ${s.branch}` : s.name, value: s.requests }))} />
            )}
          </Panel>
        </div>
      </div>

      <Panel className="mt-6" title="حصص التوليد" description="حدود الاستخدام اليومية — تُصفَّر منتصف الليل بتوقيت UTC" icon={Gauge} bodyClassName="p-5">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <Slider
              label="عمليات التوليد اليومية لكل طالب"
              value={L.dailyQuota}
              onChange={set("dailyQuota")}
              min={0}
              max={100}
              format={(v) => (v === 0 ? "∞" : `${v}`)}
              hint="0 = بلا حد. حصة خاصة لحساب معيّن من صفحة المستخدمين."
              disabled={!canManage}
            />
            <Slider label="أقصى عدد أسئلة في الطلب الواحد" value={L.perRequestMax} onChange={set("perRequestMax")} min={1} max={20} format={(v) => `${v}`} disabled={!canManage} />
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-navy-900">حصص أدوار الفريق</p>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {data.roleQuotas.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-[13px] text-ink">{r.name}</span>
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label={`حصة ${r.name}`}
                      type="number"
                      min={0}
                      value={roleQuotas[r.id] ?? ""}
                      onChange={(e) => setRoleQuotas((q) => ({ ...q, [r.id]: e.target.value }))}
                      placeholder="∞"
                      disabled={!canManage}
                      className="tabular h-9 w-24 text-center"
                      dir="ltr"
                    />
                    <span className="text-xs text-muted">يومياً</span>
                  </div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-subtle">فارغ = بلا حد.</p>
          </div>
        </div>
      </Panel>
    </>
  );
}
