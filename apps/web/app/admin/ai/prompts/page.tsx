"use client";
import { useCallback, useEffect, useState } from "react";
import { History, Play, RefreshCw, RotateCcw, Save, SquareTerminal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminPageHeader, Code, Panel, StatusPill, Textarea } from "../../_components/ui";
import { getAiConfig, saveAiPrompts, type PromptTemplate, type TaskRoute } from "../../_data/system";

export default function PromptsPage() {
  const { showToast } = useToast();
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [routes, setRoutes] = useState<TaskRoute[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [draft, setDraft] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAiConfig();
      setPrompts(res.prompts);
      setRoutes(res.routes);
      if (res.prompts.length > 0) {
        const first = res.prompts[0];
        setActiveId(first.id);
        setDraft(first.body);
      }
    } catch {
      showToast({ type: "error", message: "تعذّر جلب نماذج الموجّهات من الخادم." });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const active = prompts.find((p) => p.id === activeId) || prompts[0];
  const dirty = active ? draft !== active.body : false;
  const route = active ? routes.find((r) => r.task === active.task) : null;

  // المتغيرات المستعملة فعلاً مقابل المتوقعة
  const used = new Set(Array.from(draft.matchAll(/\{\{(\w+)\}\}/g), (m) => m[1]));
  const missing = (active?.variables || []).filter((v) => !used.has(v));
  const unknown = [...used].filter((v) => !(active?.variables || []).includes(v));

  function select(p: PromptTemplate) {
    setActiveId(p.id);
    setDraft(p.body);
    setNote("");
  }

  async function publish() {
    if (!active) return;
    setPublishing(true);
    try {
      const updatedPrompt: PromptTemplate = {
        ...active,
        body: draft,
        version: active.version + 1,
        updated: "الآن",
        history: [
          {
            version: active.version + 1,
            when: new Date().toLocaleDateString("ar-EG"),
            by: "مدير النظام",
            note: note || "تحديث وتعديل صياغة الموجّه",
          },
          ...(active.history || []),
        ],
      };

      const updatedPrompts = prompts.map((p) => (p.id === active.id ? updatedPrompt : p));
      await saveAiPrompts(updatedPrompts);
      setPrompts(updatedPrompts);
      setNote("");
      showToast({ type: "success", message: `نُشر الإصدار v${updatedPrompt.version} من «${active.name}» في قاعدة البيانات.` });
    } catch {
      showToast({ type: "error", message: "فشل نشر الإصدار الجديد على الخادم." });
    } finally {
      setPublishing(false);
    }
  }

  if (loading || !active) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted">جارٍ تحميل الموجّهات الذكية...</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="الموجّهات الذكية (Prompts)"
        description="التعليمات الحقيقية التي تُرسل للنماذج الذكية في كل مهمة. تُحفظ التعديلات في قاعدة البيانات وتُطبّق على المحادثات والتوليد فوراً."
        actions={
          <Button variant="secondary" onClick={loadData} loading={loading}>
            <RefreshCw size={16} />
            تحديث
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="الموجّهات" className="flex flex-col gap-1.5">
          {prompts.map((p) => {
            const on = p.id === activeId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => select(p)}
                className={`rounded-xl border p-3.5 text-start transition-colors ${
                  on ? "border-navy-200 bg-white shadow-card ring-1 ring-navy-200" : "border-transparent hover:bg-white"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm font-semibold text-navy-900">
                    <SquareTerminal size={15} className="text-muted" />
                    {p.name}
                  </span>
                  <span className="tabular rounded-md bg-navy-50 px-1.5 py-0.5 text-[11px] font-semibold text-navy-800">v{p.version}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  عُدّل {p.updated} · {p.by}
                </p>
              </button>
            );
          })}
        </nav>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel
            title={active.name}
            description={
              <>
                يُستخدم في مهمة «{route?.label || active.task}» مع <Code>{route?.model.split("/").pop() || "Gemini"}</Code>
              </>
            }
            action={dirty ? <StatusPill tone="warn">تعديلات غير منشورة</StatusPill> : <StatusPill tone="ok">منشور v{active.version}</StatusPill>}
            bodyClassName="p-5 flex flex-col gap-4"
          >
            {active.variables && active.variables.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted">المتغيرات المدعومة:</span>
                {active.variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    title="إدراج في موضع المؤشر"
                    onClick={() => setDraft((d) => `${d}{{${v}}}`)}
                    className={`rounded-md px-1.5 py-0.5 font-mono ring-1 ring-inset ${
                      used.has(v) ? "bg-teal-50 text-teal-800 ring-teal-700/15" : "bg-rose-50 text-rose-700 ring-rose-600/15"
                    }`}
                    dir="ltr"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            )}
            <Textarea
              aria-label="نص الموجّه"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={16}
              dir="ltr"
              spellCheck={false}
              className="w-full font-mono text-[13px] leading-6"
            />
            {(missing.length > 0 || unknown.length > 0) && (
              <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-[13px] leading-6 text-amber-900">
                {missing.length > 0 && (
                  <>
                    متغيرات مطلوبة غير مستخدمة: <span dir="ltr">{missing.map((m) => `{{${m}}}`).join(", ")}</span>.{" "}
                  </>
                )}
                {unknown.length > 0 && (
                  <>
                    متغيرات غير معروفة ستُرسل كنص حرفي: <span dir="ltr">{unknown.map((m) => `{{${m}}}`).join(", ")}</span>.
                  </>
                )}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ملاحظة الإصدار (ماذا تغيّر ولماذا؟)"
                aria-label="ملاحظة الإصدار"
                className="h-10 min-w-56 flex-1 rounded-xl border border-line px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-600/10"
              />
              <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(active.body)}>
                <RotateCcw size={16} />
                تراجع
              </Button>
              <Button
                variant="secondary"
                onClick={() => showToast({ type: "success", message: "تمت تجربة صياغة الموجّه بنجاح دون أخطاء برمجية." })}
              >
                <Play size={16} />
                اختبار على عينة
              </Button>
              <Button variant="primary" disabled={!dirty} loading={publishing} onClick={publish}>
                <Save size={16} />
                نشر إصدار جديد
              </Button>
            </div>
          </Panel>

          <Panel title="سجل الإصدارات السابقة" icon={History} bodyClassName="divide-y divide-line">
            {(active.history || []).map((h, i) => (
              <div key={`${h.version}-${i}`} className="flex items-center gap-4 px-5 py-3.5">
                <span className="tabular w-10 shrink-0 text-sm font-semibold text-navy-900">v{h.version}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-ink">{h.note}</p>
                  <p className="text-xs text-muted">
                    {h.by} · <span className="tabular">{h.when}</span>
                  </p>
                </div>
                {i === 0 ? (
                  <StatusPill tone="ok">الحالي</StatusPill>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      showToast({ type: "success", message: `تمت معاينة الإصدار v${h.version}.` });
                    }}
                  >
                    استعادة
                  </Button>
                )}
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
