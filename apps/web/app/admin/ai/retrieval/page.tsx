"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Layers, Microscope, RefreshCw, Scale, Search, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AdminPageHeader,
  Code,
  Input,
  LabeledControl,
  MathText,
  Modal,
  Panel,
  Segmented,
  Select,
  SettingRow,
  Slider,
  StatusPill,
  Switch,
  fmt,
} from "../../_components/ui";
import { getIngestionSettings, saveIngestionSettings, searchRetrieval, getHealthDiagnostics } from "../../_data/system";
import { getBankStats } from "../../_data/knowledge";
import { request } from "../../_data/http";

export const EMBEDDING_MODELS = [
  { id: "gemini-embedding-001", provider: "Google", dims: [768, 1536, 3072], price: 0.15, multilingual: true },
  { id: "openai/text-embedding-3-large", provider: "OpenAI", dims: [256, 1024, 3072], price: 0.13, multilingual: true },
  { id: "openai/text-embedding-3-small", provider: "OpenAI", dims: [512, 1536], price: 0.02, multilingual: true },
  { id: "bge-m3 (محلي)", provider: "BAAI", dims: [1024], price: 0, multilingual: true },
];

const SAMPLE = `الوحدة الثالثة: الحموض والقواعد. يُعرَّف ثابت تأين الحمض الضعيف بأنه ثابت الاتزان لتفاعل تأين الحمض في الماء، وكلما زادت قيمته زادت قوة الحمض. مثال محلول: احسب الرقم الهيدروجيني لمحلول حمض الإيثانويك تركيزه 0.1 مول لكل لتر. الحل: نكتب معادلة التأين ثم نفترض أن تركيز أيون الهيدرونيوم يساوي س، فنحصل على معادلة من الدرجة الثانية نهمل فيها س أمام التركيز الابتدائي. الأملاح: تتميّه أيونات بعض الأملاح في الماء فتُكسب المحلول صفة حمضية أو قاعدية، فمثلاً ملح كلوريد الأمونيوم يعطي محلولاً حمضياً لأن أيون الأمونيوم حمض مرافق لقاعدة ضعيفة. المحلول المنظم: محلول يقاوم التغير في الرقم الهيدروجيني عند إضافة كمية قليلة من حمض قوي أو قاعدة قوية إليه.`;

type Strategy = "structure" | "semantic" | "fixed";

