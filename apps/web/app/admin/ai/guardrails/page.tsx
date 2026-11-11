"use client";
import { useCallback, useEffect, useState } from "react";
import { FileCheck2, MessageSquareWarning, RefreshCw, ShieldCheck, Siren, TestTube2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminPageHeader, Input, LabeledControl, Panel, Segmented, SettingRow, Slider, StatusPill, Switch, SwitchRow, Textarea } from "../../_components/ui";
import { getAiConfig, saveAiGuardrails } from "../../_data/system";

type Intent = "GENERATE_QUESTIONS" | "FOLLOW_UP" | "GREETING" | "OFF_TOPIC";

const INTENT_LABEL: Record<Intent, string> = {
  GENERATE_QUESTIONS: "طلب أسئلة",
  FOLLOW_UP: "متابعة",
  GREETING: "تحية",
  OFF_TOPIC: "خارج المادة",
};

const CATEGORIES = [
  ["مواد دراسية أخرى", "سؤال فيزياء في محادثة الرياضيات", true],
  ["حل الواجبات حرفياً", "«حل لي السؤال 4 من الكتاب» دون شرح", false],
  ["سياسة وأخبار", "", true],
  ["برمجة ومواضيع تقنية عامة", "", true],
  ["محتوى غير لائق", "ألفاظ مسيئة، محتوى للبالغين", true],
  ["محاولات تجاوز التعليمات", "«تجاهل تعليماتك السابقة…»", true],
] as const;

