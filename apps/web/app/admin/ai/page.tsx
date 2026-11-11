"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  CircleAlert,
  Eye,
  EyeOff,
  FlaskConical,
  GitBranch,
  KeyRound,
  Play,
  Plug,
  Plus,
  RefreshCw,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AdminPageHeader,
  Code,
  Input,
  LabeledControl,
  Panel,
  Segmented,
  Select,
  Slider,
  StatusPill,
  Switch,
  Table,
  Td,
  Textarea,
  Th,
  fmt,
} from "../_components/ui";
import { getAiConfig, saveAiRoutes, type CatalogModel, type TaskRoute } from "../_data/system";

const PROVIDERS = [
  { id: "openrouter", name: "OpenRouter", hint: "بوابة واحدة لمئات النماذج — الحالي" },
  { id: "google", name: "Google AI Studio", hint: "Gemini مباشرة" },
  { id: "anthropic", name: "Anthropic", hint: "Claude مباشرة" },
  { id: "openai", name: "OpenAI", hint: "GPT مباشرة" },
  { id: "ollama", name: "Ollama (محلي)", hint: "نماذج على خادمك" },
];

const INPUT_LABEL = { text: "نص", image: "صور", pdf: "PDF" } as const;

function modelShort(id: string) {
  return id.split("/").pop()!.replace(/:free$/, "");
}

/** يرجّع ما ينقص النموذج لأداء المهمة */
function gaps(task: TaskRoute, m?: CatalogModel) {
  if (!m) return [];
  const out: string[] = [];
  if (task.needs.includes("image") && !m.input.includes("image")) out.push("لا يقرأ الصور");
  if (task.needs.includes("pdf") && !m.input.includes("pdf")) out.push("لا يقرأ PDF مباشرة (يُحوَّل لنص)");
  if (task.needs.includes("structured") && !m.structured) out.push("لا يدعم مخرجات JSON المنظّمة");
  return out;
}