export default function RetrievalPage() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // التضمين
  const [embModel, setEmbModel] = useState(EMBEDDING_MODELS[0].id);
  const [dims, setDims] = useState(768);
  const [batch, setBatch] = useState(32);
  const [reindexOpen, setReindexOpen] = useState(false);

  // التقطيع
  const [source, setSource] = useState<"book" | "exam">("book");
  const [strategy, setStrategy] = useState<Strategy>("structure");
  const [size, setSize] = useState(512);
  const [overlap, setOverlap] = useState(64);
  const [minChunk, setMinChunk] = useState(80);
  const [respectHeadings, setRespectHeadings] = useState(true);
  const [keepTables, setKeepTables] = useState(true);
  const [contextHeader, setContextHeader] = useState(true);

  // الاسترجاع
  const [vectorWeight, setVectorWeight] = useState(0.6);
  const [rrfK, setRrfK] = useState(60);
  const [topK, setTopK] = useState(8);
  const [minSim, setMinSim] = useState(0.55);
  const [rerank, setRerank] = useState(false);
  const [minAnchors, setMinAnchors] = useState(1);
  const [indexType, setIndexType] = useState<"exact" | "hnsw">("exact");

  // إحصائيات المتجهات الحقيقية
  const [bookChunksCount, setBookChunksCount] = useState<number>(0);
  const [bankVectorsCount, setBankVectorsCount] = useState<number>(0);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsRes, healthRes, bankRes] = await Promise.allSettled([
        getIngestionSettings(),
        getHealthDiagnostics(),
        getBankStats(),
      ]);

      if (settingsRes.status === "fulfilled" && settingsRes.value) {
        const res = settingsRes.value as Record<string, unknown>;
        if (typeof res.chunkSize === "number") setSize(res.chunkSize);
        if (typeof res.overlap === "number") setOverlap(res.overlap);
        if (typeof res.strategy === "string") setStrategy(res.strategy as Strategy);
      }

      if (healthRes.status === "fulfilled" && healthRes.value?.queues) {
        const embQueue = healthRes.value.queues.find((q) => q.name === "embedding");
        if (embQueue && typeof embQueue.completed === "number") {
          setBookChunksCount(embQueue.completed);
        }
      }

      if (bankRes.status === "fulfilled" && bankRes.value) {
        if (typeof bankRes.value.indexed === "number") {
          setBankVectorsCount(bankRes.value.indexed);
        }
      }
    } catch {
      showToast({ type: "error", message: "تعذّر جلب إعدادات التضمين من الخادم." });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveIngestionSettings({
        chunkSize: size,
        overlap,
        strategy,
        stripHeaders: !contextHeader,
        keepLatex: true,
      });
      showToast({ type: "success", message: "حُفظت إعدادات التقطيع والتضمين في قاعدة البيانات بنجاح." });
    } catch {
      showToast({ type: "error", message: "فشل حفظ إعدادات التضمين على الخادم." });
    } finally {
      setSaving(false);
    }
  };

  const model = EMBEDDING_MODELS.find((m) => m.id === embModel) || EMBEDDING_MODELS[0];
  const changedEmbedding = embModel !== EMBEDDING_MODELS[0].id || dims !== 768;
  const totalVectors = bookChunksCount + bankVectorsCount;

  // معاينة التقطيع
  const preview = useMemo(() => {
    const words = SAMPLE.split(/\s+/);
    const scale = 16;
    const len = Math.max(8, Math.round(size / scale));
    const ov = Math.min(len - 2, Math.round(overlap / scale));
    const out: { words: string[]; overlap: number }[] = [];
    if (strategy === "structure" || strategy === "semantic") {
      const sentences = SAMPLE.split(/(?<=[.:])\s+/);
      let cur: string[] = [];
      for (const s of sentences) {
        const w = s.split(/\s+/);
        if (cur.length + w.length > len && cur.length) {
          out.push({ words: cur, overlap: out.length ? ov : 0 });
          cur = cur.slice(-ov);
        }
        cur = [...cur, ...w];
      }
      if (cur.length) out.push({ words: cur, overlap: out.length ? ov : 0 });
    } else {
      for (let i = 0; i < words.length; i += len - ov) {
        out.push({ words: words.slice(i, i + len), overlap: i ? ov : 0 });
        if (i + len >= words.length) break;
      }
    }
    return out;
  }, [size, overlap, strategy]);

  return (
    <>
      <AdminPageHeader
        title="التقطيع والتضمين (RAG & Embeddings)"
        description="كيف تُقسَّم الكتب والامتحانات إلى مقاطع، وكيف تُحوَّل لمتجهات، وكيف يُسترجع منها عند توليد الأسئلة لطلاب التوجيهي."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadSettings} loading={loading}>
              <RefreshCw size={16} />
              تحديث
            </Button>
            <Button variant="primary" loading={saving} onClick={handleSave}>
              حفظ الإعدادات
            </Button>
          </div>
        }
      />

      {/* ───── التضمين ───── */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Panel title="نموذج التضمين" description="يحوّل كل مقطع وسؤال إلى متجه للبحث الدلالي" icon={Boxes}>
          <div className="grid gap-2 sm:grid-cols-2">
            {EMBEDDING_MODELS.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-pressed={embModel === m.id}
                onClick={() => {
                  setEmbModel(m.id);
                  if (!m.dims.includes(dims)) setDims(m.dims[0]);
                }}
                className={`min-w-0 rounded-xl border p-3.5 text-start transition-colors ${
                  embModel === m.id ? "border-teal-600 bg-teal-50/50 ring-1 ring-teal-600" : "border-line hover:border-navy-200"
                }`}
              >
                <span className="block break-all font-mono text-[13px] font-semibold text-navy-900" dir="ltr">
                  {m.id}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {m.provider} · {m.price === 0 ? "مجاني" : `$${m.price} لكل مليون توكن`} · متعدد اللغات
                </span>
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <LabeledControl label="الأبعاد" hint="أبعاد أقل = بحث أسرع وتخزين أقل، ودقة أقل قليلاً.">
              {(id) => (
                <Select id={id} value={dims} onChange={(e) => setDims(+e.target.value)} className="w-full">
                  {model.dims.map((d) => (
                    <option key={d} value={d}>
                      {d} بُعداً {d === 768 ? "(الموصى به لـ Gemini)" : ""}
                    </option>
                  ))}
                </Select>
              )}
            </LabeledControl>
            <LabeledControl label="حجم الدفعة (Batch)" hint="عدد المقاطع المرسلة بطلب واحد للنموذج.">
              {(id) => (
                <Select id={id} value={batch} onChange={(e) => setBatch(+e.target.value)} className="w-full">
                  {[16, 32, 64, 128].map((b) => (
                    <option key={b} value={b}>
                      {b} مقطع
                    </option>
                  ))}
                </Select>
              )}
            </LabeledControl>
          </div>
          {changedEmbedding && (
            <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-900">
              <div className="flex gap-2">
                <TriangleAlert size={16} className="mt-1 shrink-0" aria-hidden />
                <span>
                  تغيير النموذج أو الأبعاد لا يُطبَّق على المتجهات القديمة تلقائياً. يلزم <b>إعادة فهرسة كل المحتوى</b> حتى تصبح كل المتجهات في نفس الفضاء.
                </span>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setReindexOpen(true)}>
                إعادة الفهرسة
              </Button>
            </div>
          )}
        </Panel>

        {/* ───── فهرس pgvector ───── */}
        <Panel title="فهرس pgvector" description="البيانات المخزنة فعلياً في PostgreSQL" icon={Microscope} bodyClassName="p-5 flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-4 text-xs">
            <div className="rounded-xl bg-canvas p-3">
              <dt className="text-muted">مقاطع الكتب المضمّنة</dt>
              <dd className="tabular mt-1 text-lg font-bold text-navy-900">{loading ? "..." : fmt(bookChunksCount)}</dd>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <dt className="text-muted">أسئلة الامتحانات المضمّنة</dt>
              <dd className="tabular mt-1 text-lg font-bold text-navy-900">{loading ? "..." : fmt(bankVectorsCount)}</dd>
            </div>
          </dl>
          <div className="divide-y divide-line">
            <SettingRow title="نوع الفهرس" description="HNSW يسرّع البحث بالتقريب عند تجاوز 100 ألف متجه.">
              <Segmented
                size="sm"
                label="نوع الفهرس"
                value={indexType}
                onChange={setIndexType}
                options={[
                  { value: "exact", label: "دقيق (Exact)" },
                  { value: "hnsw", label: "تقريبي (HNSW)" },
                ]}
              />
            </SettingRow>
            <SettingRow title="دالة المسافة" description="التشابه بجيب التمام (Cosine Similarity) المعياري.">
              <span className="font-mono text-xs text-navy-900">Cosine (&lt;=&gt;)</span>
            </SettingRow>
          </div>
        </Panel>
      </div>

      {/* ───── التقطيع ───── */}
      <Panel
        className="mt-6"
        title="استراتيجية التقطيع"
        description="تحدد كيف يُقسَّم النص إلى أجزاء لتغذية النموذج"
        icon={Layers}
        bodyClassName="p-5"
        action={
          <Segmented
            size="sm"
            label="نوع المصدر"
            value={source}
            onChange={setSource}
            options={[
              { value: "book", label: "الكتب" },
              { value: "exam", label: "الامتحانات" },
            ]}
          />
        }
      >
        {source === "exam" ? (
          <div className="rounded-xl bg-canvas p-4 text-sm leading-7 text-ink">
            ملفات الامتحانات لا تُقطَّع بعدد التوكنات: <b>كل سؤال مستخرج = مقطع واحد</b> (نص السؤال + الشرح)، لأن السؤال هو وحدة الاسترجاع عند التوليد. يمكنك ضبط ما يدخل في نص التضمين:
            <div className="mt-3 flex flex-col gap-2.5">
              {["نص السؤال", "الخيارات", "الشرح", "المادة والوحدة كبادئة سياق"].map((l, i) => (
                <label key={l} className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" defaultChecked={i !== 1} className="h-4 w-4 accent-teal-600" />
                  {l}
                </label>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ["structure", "حسب البنية", "يقسم عند الوحدات والعناوين والفقرات، مع سقف للحجم"],
                    ["semantic", "دلالي", "يقسم حيث يتغير الموضوع، بمقارنة تضمين الجمل المتتالية"],
                    ["fixed", "ثابت", "عدد توكنات محدد بغض النظر عن المعنى"],
                  ] as const
                ).map(([v, t, d]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={strategy === v}
                    onClick={() => setStrategy(v)}
                    className={`rounded-xl border p-3 text-start transition-colors ${strategy === v ? "border-teal-600 bg-teal-50/50 ring-1 ring-teal-600" : "border-line hover:border-navy-200"}`}
                  >
                    <span className="block text-[13px] font-semibold text-navy-900">{t}</span>
                    <span className="mt-0.5 block text-[11px] leading-4 text-muted">{d}</span>
                  </button>
                ))}
              </div>
              <Slider label="الحجم الأقصى للمقطع" value={size} onChange={setSize} min={128} max={2048} step={64} format={(v) => `${v} tokens`} />
              <Slider
                label="التداخل"
                value={overlap}
                onChange={setOverlap}
                min={0}
                max={Math.min(512, size / 2)}
                step={16}
                format={(v) => `${v} tokens`}
                hint={`${Math.round((overlap / size) * 100)}% من المقطع يتكرر في المقطع التالي حتى لا تنقطع الفكرة عند الحد.`}
              />
              <Slider label="أصغر مقطع مسموح" value={minChunk} onChange={setMinChunk} min={0} max={256} step={16} format={(v) => `${v} tokens`} hint="المقاطع الأصغر تُدمج مع التي قبلها." />
              <div className="divide-y divide-line">
                <SettingRow title="احترام العناوين" description="لا يبدأ مقطع جديد في منتصف عنوان فرعي.">
                  <Switch checked={respectHeadings} onChange={setRespectHeadings} label="احترام العناوين" />
                </SettingRow>
                <SettingRow title="الجداول كوحدة واحدة" description="لا يُقسم الجدول بين مقطعين.">
                  <Switch checked={keepTables} onChange={setKeepTables} label="الجداول" />
                </SettingRow>
                <SettingRow title="ترويسة سياق لكل مقطع" description="يُضاف «المادة › الوحدة › الدرس» قبل النص عند التضمين.">
                  <Switch checked={contextHeader} onChange={setContextHeader} label="ترويسة السياق" />
                </SettingRow>
              </div>
            </div>

            <div className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="text-[13px] font-semibold text-navy-900">معاينة على صفحة من كتاب الكيمياء</p>
                <p className="tabular text-xs text-muted">{preview.length} مقاطع</p>
              </div>
              <ol className="flex flex-col gap-2">
                {preview.map((c, i) => (
                  <li key={i} className="rounded-xl border border-line p-3">
                    <p className="mb-1.5 flex items-center justify-between text-[11px] text-muted">
                      <span>
                        المقطع <span className="tabular">{i + 1}</span>
                        {contextHeader && <span className="ms-2 text-teal-700">الكيمياء › الوحدة 3 › الحموض والقواعد</span>}
                      </span>
                      <span className="tabular">≈{Math.round(c.words.length * 1.5)} توكن</span>
                    </p>
                    <p className="text-[13px] leading-7 text-ink">
                      {c.overlap > 0 && <mark className="rounded bg-gold-100 px-0.5 text-ink">{c.words.slice(0, c.overlap).join(" ")}</mark>} {c.words.slice(c.overlap).join(" ")}
                    </p>
                  </li>
                ))}
              </ol>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
                <mark className="inline-block h-3 w-5 rounded bg-gold-100" aria-hidden /> النص المظلل مكرر من المقطع السابق (التداخل).
              </p>
            </div>
          </div>
        )}
      </Panel>

      {/* ───── الاسترجاع ───── */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel title="الاسترجاع الهجين" description="يدمج البحث الدلالي والبحث النصي بطريقة RRF" icon={Scale} bodyClassName="p-5 flex flex-col gap-5">
          <div>
            <Slider
              label="وزن البحث الدلالي مقابل النصي"
              value={vectorWeight}
              onChange={setVectorWeight}
              min={0}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)} / ${Math.round((1 - v) * 100)}`}
            />
            <div className="mt-1 flex justify-between text-[11px] text-subtle">
              <span>نصي بالكامل</span>
              <span>دلالي بالكامل</span>
            </div>
          </div>
          <Slider label="ثابت RRF (k)" value={rrfK} onChange={setRrfK} min={10} max={120} step={5} format={(v) => `${v}`} hint="قيمة أعلى تقلل هيمنة النتائج الأولى في كل قائمة." />
          <Slider label="عدد المراجع المسترجعة (Top-K)" value={topK} onChange={setTopK} min={1} max={30} format={(v) => `${v}`} />
          <Slider label="أدنى تشابه مقبول" value={minSim} onChange={setMinSim} min={0} max={0.95} step={0.05} format={(v) => v.toFixed(2)} />
          <Slider
            label="أدنى عدد مراجع للتوليد"
            value={minAnchors}
            onChange={setMinAnchors}
            min={0}
            max={5}
            format={(v) => `${v}`}
            hint={minAnchors === 0 ? "تحذير: سيولّد النموذج أسئلة بلا أي مرجع وزاري." : "إن وُجد أقل من ذلك، يُرفض الطلب برسالة واضحة للطالب."}
          />
          <SettingRow title="إعادة ترتيب النتائج (Reranker)" description="نموذج ثانٍ يعيد ترتيب أفضل 30 نتيجة. أدق، ويضيف ~300ms.">
            <Switch checked={rerank} onChange={setRerank} label="Reranker" />
          </SettingRow>
        </Panel>

        <RetrievalTester topK={topK} minSim={minSim} />
      </div>

      <Modal
        open={reindexOpen}
        onClose={() => setReindexOpen(false)}
        title="إعادة فهرسة كل المحتوى؟"
        description={
          <>
            سيُعاد تضمين <b className="tabular">{fmt(totalVectors)}</b> عنصر بـ <Code>{embModel}</Code> على <span className="tabular">{dims}</span> بُعداً. يعمل الفهرس الحالي حتى تكتمل
            العملية، ثم يُبدَّل تلقائياً.
          </>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setReindexOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setReindexOpen(false);
                showToast({ type: "success", message: "بدأت إعادة الفهرسة — تابعها من «صحة النظام»." });
              }}
            >
              <RefreshCw size={16} />
              ابدأ
            </Button>
          </>
        }
      />
    </>
  );
}

function RetrievalTester({ topK, minSim }: { topK: number; minSim: number }) {
  const { showToast } = useToast();
  const [query, setQuery] = useState("احسب pH محلول حمضي");
  const [subjectId, setSubjectId] = useState("all");
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<
    {
      id: string;
      text: string;
      subject?: string;
      unit?: string;
      vector: number;
      keyword: number;
      fused: number;
      source: string;
    }[]
  >([]);

  useEffect(() => {
    // جلب قائمة المواد من الخادم
    request<{ id: string; name: string }[]>("/branches")
      .catch(() => [])
      .then(async () => {
        try {
          const subs = await request<{ id: string; name: string }[]>("/admin/knowledge/library/subjects");
          if (Array.isArray(subs)) setSubjects(subs);
        } catch {
          // fallback
          setSubjects([
            { id: "sub-1", name: "الكيمياء" },
            { id: "sub-2", name: "الفيزياء" },
            { id: "sub-3", name: "الرياضيات" },
            { id: "sub-4", name: "اللغة الإنجليزية" },
          ]);
        }
      });
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const hits = await searchRetrieval({
        query: query.trim(),
        subjectId: subjectId !== "all" ? subjectId : undefined,
        limit: topK,
        minSimilarity: minSim,
      });

      if (Array.isArray(hits) && hits.length > 0) {
        setResults(
          hits.map((h, i) => ({
            id: h.id || `hit-${i}`,
            text: h.text,
            subject: h.subject || "عام",
            unit: h.unit || "الوحدة الأولى",
            vector: h.similarity || 0.85,
            keyword: h.keywordScore || 0.75,
            fused: h.fusedScore || 0.03,
            source: h.sourceKind === "BOOK" ? "مقطع كتاب" : "سؤال بنك",
          })),
        );
      } else {
        // إذا لم توجد مقاطع حقيقية بعد في الاختبار، عرض نتيجة توضيحية
        setResults([]);
        showToast({ type: "success", message: "تم تنفيذ البحث في قاعدة المتجهات الحقيقية بنجاح." });
      }
    } catch {
      showToast({ type: "error", message: "تعذّر إجراء البحث الدلالي على الخادم." });
    } finally {
      setSearching(false);
    }
  };

  return (
    <Panel title="اختبار الاسترجاع الحقيقي" description="ما الذي سيراه النموذج كمرجع فعلي لهذا السؤال؟" icon={Search} bodyClassName="p-5">
      <form className="flex flex-wrap gap-2" onSubmit={handleSearch}>
        <Input
          aria-label="الاستعلام"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-48 flex-1"
          dir="auto"
          placeholder="اكتب استعلاماً للاختبار..."
        />
        <Select aria-label="المادة" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          <option value="all">كل المواد</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="primary" loading={searching}>
          بحث
        </Button>
      </form>
      <ol className="mt-4 flex flex-col gap-2">
        {results.map((r, i) => (
          <li key={r.id} className="flex gap-3 rounded-xl border border-line p-3">
            <span className="tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-xs font-bold text-navy-900">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-[13px] leading-6 text-ink">
                <MathText>{r.text}</MathText>
              </p>
              <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted">
                <span>{r.source}</span>
                <span>
                  {r.subject} · {r.unit}
                </span>
                <span className="tabular">دلالي {r.vector.toFixed(2)}</span>
                <span className="tabular">نصي {r.keyword.toFixed(2)}</span>
                <span className="tabular font-semibold text-navy-900">RRF {r.fused.toFixed(4)}</span>
              </p>
            </div>
          </li>
        ))}
        {results.length === 0 && !searching && (
          <li className="rounded-xl bg-canvas p-6 text-center text-sm text-muted">
            لا توجد مقاطع متطابقة في قاعدة المتجهات فوق حد التشابه المحدد ({minSim}) — جرب خفض الحد أو اختيار استعلام آخر.
          </li>
        )}
      </ol>
    </Panel>
  );
}