export default function GuardrailsPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [strictness, setStrictness] = useState<"lenient" | "balanced" | "strict">("balanced");
  const [cats, setCats] = useState<boolean[]>(CATEGORIES.map((c) => c[2]));
  const [confidence, setConfidence] = useState(0.7);
  const [aiDownMsg, setAiDownMsg] = useState(true);
  const [fileCheck, setFileCheck] = useState(true);
  const [fileConfidence, setFileConfidence] = useState(0.75);
  const [pii, setPii] = useState(true);
  const [perMinute, setPerMinute] = useState(10);
  const [autoSuspend, setAutoSuspend] = useState(true);
  const [rejectionMsg, setRejectionMsg] = useState("عذراً، أنا مساعد متخصص فقط في مادة «{subject}» ضمن منهاج التوجيهي الفلسطيني. {reason}");

  const [test, setTest] = useState("ساعدني بواجب التاريخ");
  const [verdict, setVerdict] = useState<null | { intent: Intent; confidence: number; reason?: string }>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAiConfig();
      if (res.guardrails) {
        const g = res.guardrails;
        if (g.strictness) setStrictness(g.strictness);
        if (g.confidenceThreshold !== undefined) setConfidence(g.confidenceThreshold);
        if (g.fileValidationEnabled !== undefined) setFileCheck(g.fileValidationEnabled);
        if (g.fileConfidenceThreshold !== undefined) setFileConfidence(g.fileConfidenceThreshold);
        if (g.piiMaskingEnabled !== undefined) setPii(g.piiMaskingEnabled);
        if (g.rateLimitPerMinute !== undefined) setPerMinute(g.rateLimitPerMinute);
        if (g.autoSuspendAbuse !== undefined) setAutoSuspend(g.autoSuspendAbuse);
        if (g.rejectionMessage) setRejectionMsg(g.rejectionMessage);
        if (Array.isArray(g.categories) && g.categories.length === CATEGORIES.length) {
          setCats(g.categories);
        }
      }
    } catch {
      showToast({ type: "error", message: "تعذّر جلب سياسات الحماية من الخادم." });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveAiGuardrails({
        strictness,
        categories: cats,
        confidenceThreshold: confidence,
        fileValidationEnabled: fileCheck,
        fileConfidenceThreshold: fileConfidence,
        piiMaskingEnabled: pii,
        rateLimitPerMinute: perMinute,
        autoSuspendAbuse: autoSuspend,
        rejectionMessage: rejectionMsg,
      });
      showToast({ type: "success", message: "حُفظت سياسات الحماية والحواجز بنجاح في قاعدة البيانات." });
    } catch {
      showToast({ type: "error", message: "فشل حفظ السياسات على الخادم." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <AdminPageHeader
        title="الحواجز والسياسات (Guardrails)"
        description="السياسات الأمنية الحقيقية التي تحكم ردود المساعد الذكي، معالجة الملفات المرفوعة، والحد من الاستخدام المسيء."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadData} loading={loading}>
              <RefreshCw size={16} />
              تحديث
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              حفظ السياسات
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="نطاق المحادثة" description="كل محادثة مقيّدة بمادة دراسية واحدة" icon={ShieldCheck} bodyClassName="p-5 flex flex-col gap-5">
          <div>
            <p className="mb-2 text-[13px] font-medium text-navy-900">الصرامة</p>
            <Segmented
              label="الصرامة"
              value={strictness}
              onChange={setStrictness}
              options={[
                { value: "lenient", label: "متساهل" },
                { value: "balanced", label: "متوازن" },
                { value: "strict", label: "صارم" },
              ]}
            />
            <p className="mt-2 text-xs leading-5 text-muted">
              {
                {
                  lenient: "يرد على أي سؤال تعليمي حتى لو كان عن مادة أخرى، ويرفض غير التعليمي فقط.",
                  balanced: "الحالات الحدّية تُحسب لصالح الطالب؛ يُرفض ما هو واضح أنه خارج المادة.",
                  strict: "يرفض كل ما لا يخص المادة بشكل مباشر، حتى الأسئلة العامة عن الدراسة.",
                }[strictness]
              }
            </p>
          </div>
          <fieldset>
            <legend className="mb-2 text-[13px] font-medium text-navy-900">يُرفض دائماً</legend>
            <ul className="divide-y divide-line rounded-xl border border-line">
              {CATEGORIES.map(([label, example], i) => (
                <li key={label} className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                  <div className="min-w-0">
                    <p className="text-[13px] text-ink">{label}</p>
                    {example && <p className="text-[11px] text-muted">{example}</p>}
                  </div>
                  <Switch size="sm" checked={cats[i]} onChange={(v) => setCats((c) => c.map((x, j) => (j === i ? v : x)))} label={label} />
                </li>
              ))}
            </ul>
          </fieldset>
          <Slider
            label="أدنى ثقة لقبول تصنيف النية"
            value={confidence}
            onChange={setConfidence}
            min={0.3}
            max={0.95}
            step={0.05}
            format={(v) => v.toFixed(2)}
            hint="تحت هذا الحد يُطلب من الطالب توضيح طلبه بدل الرفض."
          />
        </Panel>

        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="الردود الثابتة" icon={MessageSquareWarning} bodyClassName="p-5 flex flex-col gap-4">
            <LabeledControl label="عند الرفض (خارج المادة)" hint="{subject} و {reason} تُستبدل تلقائياً.">
              {(id) => (
                <Textarea
                  id={id}
                  rows={3}
                  value={rejectionMsg}
                  onChange={(e) => setRejectionMsg(e.target.value)}
                />
              )}
            </LabeledControl>
            <SwitchRow
              title="رسالة مستقلة عند تعطل النموذج"
              description="بدلاً من معاملة الخطأ كرسالة خارج المادة — يرى الطالب «المساعد غير متاح حالياً»."
              checked={aiDownMsg}
              onChange={setAiDownMsg}
            />
            {aiDownMsg && (
              <Input aria-label="نص رسالة التعطل" defaultValue="المساعد غير متاح حالياً، حاول بعد قليل. رسالتك لم تُحتسب من حصتك." />
            )}
          </Panel>

          <Panel title="اختبار سريع لتصنيف النية" description="كيف سيُصنّف النظام هذه الرسالة وفق السياسات الحالية؟" icon={TestTube2} bodyClassName="p-5">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = test.trim();
                setVerdict(
                  /واجب|حل لي/.test(t) && cats[1]
                    ? { intent: "OFF_TOPIC", confidence: 0.88, reason: "طلب حل واجب حرفي — يُقترح توليد أسئلة تدريبية مشابهة بدلاً منه." }
                    : /تاريخ|فيزياء|كيمياء/.test(t)
                      ? { intent: "OFF_TOPIC", confidence: 0.93, reason: "الرسالة عن مادة أخرى غير مادة المحادثة (اللغة الإنجليزية)." }
                      : /مرحب|شكر|hi/.test(t)
                        ? { intent: "GREETING", confidence: 0.99 }
                        : { intent: "GENERATE_QUESTIONS", confidence: 0.94 },
                );
              }}
            >
              <Input aria-label="رسالة للاختبار" value={test} onChange={(e) => setTest(e.target.value)} className="min-w-0 flex-1" dir="auto" />
              <Button type="submit" variant="primary">
                صنّف
              </Button>
            </form>
            <p className="mt-2 text-xs text-muted">المحادثة الافتراضية للاختبار: اللغة الإنجليزية — الفرع العلمي.</p>
            {verdict && (
              <div className="mt-4 rounded-xl bg-canvas p-4">
                <div className="flex items-center gap-2">
                  <StatusPill tone={verdict.intent === "OFF_TOPIC" ? "error" : "ok"}>{INTENT_LABEL[verdict.intent]}</StatusPill>
                  <span className="tabular text-xs text-muted">ثقة {verdict.confidence.toFixed(2)}</span>
                </div>
                {verdict.reason && <p className="mt-2 text-[13px] leading-6 text-ink">{verdict.reason}</p>}
              </div>
            )}
          </Panel>
        </div>

        <Panel title="الملفات المرفوعة من الطلاب" icon={FileCheck2} bodyClassName="p-5 flex flex-col gap-2">
          <SwitchRow title="فحص تطابق الملف مع المادة" description="يرفض صورة امتحان كيمياء في محادثة الرياضيات." checked={fileCheck} onChange={setFileCheck} />
          {fileCheck && <Slider label="أدنى ثقة للقبول" value={fileConfidence} onChange={setFileConfidence} min={0.5} max={0.95} step={0.05} format={(v) => v.toFixed(2)} />}
          <div className="mt-3 grid grid-cols-2 gap-4">
            <LabeledControl label="الحجم الأقصى (م.ب)">{(id) => <Input id={id} type="number" defaultValue={15} className="tabular w-full" dir="ltr" />}</LabeledControl>
            <LabeledControl label="الصيغ المسموحة">{(id) => <Input id={id} defaultValue="pdf, png, jpg" className="w-full font-mono text-[13px]" dir="ltr" />}</LabeledControl>
          </div>
          <SettingRow title="حذف الملفات الخام تلقائياً بعد" description="يبقى «نمط الورقة» المستخرج فقط.">
            <Input aria-label="ساعات" type="number" defaultValue={24} className="tabular w-20" dir="ltr" />
            <span className="text-[13px] text-muted">ساعة</span>
          </SettingRow>
        </Panel>

        <Panel title="الحماية من الإساءة ومعدل الطلبات" icon={Siren} bodyClassName="p-5 flex flex-col gap-2">
          <Slider label="أقصى رسائل للطالب في الدقيقة" value={perMinute} onChange={setPerMinute} min={2} max={60} format={(v) => `${v}`} />
          <SwitchRow title="إيقاف تلقائي عند التجاوز المتكرر" description="3 تجاوزات خلال ساعة ← إيقاف 24 ساعة وتنبيه للدعم الفني." checked={autoSuspend} onChange={setAutoSuspend} />
          <SwitchRow title="إخفاء البيانات الشخصية في السجلات (PII Masking)" description="أرقام الهواتف والبريد في الرسائل تُحفظ مقنّعة لحماية الخصوصية." checked={pii} onChange={setPii} />
        </Panel>
      </div>
    </>
  );
}