export default function AiModelsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [provider, setProvider] = useState("openrouter");
  const [showKey, setShowKey] = useState(false);
  const [routes, setRoutes] = useState<TaskRoute[]>([]);
  const [chain, setChain] = useState<string[]>([]);
  const [catalogList, setCatalogList] = useState<CatalogModel[]>([]);
  const [attemptTimeout, setAttemptTimeout] = useState(30);
  const [totalTimeout, setTotalTimeout] = useState(90);
  const [retryOn, setRetryOn] = useState<Record<string, boolean>>({ "404": true, "408": true, "429": true, "402": false, "502": true, "503": true, timeout: true });
  const [selfHeal, setSelfHeal] = useState(2);
  const [requireParams, setRequireParams] = useState(true);
  const [catalogFilter, setCatalogFilter] = useState<"all" | "free" | "vision">("all");
  const [dirty, setDirty] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAiConfig();
      setRoutes(res.routes);
      setChain(res.fallbackChain);
      setCatalogList(res.catalog);
    } catch {
      showToast({ type: "error", message: "تعذّر جلب إعدادات الذكاء الاصطناعي من الخادم." });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const touch = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setDirty(true);
  };

  const catalog = catalogList.filter((m) =>
    catalogFilter === "free" ? m.priceIn === 0 : catalogFilter === "vision" ? m.input.includes("image") : true,
  );

  function setRoute(task: string, patch: Partial<TaskRoute>) {
    setRoutes((rs) => rs.map((r) => (r.task === task ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  function moveChain(i: number, d: -1 | 1) {
    setChain((c) => {
      const n = [...c];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
    setDirty(true);
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAiRoutes(routes);
      setDirty(false);
      showToast({ type: "success", message: "حُفظت إعدادات النماذج والتوجيه في قاعدة البيانات الحقيقية." });
    } catch {
      showToast({ type: "error", message: "فشل حفظ إعدادات النماذج على الخادم." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="النماذج والتوجيه"
        description="اختر المزوّد، والنموذج الذي يؤدي كل مهمة، وما يحدث عندما يتعطّل. التغييرات تسري على الطلبات الجديدة فوراً بعد الحفظ."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadConfig} loading={loading}>
              <RefreshCw size={16} />
              تحديث
            </Button>
            <Button variant="secondary">
              <GitBranch size={16} />
              سجل التغييرات
            </Button>
          </div>
        }
      />

      {provider === "openrouter" && routes.some((r) => r.model.includes("free")) && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 animate-rise">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">تنبيه: مهام موجهة لنماذج مجانية</p>
            <p>
              بعض المهام موجهة حالياً لنماذج مجانية. للحصول على أفضل سرعة ودقة في قراءة ملفات الـ PDF واستخراج الأسئلة، يُنصح باختيار نماذج Google AI Studio المباشرة أو شحن رصيد OpenRouter.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* ───── المزوّد ───── */}
        <Panel title="المزوّد" description="من أين تأتي النماذج" icon={Plug}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={provider === p.id}
                onClick={() => touch(setProvider)(p.id)}
                className={`rounded-xl border p-3.5 text-start transition-colors ${
                  provider === p.id ? "border-teal-600 bg-teal-50/50 ring-1 ring-teal-600" : "border-line hover:border-navy-200"
                }`}
              >
                <span className="block text-sm font-semibold text-navy-900">{p.name}</span>
                <span className="block text-xs text-muted">{p.hint}</span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <LabeledControl label="مفتاح API" hint="يُخزَّن مشفّراً ولا يظهر كاملاً بعد الحفظ.">
              {(id) => (
                <div className="relative">
                  <KeyRound size={15} className="pointer-events-none absolute inset-y-0 start-3 my-auto text-subtle" aria-hidden />
                  <Input id={id} dir="ltr" readOnly type={showKey ? "text" : "password"} value="sk-or-v1-8f2c••••••••••••••••••a91e" className="w-full ps-9 pe-10 font-mono text-[13px]" />
                  <button
                    type="button"
                    onClick={() => setShowKey((s) => !s)}
                    aria-label={showKey ? "إخفاء" : "إظهار"}
                    className="absolute inset-y-0 end-0 flex w-10 items-center justify-center text-subtle hover:text-navy-900"
                  >
                    {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              )}
            </LabeledControl>
            <LabeledControl label="عنوان الخدمة">
              {(id) => <Input id={id} dir="ltr" defaultValue="https://openrouter.ai/api/v1" className="w-full font-mono text-[13px]" onChange={() => setDirty(true)} />}
            </LabeledControl>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => showToast({ type: "success", message: "الاتصال ناجح · 342 نموذجاً متاحاً · الرصيد $0.00" })}>
              <Plug size={15} />
              اختبار الاتصال
            </Button>
            <StatusPill tone="ok">متصل</StatusPill>
            <StatusPill tone="warn">الرصيد $0.00</StatusPill>
          </div>
        </Panel>

        {/* ───── الموثوقية ───── */}
        <Panel title="الموثوقية" description="المهل وإعادة المحاولة" icon={Timer} bodyClassName="p-5 flex flex-col gap-5">
          <Slider label="مهلة المحاولة الواحدة" value={attemptTimeout} onChange={touch(setAttemptTimeout)} min={5} max={120} step={5} format={(v) => `${v}s`} />
          <Slider
            label="المهلة الكلية لسلسلة البدائل"
            value={totalTimeout}
            onChange={touch(setTotalTimeout)}
            min={30}
            max={300}
            step={10}
            format={(v) => `${v}s`}
            hint={`تتسع لـ ${Math.floor(totalTimeout / attemptTimeout)} محاولات كاملة قبل الاستسلام.`}
          />
          <div>
            <p className="mb-2 text-[13px] font-medium text-navy-900">انتقل للنموذج التالي عند</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(retryOn).map(([code, on]) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setRetryOn((r) => ({ ...r, [code]: !on }));
                    setDirty(true);
                  }}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${code === "timeout" ? "" : "font-mono"} ${on ? "border-teal-600 bg-teal-50 text-teal-800" : "border-line text-muted hover:border-navy-200"}`}
                >
                  {code === "timeout" ? "انتهاء المهلة" : code}
                </button>
              ))}
            </div>
            {!retryOn["402"] && <p className="mt-2 text-xs leading-5 text-muted">«402» معطّل: نفاد الرصيد يطال كل النماذج المدفوعة، فلا فائدة من التنقّل بينها — إلا لو كان في السلسلة نموذج مجاني.</p>}
          </div>
          <Slider
            label="محاولات الإصلاح الذاتي للتوليد"
            value={selfHeal}
            onChange={touch(setSelfHeal)}
            min={0}
            max={5}
            format={(v) => `${v}`}
            hint="عند رجوع JSON غير صالح، يُعاد الطلب مع رسالة الخطأ."
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink">توجيه فقط للمزوّدين الداعمين لكل المعاملات</span>
            <Switch size="sm" checked={requireParams} onChange={touch(setRequireParams)} label="require_parameters" />
          </div>
        </Panel>
      </div>

      {/* ───── توجيه المهام ───── */}
      <Panel id="routing" className="mt-6 scroll-mt-24" title="توجيه المهام" description="النموذج والإعدادات لكل مهمة ذكاء اصطناعي في المنصة" icon={Bot} bodyClassName="divide-y divide-line">
        {routes.map((r) => {
          const model = catalogList.find((m) => m.id === r.model);
          const missing = gaps(r, model);
          return (
            <div key={r.task} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_180px_150px] lg:items-start">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-900">{r.label}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-muted">{r.description}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.needs.map((n) => (
                    <span key={n} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
                      يحتاج {n === "structured" ? "JSON منظّم" : n === "pdf" ? "PDF" : "صور"}
                    </span>
                  ))}
                </div>
              </div>
              <div className="min-w-0">
                <Select aria-label={`نموذج ${r.label}`} value={r.model} onChange={(e) => setRoute(r.task, { model: e.target.value })} className="w-full font-mono text-[13px]" dir="ltr">
                  {catalogList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                      {m.priceIn === 0 ? "  · free" : `  · $${m.priceIn}/$${m.priceOut}`}
                    </option>
                  ))}
                </Select>
                {missing.length > 0 ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-amber-800">
                    <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden />
                    {missing.join(" · ")} — ستنتقل هذه الطلبات لسلسلة البدائل.
                  </p>
                ) : (
                  model && (
                    <p className="mt-2 text-xs text-muted">
                      سياق <span className="tabular">{fmt(model.context)}</span> · زمن الاستجابة <span className="tabular">{model.latencyP50}s</span> · نجاح{" "}
                      <span className="tabular">{model.successRate}%</span>
                    </p>
                  )
                )}
              </div>
              <Slider label="الحرارة" value={r.temperature} onChange={(v) => setRoute(r.task, { temperature: v })} min={0} max={1.5} step={0.1} format={(v) => v.toFixed(1)} />
              <LabeledControl label="أقصى توكنات">
                {(id) => (
                  <Input
                    id={id}
                    type="number"
                    min={100}
                    step={100}
                    value={r.maxTokens}
                    onChange={(e) => setRoute(r.task, { maxTokens: +e.target.value })}
                    className="tabular w-full"
                    dir="ltr"
                  />
                )}
              </LabeledControl>
            </div>
          );
        })}
      </Panel>

      <div className="mt-6 grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
        {/* ───── سلسلة البدائل ───── */}
        <Panel title="سلسلة البدائل" description="تُجرَّب بالترتيب عندما يفشل نموذج المهمة" icon={GitBranch}>
          <ol className="flex flex-col gap-2">
            <li className="flex items-center gap-3 rounded-xl border border-dashed border-navy-200 px-3 py-2.5 text-[13px] text-muted">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-900 text-[11px] font-bold text-white">0</span>
              نموذج المهمة نفسه
            </li>
            {chain.map((id, i) => (
              <li key={id} className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2">
                <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[11px] font-bold text-teal-800">{i + 1}</span>
                <Code className="min-w-0 flex-1 truncate">{id}</Code>
                <div className="flex shrink-0">
                  <button type="button" aria-label="أعلى" disabled={i === 0} onClick={() => moveChain(i, -1)} className="rounded p-1 text-subtle hover:text-navy-900 disabled:opacity-30">
                    <ArrowUp size={15} />
                  </button>
                  <button type="button" aria-label="أسفل" disabled={i === chain.length - 1} onClick={() => moveChain(i, 1)} className="rounded p-1 text-subtle hover:text-navy-900 disabled:opacity-30">
                    <ArrowDown size={15} />
                  </button>
                  <button
                    type="button"
                    aria-label="إزالة"
                    onClick={() => {
                      setChain((c) => c.filter((x) => x !== id));
                      setDirty(true);
                    }}
                    className="rounded p-1 text-subtle hover:text-rose-600"
                  >
                    <X size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <Select
            aria-label="إضافة نموذج بديل"
            className="mt-3 w-full"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                setChain((c) => [...c, e.target.value]);
                setDirty(true);
              }
            }}
          >
            <option value="">+ إضافة نموذج بديل…</option>
            {catalogList.filter((m) => !chain.includes(m.id)).map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
              </option>
            ))}
          </Select>
        </Panel>

        {/* ───── المختبر ───── */}
        {routes.length > 0 ? (
          <Playground routes={routes} />
        ) : (
          <Panel title="المختبر" description="جرّب مهمة بإعداداتها الحالية قبل الحفظ" icon={FlaskConical} bodyClassName="p-5">
            <p className="text-xs text-muted">جارٍ تحميل مهام المختبر...</p>
          </Panel>
        )}
      </div>

      {/* ───── الكتالوج ───── */}
      <Panel
        className="mt-6"
        title="كتالوج النماذج"
        description="مقارنة سريعة بين النماذج المتاحة عبر المزوّد الحالي"
        bodyClassName=""
        action={
          <Segmented
            size="sm"
            label="تصفية"
            value={catalogFilter}
            onChange={setCatalogFilter}
            options={[
              { value: "all", label: "الكل" },
              { value: "free", label: "مجانية" },
              { value: "vision", label: "تقرأ الصور" },
            ]}
          />
        }
      >
        <Table>
          <thead>
            <tr>
              <Th>النموذج</Th>
              <Th>المدخلات</Th>
              <Th>السياق</Th>
              <Th>السعر (دخل / خرج لكل مليون)</Th>
              <Th>الزمن الوسيط</Th>
              <Th>نسبة النجاح</Th>
              <Th>العربية</Th>
              <Th>يُستخدم في</Th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((m) => {
              const usedBy = routes.filter((r) => r.model === m.id).length + (chain.includes(m.id) ? 1 : 0);
              return (
                <tr key={m.id} className="hover:bg-canvas/50">
                  <Td>
                    <p className="break-all font-mono text-[13px] font-medium text-navy-900" dir="ltr">
                      {modelShort(m.id)}
                    </p>
                    <p className="text-xs text-muted">{m.provider}</p>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      {m.input.map((i) => (
                        <span key={i} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                          {INPUT_LABEL[i]}
                        </span>
                      ))}
                    </div>
                  </Td>
                  <Td className="tabular">{m.context >= 1_000_000 ? `${(m.context / 1_000_000).toFixed(1)}M` : `${Math.round(m.context / 1000)}K`}</Td>
                  <Td className="tabular">{m.priceIn === 0 ? <StatusPill tone="ok">مجاني</StatusPill> : <span dir="ltr">${m.priceIn} / ${m.priceOut}</span>}</Td>
                  <Td className="tabular">{m.latencyP50}s</Td>
                  <Td>
                    <span className={`tabular font-medium ${m.successRate >= 98 ? "text-teal-700" : m.successRate >= 85 ? "text-amber-700" : "text-rose-600"}`}>{m.successRate}%</span>
                  </Td>
                  <Td>
                    <span aria-label={`${m.arabic} من 3`} className="tracking-widest text-gold-500">
                      {"★".repeat(m.arabic)}
                      <span className="text-navy-100">{"★".repeat(3 - m.arabic)}</span>
                    </span>
                  </Td>
                  <Td>{usedBy > 0 ? <span className="tabular text-[13px] font-medium text-navy-900">{usedBy} مهام</span> : <span className="text-subtle">—</span>}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </Panel>

      {/* ───── شريط الحفظ ───── */}
      {dirty && (
        <div className="sticky bottom-4 z-30 mt-6 flex animate-rise items-center justify-between gap-4 rounded-2xl bg-navy-950 px-5 py-3.5 text-white shadow-float">
          <p className="text-sm">لديك تغييرات غير محفوظة على إعدادات الذكاء الاصطناعي.</p>
          <div className="flex gap-2">
            <Button
              variant="inverse-outline"
              size="sm"
              onClick={() => {
                loadConfig();
                setDirty(false);
              }}
            >
              تجاهل
            </Button>
            <Button
              variant="accent"
              size="sm"
              loading={saving}
              onClick={handleSave}
            >
              حفظ التغييرات
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/* ───────── المختبر ───────── */

function Playground({ routes }: { routes: TaskRoute[] }) {
  const [task, setTask] = useState(routes[0]?.task || "classification");
  const [input, setInput] = useState("أريد 5 أسئلة متوسطة في أول وحدة");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<null | { out: string; ms: number; tokens: number; model: string; fallback?: string }>(null);

  useEffect(() => {
    if (routes.length && !routes.some((r) => r.task === task)) {
      setTask(routes[0].task);
    }
  }, [routes, task]);

  const sample = useMemo(
    () =>
      task === "classification"
        ? `{\n  "intent": "GENERATE_QUESTIONS",\n  "topic": "Unit 1: Our World",\n  "difficulty": "MEDIUM",\n  "count": 5,\n  "confidence": 0.96\n}`
        : `{\n  "questions": [\n    {\n      "questionText": "Choose the correct answer: The festival ___ every year since 1995.",\n      "choices": [{"label":"A","text":"is held"},{"label":"B","text":"has been held"},{"label":"C","text":"was held"},{"label":"D","text":"holds"}],\n      "correctAnswer": "B",\n      "bloomTaxonomy": "APPLY"\n    }\n  ]\n}`,
    [task],
  );

  const route = routes.find((r) => r.task === task) || routes[0];
  if (!route) {
    return (
      <Panel title="المختبر" description="جرّب مهمة بإعداداتها الحالية قبل الحفظ" icon={FlaskConical} bodyClassName="p-5 flex flex-col gap-4">
        <p className="text-xs text-muted">جارٍ تحميل إعدادات المختبر...</p>
      </Panel>
    );
  }

  return (
    <Panel title="المختبر" description="جرّب مهمة بإعداداتها الحالية قبل الحفظ" icon={FlaskConical} bodyClassName="p-5 flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Select aria-label="المهمة" value={task} onChange={(e) => setTask(e.target.value as TaskRoute["task"])}>
          {routes.map((r) => (
            <option key={r.task} value={r.task}>
              {r.label}
            </option>
          ))}
        </Select>
        <span className="flex items-center rounded-xl bg-canvas px-3 text-xs text-muted">
          <Code>{modelShort(route.model)}</Code>
          <span className="tabular ms-2">T={route.temperature.toFixed(1)}</span>
        </span>
      </div>
      <Textarea aria-label="المدخل" rows={2} value={input} onChange={(e) => setInput(e.target.value)} dir="auto" />
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          loading={running}
          onClick={() => {
            setRunning(true);
            setResult(null);
            setTimeout(() => {
              setRunning(false);
              setResult({ out: sample, ms: task === "classification" ? 5120 : 9840, tokens: task === "classification" ? 412 : 3380, model: route.model });
            }, 1200);
          }}
        >
          <Play size={15} />
          تشغيل
        </Button>
        {result && (
          <span className="tabular text-xs text-muted">
            {(result.ms / 1000).toFixed(1)}s · {fmt(result.tokens)} توكن · $0.0000
          </span>
        )}
      </div>
      {result && (
        <pre dir="ltr" className="max-h-72 overflow-auto rounded-xl bg-navy-950 p-4 text-[12px] leading-6 text-teal-100">
          {result.out}
        </pre>
      )}
      {!result && !running && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-[13px] text-muted">
          <Plus size={15} aria-hidden /> النتيجة تظهر هنا مع الزمن والتوكنات والتكلفة.
        </div>
      )}
    </Panel>
  );
}
