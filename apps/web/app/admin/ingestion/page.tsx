"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOpenText,
  Check,
  Download,
  FileText,
  FileUp,
  Layers,
  ListRestart,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  ScanText,
  Trash2,
  TriangleAlert,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AdminPageHeader,
  Code,
  Drawer,
  Input,
  LabeledControl,
  Meter,
  Modal,
  Panel,
  Segmented,
  Select,
  Slider,
  StatusPill,
  Switch,
  Tabs,
  fmt,
  MathText,
} from "../_components/ui";
import {
  deleteJob,
  downloadJobFile,
  duration,
  errorMessage,
  getIngestionSettings,
  getJob,
  getJobChunks,
  getLibrarySubjects,
  getSummary,
  listJobs,
  mb,
  rechunkJob,
  reembedJob,
  retryJob,
  setQueuesPaused,
  timeOf,
  uploadSource,
  type EmbeddingInfo,
  type IngestionOptions,
  type Job,
  type JobChunk,
  type JobDetail,
  type JobList,
  type LibrarySubject,
  type SourceKind,
  type Stage,
} from "../_data/knowledge";

interface QueuedFile {
  key: string;
  file: File;
  sizeMb: number;
  subjectId: string;
  year: number;
  term: string;
  part: string;
  edition: number;
}

const MAX_MB: Record<SourceKind, number> = { EXAM: 20, BOOK: 200 };

const STEPS: { id: Stage; label: string }[] = [
  { id: "UPLOADED", label: "الرفع" },
  { id: "EXTRACTING", label: "الاستخراج" },
  { id: "CHUNKING", label: "التقطيع" },
  { id: "EMBEDDING", label: "التضمين" },
  { id: "INDEXED", label: "مفهرس" },
];

/** موقع المرحلة على الخطوات. CHUNKED = التقطيع خلص والتضمين لسا ما بدأ */
function stepIndex(stage: Stage): number {
  if (stage === "CHUNKED") return 3;
  return STEPS.findIndex((s) => s.id === stage);
}

const isRunning = (s: Stage) => s === "UPLOADED" || s === "EXTRACTING" || s === "CHUNKING" || s === "EMBEDDING";

/* ───────── خطوات المرحلة ───────── */

function Stepper({ job }: { job: Job }) {
  const failed = job.stage === "FAILED";
  const current = failed ? stepIndex(job.failedStage ?? "EXTRACTING") : stepIndex(job.stage);
  const indexed = job.stage === "INDEXED";
  return (
    <ol className="flex items-center" aria-label="مراحل المعالجة">
      {STEPS.map((s, i) => {
        const done = !failed && (i < current || indexed);
        const active = !failed && i === current && !indexed;
        const broke = failed && i === current;
        const pct = job.stage === "CHUNKED" ? 0 : job.progress;
        return (
          <li key={s.id} className="flex flex-1 items-center last:flex-none">
            <span
              title={s.label}
              className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                done
                  ? "bg-teal-600 text-white"
                  : active
                    ? "bg-white text-navy-900 ring-2 ring-teal-600"
                    : broke
                      ? "bg-rose-600 text-white"
                      : "bg-slate-100 text-slate-400"
              }`}
            >
              {done ? <Check size={13} strokeWidth={3} /> : broke ? <X size={13} strokeWidth={3} /> : i + 1}
              <span className="sr-only">
                {s.label}: {done ? "مكتمل" : active ? `جارٍ ${pct}%` : broke ? "فشل" : "لم يبدأ"}
              </span>
            </span>
            {i < STEPS.length - 1 && (
              <span className="mx-1 h-0.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className="block h-full bg-teal-600 transition-[width] duration-700"
                  style={{ width: done ? "100%" : active ? `${pct}%` : "0%" }}
                />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function stageLabel(j: Job) {
  if (j.stage === "FAILED") return <StatusPill tone="error">فشل</StatusPill>;
  if (j.stage === "INDEXED") return <StatusPill tone="ok">مفهرس</StatusPill>;
  if (j.stage === "CHUNKED") return <StatusPill tone="warn">بانتظار التضمين</StatusPill>;
  if (j.stage === "UPLOADED") return <StatusPill tone="idle">بالطابور</StatusPill>;
  const label = STEPS.find((s) => s.id === j.stage)?.label;
  return <StatusPill tone="busy">{label}</StatusPill>;
}

/* ───────── الصفحة ───────── */

// ?new=book من لوحة الأوامر بيختار نوع المصدر — useSearchParams لازمه Suspense
export default function IngestionPage() {
  return (
    <Suspense>
      <IngestionView />
    </Suspense>
  );
}

function IngestionView() {
  const params = useSearchParams();
  const { showToast } = useToast();
  const [kind, setKind] = useState<SourceKind>(params.get("new") === "book" ? "BOOK" : "EXAM");
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [jobs, setJobs] = useState<JobList | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "running" | "done" | "failed">("all");
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<LibrarySubject[]>([]);
  const [embedding, setEmbedding] = useState<EmbeddingInfo | null>(null);
  const [queuesEnabled, setQueuesEnabled] = useState(true);
  const [workerOnline, setWorkerOnline] = useState(true);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // خيارات المعالجة — بتفتح على آخر خيارات محفوظة بالسيرفر
  const [opts, setOpts] = useState<IngestionOptions | null>(null);
  const set = <K extends keyof IngestionOptions>(k: K) => (v: IngestionOptions[K]) => setOpts((o) => (o ? { ...o, [k]: v } : o));

  useEffect(() => {
    Promise.all([getIngestionSettings(), getLibrarySubjects(), getSummary()])
      .then(([o, s, sum]) => {
        setOpts(o);
        setSubjects(s);
        setEmbedding(sum.embedding);
        setQueuesEnabled(sum.queuesEnabled);
        setWorkerOnline(sum.workerOnline);
      })
      .catch((e) => setLoadError(errorMessage(e)));
  }, []);

  // refresh() بيطلب تحديث فوري (بعد رفع أو حذف) عبر تغيير المفتاح
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  // تحديث حالة المهام: كل ثانيتين ونص وقت في مهام شغّالة، وإلا كل ١٥ ثانية
  const anyRunning = jobs?.data.some((j) => isRunning(j.stage)) ?? false;
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const list = await listJobs(filter);
        if (!alive) return;
        setJobs(list);
        setLoadError(null);
      } catch (e) {
        if (alive) setLoadError(errorMessage(e));
      }
    };
    void tick();
    const t = setInterval(() => void tick(), anyRunning ? 2500 : 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [filter, anyRunning, reloadKey]);

  // حالة الـ worker بتتغير (إعادة تشغيل، إيقاف) — منراجعها كل ١٥ ثانية
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const sum = await getSummary();
        if (alive) setWorkerOnline(sum.workerOnline);
      } catch {
        /* الخطأ بيظهر بطلبات المهام */
      }
    };
    const t = setInterval(() => void check(), 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const branches = useMemo(() => Array.from(new Set(subjects.map((s) => s.branch))), [subjects]);

  // كتاب انرفع تحت «امتحان وزاري» بيروح كامل لاستخراج الأسئلة وبيعلق —
  // منلفت النظر قبل البدء
  const bookLike =
    kind === "EXAM" ? queue.filter((f) => /كتاب|book|الجزء|الفصل الدراسي|ج\s?[12]\b/i.test(f.file.name) || f.sizeMb > 12) : [];

  const totalMb = queue.reduce((s, f) => s + f.sizeMb, 0);
  const estPages = Math.round(totalMb * (kind === "BOOK" ? 5 : 2));
  const estChunks = opts
    ? Math.round(((estPages * 420) / Math.max(64, opts.chunkSize - opts.overlap)) * (opts.strategy === "semantic" ? 1.15 : 1))
    : 0;

  function guessSubject(name: string): string {
    const n = name.replace(/[_\-.]/g, " ");
    const hit = subjects.find((s) => n.includes(s.name) || n.includes(s.name.replace(/^ال/, "")));
    return hit?.id ?? subjects[0]?.id ?? "";
  }

  function addFiles(files: FileList | File[]) {
    const all = Array.from(files);
    const list = all.filter((f) => /^(application\/pdf|image\/(png|jpeg))$/.test(f.type) || /\.(pdf|png|jpe?g)$/i.test(f.name));
    if (list.length === 0) {
      showToast({ type: "error", message: "الصيغ المدعومة: PDF أو صور (PNG, JPG)." });
      return;
    }
    const tooBig = list.filter((f) => f.size > MAX_MB[kind] * 1048576);
    if (tooBig.length) {
      showToast({ type: "error", message: `${tooBig.map((f) => f.name).join("، ")}: يتجاوز ${MAX_MB[kind]} ميجابايت.` });
    }
    setQueue((q) => [
      ...q,
      ...list
        .filter((f) => !tooBig.includes(f))
        .map((f, i) => ({
          key: `${f.name}-${f.size}-${Date.now()}-${i}`,
          file: f,
          sizeMb: Math.max(0.1, +(f.size / 1048576).toFixed(1)),
          subjectId: guessSubject(f.name),
          year: Number(f.name.match(/20\d\d/)?.[0]) || new Date().getFullYear(),
          term: /د2|دورة ?ثانية|second/i.test(f.name) ? "الدورة الثانية" : "الدورة الأولى",
          part: /ج2|جزء ?(ثاني|2)/.test(f.name) ? "2" : "1",
          edition: new Date().getFullYear(),
        })),
    ]);
  }

  async function start() {
    if (!opts || !queue.length) return;
    const batch = queue;
    setUploading({ done: 0, total: batch.length });
    const failed: QueuedFile[] = [];
    for (const [i, f] of batch.entries()) {
      try {
        await uploadSource({
          file: f.file,
          kind,
          subjectId: f.subjectId,
          year: f.year,
          term: f.term,
          bookPart: f.part,
          bookEdition: f.edition,
          options: opts,
        });
      } catch (e) {
        failed.push(f);
        showToast({ type: "error", message: `${f.file.name}: ${errorMessage(e)}` });
      }
      setUploading({ done: i + 1, total: batch.length });
    }
    setUploading(null);
    setQueue(failed);
    setFilter("all");
    const ok = batch.length - failed.length;
    if (ok) showToast({ type: "success", message: `بدأت معالجة ${ok} ${ok === 1 ? "ملف" : "ملفات"}.` });
    refresh();
  }

  async function togglePause() {
    try {
      const { paused } = await setQueuesPaused(!jobs?.paused);
      setJobs((j) => (j ? { ...j, paused } : j));
      showToast({ type: "success", message: paused ? "أُوقفت القوائم مؤقتاً — المهام الجارية تكمل." : "استُؤنفت المعالجة." });
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    }
  }

  const counts = jobs?.counts ?? { all: 0, running: 0, done: 0, failed: 0 };
  const visible = jobs?.data ?? [];

  return (
    <>
      <AdminPageHeader
        title="رفع ومعالجة الملفات"
        description="ارفع امتحانات وزارية أو كتباً مدرسية. تمرّ الملفات بالاستخراج ثم التقطيع ثم التضمين، وتصبح متاحة لتوليد الأسئلة والبحث الدلالي."
        actions={
          <Button variant="secondary" size="md" onClick={togglePause} disabled={!jobs || !queuesEnabled}>
            {jobs?.paused ? <Play size={16} /> : <Pause size={16} />}
            {jobs?.paused ? "استئناف المعالجة" : "إيقاف مؤقت للقوائم"}
          </Button>
        }
      />

      {!queuesEnabled && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          المعالجة في الخلفية معطّلة لأن <Code>REDIS_URL</Code> غير مضبوط على الخادم. الرفع لن يعمل حتى يُضبط.
        </div>
      )}
      {queuesEnabled && !workerOnline && (
        <div role="alert" className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" />
          <p>
            عملية المعالجة (worker) غير شغّالة: الملفات المرفوعة تُحفظ وتنتظر ولن تُعالَج. شغّلها بـ <Code>npm run dev</Code> من جذر المشروع (يشغّل
            الـ API والـ worker والواجهة معاً)، أو <Code>npm run dev:worker -w @ai-exam/api</Code> وحدها.
          </p>
        </div>
      )}
      {jobs?.paused && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-navy-200 bg-navy-50 p-4 text-sm leading-6 text-navy-900">
          <Pause size={18} className="mt-0.5 shrink-0" />
          القوائم متوقفة مؤقتاً: الملفات الجديدة تُحفظ وتنتظر، ولن تبدأ معالجتها حتى الاستئناف.
        </div>
      )}
      {loadError && (
        <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ───── الرفع ───── */}
        <Panel
          title="ملفات جديدة"
          icon={FileUp}
          action={
            <Segmented
              label="نوع المصدر"
              value={kind}
              onChange={(v) => setKind(v)}
              options={[
                { value: "EXAM", label: "امتحان وزاري" },
                { value: "BOOK", label: "كتاب مدرسي" },
              ]}
            />
          }
        >
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragging ? "border-teal-500 bg-teal-50" : "border-navy-200 bg-canvas/60"
            }`}
          >
            <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-card">
              {kind === "EXAM" ? <UploadCloud size={26} /> : <BookOpenText size={26} />}
            </span>
            <p className="text-[15px] font-semibold text-navy-900">
              {kind === "EXAM" ? "اسحب ملفات الامتحانات هنا" : "اسحب ملفات الكتب هنا"}
            </p>
            <p className="mt-1 text-[13px] text-muted">
              PDF أو صور · حتى {MAX_MB[kind]} ميجابايت للملف ·{" "}
              {kind === "EXAM" ? "يُستخرج كل سؤال ويُرسل للمراجعة" : "يُقطَّع الكتاب ويُفهرس للبحث الدلالي"}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => inputRef.current?.click()}>
                اختيار ملفات
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg"
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {queue.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-navy-900">
                  جاهزة للمعالجة <span className="tabular text-muted">({queue.length})</span>
                </p>
                <button type="button" className="text-[13px] text-muted hover:text-rose-600" onClick={() => setQueue([])} disabled={!!uploading}>
                  مسح الكل
                </button>
              </div>
              {bookLike.length > 0 && (
                <div role="alert" className="mb-3 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[13px] leading-6 text-amber-900 sm:flex-row sm:items-center">
                  <TriangleAlert size={18} className="shrink-0" />
                  <p className="flex-1">
                    {bookLike.length === 1 ? (
                      <>
                        «<span dir="auto">{bookLike[0].file.name}</span>» يبدو كتاباً مدرسياً.
                      </>
                    ) : (
                      <>{bookLike.length} ملفات تبدو كتباً مدرسية.</>
                    )}{" "}
                    الامتحانات تُقرأ لاستخراج أسئلة اختيار من متعدد؛ الكتب تُقطَّع وتُفهرس للبحث.
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => setKind("BOOK")}>
                    <BookOpenText size={15} />
                    رفعها ككتاب مدرسي
                  </Button>
                </div>
              )}
              <ul className="flex flex-col gap-2">
                {queue.map((f) => {
                  const patch = (p: Partial<QueuedFile>) => setQueue((q) => q.map((x) => (x.key === f.key ? { ...x, ...p } : x)));
                  return (
                    <li key={f.key} className="grid gap-3 rounded-xl border border-line p-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto_auto] md:items-center">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                          <FileText size={17} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink" dir="auto">
                            {f.file.name}
                          </p>
                          <p className="tabular text-xs text-muted">{f.sizeMb} ميجابايت</p>
                        </div>
                      </div>
                      <Select aria-label="المادة" value={f.subjectId} onChange={(e) => patch({ subjectId: e.target.value })}>
                        {branches.map((b) => (
                          <optgroup key={b} label={b}>
                            {subjects
                              .filter((s) => s.branch === b)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </Select>
                      {kind === "EXAM" ? (
                        <>
                          <Input
                            aria-label="السنة"
                            type="number"
                            min={2000}
                            max={2100}
                            value={f.year}
                            onChange={(e) => patch({ year: +e.target.value })}
                            className="tabular w-24"
                          />
                          <Select aria-label="الدورة" value={f.term} onChange={(e) => patch({ term: e.target.value })}>
                            <option>الدورة الأولى</option>
                            <option>الدورة الثانية</option>
                            <option>تكميلي</option>
                          </Select>
                        </>
                      ) : (
                        <>
                          <Select aria-label="الجزء" value={f.part} onChange={(e) => patch({ part: e.target.value })}>
                            <option value="1">الجزء الأول</option>
                            <option value="2">الجزء الثاني</option>
                            <option value="all">كامل</option>
                          </Select>
                          <Input
                            aria-label="الطبعة"
                            type="number"
                            min={2000}
                            max={2100}
                            value={f.edition}
                            onChange={(e) => patch({ edition: +e.target.value })}
                            className="tabular w-24"
                          />
                        </>
                      )}
                      <button
                        type="button"
                        aria-label={`إزالة ${f.file.name}`}
                        onClick={() => setQueue((q) => q.filter((x) => x.key !== f.key))}
                        disabled={!!uploading}
                        className="justify-self-end rounded-lg p-2 text-subtle hover:bg-rose-50 hover:text-rose-600"
                      >
                        <X size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 flex flex-col gap-3 rounded-xl bg-navy-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[13px] leading-6 text-navy-800">
                  تقدير أولي: نحو <b className="tabular">{fmt(estPages)}</b> صفحة ←{" "}
                  <b className="tabular">{fmt(estChunks)}</b> مقطعاً
                  {kind === "EXAM" && (
                    <>
                      {" "}
                      و<b className="tabular">{fmt(estPages * 4)}</b> سؤالاً للمراجعة
                    </>
                  )}
                  . العدد الفعلي يظهر بعد الاستخراج.
                </p>
                <Button variant="accent" onClick={start} disabled={!!uploading || !opts || !queuesEnabled}>
                  {uploading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                  {uploading ? `جارٍ الرفع ${uploading.done}/${uploading.total}` : "بدء المعالجة"}
                </Button>
              </div>
            </div>
          )}
        </Panel>

        {/* ───── خيارات المعالجة ───── */}
        <Panel title="خيارات المعالجة" description="تنطبق على الدفعة الحالية وتُحفظ للدفعة التالية" icon={Layers} bodyClassName="p-5 flex flex-col gap-5">
          {!opts ? (
            <p className="py-10 text-center text-sm text-muted">جارٍ التحميل…</p>
          ) : (
            <ProcessingOptions opts={opts} set={set} kind={kind} embedding={embedding} />
          )}
        </Panel>
      </div>

      {/* ───── المهام ───── */}
      <Panel className="mt-6" bodyClassName="">
        <div className="px-5 pt-4">
          <Tabs
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: "all", label: "كل المهام", count: counts.all },
              { value: "running", label: "قيد التنفيذ", count: counts.running },
              { value: "done", label: "مكتملة", count: counts.done },
              { value: "failed", label: "فاشلة", count: counts.failed },
            ]}
          />
        </div>
        <ul className="divide-y divide-line">
          {visible.map((j) => (
            <li key={j.id}>
              <button
                type="button"
                onClick={() => setOpenJob(j.id)}
                className="grid w-full gap-3 px-5 py-4 text-start transition-colors hover:bg-canvas/60 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_120px_130px] lg:items-center lg:gap-6"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${j.kind === "BOOK" ? "bg-navy-50 text-navy-900" : "bg-teal-50 text-teal-700"}`}>
                    {j.kind === "BOOK" ? <BookOpenText size={18} /> : <FileText size={18} />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink" dir="auto">
                      {j.name}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {j.subject} · {j.branch}
                      {j.year ? ` · ${j.year} ${j.term ?? ""}` : ""}
                      {j.pages ? (
                        <>
                          {" "}
                          · <span className="tabular">{j.pages}</span> صفحة
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <Stepper job={j} />
                <div className="text-xs text-muted">
                  {j.kind === "BOOK" && j.chunks ? (
                    <span>
                      <b className="tabular text-ink">{fmt(j.chunks)}</b> مقطع
                    </span>
                  ) : j.kind === "EXAM" && (j.questions || j.stage === "INDEXED") ? (
                    <span>
                      <b className="tabular text-ink">{j.questions}</b> سؤال
                    </span>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 lg:justify-end">{stageLabel(j)}</div>
              </button>
            </li>
          ))}
          {jobs && visible.length === 0 && <li className="px-5 py-12 text-center text-sm text-muted">لا توجد مهام هنا.</li>}
          {!jobs && !loadError && <li className="px-5 py-12 text-center text-sm text-muted">جارٍ التحميل…</li>}
        </ul>
      </Panel>

      {openJob && (
        <JobDrawer
          id={openJob}
          currentOptions={opts}
          onClose={() => setOpenJob(null)}
          onChanged={() => void refresh()}
          onDeleted={() => {
            setOpenJob(null);
            refresh();
          }}
        />
      )}
    </>
  );
}

/* ───────── لوحة الخيارات ───────── */

function ProcessingOptions({
  opts,
  set,
  kind,
  embedding,
}: {
  opts: IngestionOptions;
  set: <K extends keyof IngestionOptions>(k: K) => (v: IngestionOptions[K]) => void;
  kind: SourceKind;
  embedding: EmbeddingInfo | null;
}) {
  const toggles: [string, keyof IngestionOptions][] = [
    ["حذف الترويسات وأرقام الصفحات", "stripHeaders"],
    ["الحفاظ على المعادلات بصيغة LaTeX", "keepLatex"],
    ["توليد التضمين فوراً بعد التقطيع", "embedNow"],
    ...(kind === "EXAM" ? ([["تخطّي الأسئلة المكررة في البنك", "dedupe"]] as [string, keyof IngestionOptions][]) : []),
  ];
  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-navy-900">
            <ScanText size={16} className="text-muted" /> التعرّف الضوئي (OCR)
          </div>
          <Switch checked={opts.ocr} onChange={set("ocr")} label="التعرّف الضوئي" />
        </div>
        {opts.ocr ? (
          <>
            {kind === "BOOK" && (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["local", "محلي مجاني", "Tesseract على السيرفر"],
                    ["ai", "ذكاء اصطناعي", "أدق للتشكيل والمعادلات"],
                  ] as const
                ).map(([v, t, d]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => set("ocrEngine")(v)}
                    aria-pressed={opts.ocrEngine === v}
                    className={`rounded-xl border p-2.5 text-start transition-colors ${
                      opts.ocrEngine === v ? "border-teal-600 bg-teal-50/60 ring-1 ring-teal-600" : "border-line hover:border-navy-200"
                    }`}
                  >
                    <span className="block text-[13px] font-semibold text-navy-900">{t}</span>
                    <span className="block text-[11px] text-muted">{d}</span>
                  </button>
                ))}
              </div>
            )}
            <Select aria-label="لغات التعرّف" value={opts.ocrLang} onChange={(e) => set("ocrLang")(e.target.value as IngestionOptions["ocrLang"])}>
              <option value="ara+eng">العربية + الإنجليزية</option>
              <option value="ara">العربية فقط</option>
              <option value="eng">الإنجليزية فقط</option>
            </Select>
            {kind === "BOOK" && (
              <p className="text-xs leading-5 text-muted">
                {opts.ocrEngine === "local"
                  ? opts.ocrLang === "ara+eng"
                    ? "تنبيه: مع «العربية + الإنجليزية» يقرأ Tesseract بعض الكلمات العربية المشكّلة كحروف لاتينية. للكتب العربية اختر «العربية فقط»."
                    : "بدون تكلفة ولا حدود يومية، ٢–١٢ ثانية للصفحة. الصفحات ضعيفة الثقة تُذكر في السجل."
                  : "يستخدم Claude أو OpenRouter: يستهلك رصيداً أو من حد النماذج المجانية اليومي."}
              </p>
            )}
          </>
        ) : (
          <p className="text-xs leading-5 text-muted">
            {kind === "BOOK"
              ? "تُقرأ طبقة النص في الـ PDF مباشرة. الملفات الممسوحة ضوئياً والعربية المخزّنة بترتيب العرض تحتاج OCR."
              : "ملفات الامتحانات يقرؤها النموذج بصرياً دائماً؛ اللغة المختارة تُمرَّر له كتلميح."}
          </p>
        )}
      </div>

      <div className="border-t border-line pt-5">
        <p className="mb-2.5 text-[13px] font-medium text-navy-900">طريقة التقطيع</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["structure", "حسب البنية", "وحدات وعناوين"],
              ["semantic", "دلالي", "حسب تغيّر المعنى"],
              ["fixed", "ثابت", "عدد توكنات"],
            ] as const
          ).map(([v, t, d]) => (
            <button
              key={v}
              type="button"
              onClick={() => set("strategy")(v)}
              aria-pressed={opts.strategy === v}
              className={`rounded-xl border p-2.5 text-start transition-colors ${
                opts.strategy === v ? "border-teal-600 bg-teal-50/60 ring-1 ring-teal-600" : "border-line hover:border-navy-200"
              }`}
            >
              <span className="block text-[13px] font-semibold text-navy-900">{t}</span>
              <span className="block text-[11px] text-muted">{d}</span>
            </button>
          ))}
        </div>
        {kind === "EXAM" && <p className="mt-2 text-xs text-muted">الامتحانات تُقطَّع سؤالاً لكل مقطع؛ هذه الإعدادات للكتب.</p>}
      </div>

      <Slider
        label="حجم المقطع"
        value={opts.chunkSize}
        onChange={(v) => {
          set("chunkSize")(v);
          if (opts.overlap > v / 2) set("overlap")(Math.floor(v / 2 / 16) * 16);
        }}
        min={128}
        max={2048}
        step={64}
        format={(v) => `${v} tokens`}
      />
      <Slider
        label="التداخل بين المقاطع"
        value={opts.overlap}
        onChange={set("overlap")}
        min={0}
        max={Math.min(256, Math.floor(opts.chunkSize / 2))}
        step={16}
        format={(v) => `${v} tokens`}
        hint={`${Math.round((opts.overlap / opts.chunkSize) * 100)}% من المقطع — 10–20% توازن جيد بين السياق والتكرار.`}
      />

      <div className="flex flex-col gap-3 border-t border-line pt-5">
        {toggles.map(([label, key]) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-ink">{label}</span>
            <Switch size="sm" checked={opts[key] as boolean} onChange={set(key) as (v: boolean) => void} label={label} />
          </div>
        ))}
      </div>

      {kind === "EXAM" && (
        <div className="flex flex-col gap-3 rounded-xl border border-line p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium text-navy-900">اعتماد تلقائي للأسئلة الواثقة</span>
            <Switch size="sm" checked={opts.autoApprove} onChange={set("autoApprove")} label="اعتماد تلقائي" />
          </div>
          {opts.autoApprove && (
            <Slider
              label="حد الثقة"
              value={opts.threshold}
              onChange={set("threshold")}
              min={0.8}
              max={0.99}
              step={0.01}
              format={(v) => v.toFixed(2)}
              hint="ما دونه، أو ما عليه تنبيه، يذهب لصف المراجعة اليدوية."
            />
          )}
        </div>
      )}

      <LabeledControl label="نموذج التضمين" hint="يُضبط على الخادم بـ EMBEDDING_PROVIDER؛ الافتراضي نموذج محلي مجاني.">
        {(id) => (
          <div id={id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5">
            {embedding?.enabled ? (
              <>
                <Code className="truncate">{embedding.model}</Code>
                <span className="tabular shrink-0 text-xs text-muted">
                  {embedding.dimensions}d · {embedding.provider}
                </span>
              </>
            ) : (
              <span className="text-[13px] text-rose-700">{embedding ? "التضمين معطّل على الخادم" : "…"}</span>
            )}
          </div>
        )}
      </LabeledControl>
    </>
  );
}

/* ───────── تفاصيل المهمة ───────── */

const STAGE_NOTE: Record<string, (j: JobDetail) => string> = {
  UPLOADED: () => "حُفظ الملف في التخزين وتُحقّق من نوعه وحجمه.",
  EXTRACTING: (j) =>
    j.kind === "EXAM"
      ? `قراءة الورقة بالنموذج واستخراج الأسئلة والخيارات${j.options.keepLatex ? " بصيغة LaTeX" : ""}.`
      : j.options.ocr
        ? j.options.ocrEngine === "local"
          ? `تعرّف ضوئي محلي بـ Tesseract (${j.options.ocrLang})، صفحة صفحة.`
          : `تعرّف ضوئي بالذكاء الاصطناعي (${j.options.ocrLang}) على دفعات من الصفحات.`
        : "قراءة طبقة النص في الـ PDF.",
  CHUNKING: (j) =>
    j.kind === "EXAM"
      ? `سؤال لكل مقطع، مع فحص التنبيهات${j.options.dedupe ? " وتخطّي المكرر في البنك" : ""}.`
      : `تقسيم النص (${{ structure: "حسب البنية", semantic: "دلالي", fixed: "ثابت" }[j.options.strategy]}، ${j.options.chunkSize} توكن، تداخل ${j.options.overlap}).`,
  EMBEDDING: (j) =>
    j.kind === "EXAM"
      ? j.options.autoApprove
        ? `اعتماد الأسئلة بثقة ≥ ${j.options.threshold} وتضمينها في البنك.`
        : "الأسئلة تنتظر المراجعة اليدوية؛ تُضمَّن عند الاعتماد."
      : j.options.embedNow
        ? "توليد متجه لكل مقطع."
        : "متوقف: خيار «التضمين فوراً» مطفأ — شغّله من «إعادة التضمين».",
  INDEXED: (j) => (j.kind === "EXAM" ? "الأسئلة جاهزة للمراجعة، والمعتمد منها في البنك." : "المقاطع جاهزة للبحث الهجين (دلالي + نصي)."),
};

function JobDrawer({
  id,
  currentOptions,
  onClose,
  onChanged,
  onDeleted,
}: {
  id: string;
  currentOptions: IngestionOptions | null;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"timeline" | "chunks" | "logs">("timeline");
  const [job, setJob] = useState<JobDetail | null>(null);
  const [chunks, setChunks] = useState<JobChunk[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "rechunk" | null>(null);

  const load = useCallback(() => {
    getJob(id)
      .then(setJob)
      .catch((e) => showToast({ type: "error", message: errorMessage(e) }));
  }, [id, showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const running = job ? isRunning(job.stage) : false;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [running, load]);

  useEffect(() => {
    if (tab !== "chunks") return;
    getJobChunks(id)
      .then(setChunks)
      .catch(() => setChunks([]));
  }, [tab, id, job?.stage]);

  async function act(fn: () => Promise<JobDetail | unknown>, success: string) {
    setBusy(true);
    try {
      const res = await fn();
      if (res && typeof res === "object" && "stage" in res) setJob(res as JobDetail);
      showToast({ type: "success", message: success });
      onChanged();
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  if (!job) {
    return (
      <Drawer open onClose={onClose} title="جارٍ التحميل…">
        <p className="py-10 text-center text-sm text-muted">جارٍ التحميل…</p>
      </Drawer>
    );
  }

  const failed = job.stage === "FAILED";
  const current = failed ? stepIndex(job.failedStage ?? "EXTRACTING") : stepIndex(job.stage);
  const optionsChanged =
    currentOptions &&
    (["strategy", "chunkSize", "overlap", "stripHeaders", "keepLatex"] as const).some((k) => currentOptions[k] !== job.options[k]);

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={<span dir="auto">{job.name}</span>}
        subtitle={`${job.subject} · بدأ ${timeOf(job.startedAt)} بواسطة ${job.by}`}
        footer={
          <>
            <Button variant="ghost" className="me-auto text-rose-600 hover:bg-rose-50" onClick={() => setConfirm("delete")} disabled={busy}>
              <Trash2 size={16} />
              حذف
            </Button>
            <Button variant="ghost" onClick={() => void downloadJobFile(job.id, job.name).catch((e) => showToast({ type: "error", message: errorMessage(e) }))}>
              <Download size={16} />
            </Button>
            {job.kind === "BOOK" && !running && (
              <Button variant="secondary" onClick={() => setConfirm("rechunk")} disabled={busy}>
                <ListRestart size={16} />
                إعادة التقطيع
              </Button>
            )}
            {failed ? (
              <Button variant="accent" onClick={() => act(() => retryJob(job.id), "أُعيدت المهمة للقائمة؛ تكمل من المرحلة التي فشلت.")} disabled={busy}>
                <RotateCcw size={16} />
                إعادة المحاولة
              </Button>
            ) : (
              !running && (
                <Button variant="secondary" onClick={() => act(() => reembedJob(job.id), "أُضيف الملف لقائمة إعادة التضمين.")} disabled={busy}>
                  <RotateCcw size={16} />
                  إعادة التضمين
                </Button>
              )
            )}
          </>
        }
      >
        {job.error && (
          <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-800">
            <p className="font-semibold">سبب الفشل</p>
            <p className="mt-1 break-words" dir="auto">
              {job.error}
            </p>
            <p className="mt-2 text-[13px] text-rose-700">
              {job.kind === "BOOK" && !job.options.ocr
                ? "اقتراح: فعّل التعرّف الضوئي ثم أعد التقطيع، أو أعد المحاولة."
                : "إعادة المحاولة تكمل من المرحلة التي فشلت دون إعادة الاستخراج إن أمكن."}
            </p>
          </div>
        )}

        <dl className="mb-6 grid grid-cols-3 gap-3">
          {[
            ["الحجم", mb(job.sizeMb)],
            ["الصفحات", job.pages ? String(job.pages) : "—"],
            [job.kind === "EXAM" ? "الأسئلة" : "المقاطع", job.kind === "EXAM" ? (job.questions ? String(job.questions) : "—") : job.chunks ? fmt(job.chunks) : "—"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-canvas p-3">
              <dt className="text-[11px] text-muted">{k}</dt>
              <dd className="tabular mt-0.5 text-base font-semibold text-navy-900">{v}</dd>
            </div>
          ))}
        </dl>

        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "timeline", label: "المراحل" },
            { value: "chunks", label: job.kind === "EXAM" ? "الأسئلة" : "المقاطع" },
            { value: "logs", label: "السجل" },
          ]}
        />

        <div className="pt-5">
          {tab === "timeline" && (
            <ol className="flex flex-col">
              {STEPS.map((s, i) => {
                const done = !failed && (i < current || job.stage === "INDEXED");
                const active = !failed && i === current && job.stage !== "INDEXED";
                const failedHere = failed && i === current;
                const took = s.id === "EMBEDDING" ? job.stageTimings.EMBEDDING : job.stageTimings[s.id];
                return (
                  <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
                    {i < STEPS.length - 1 && <span className={`absolute start-[13px] top-7 bottom-0 w-0.5 ${done ? "bg-teal-600" : "bg-line"}`} aria-hidden />}
                    <span
                      className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                        done ? "bg-teal-600 text-white" : failedHere ? "bg-rose-600 text-white" : active ? "bg-white ring-2 ring-teal-600" : "bg-slate-100"
                      }`}
                    >
                      {done ? <Check size={14} strokeWidth={3} /> : failedHere ? <X size={14} strokeWidth={3} /> : null}
                    </span>
                    <div className="flex-1 pt-0.5">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-navy-900">{s.label}</p>
                        {done && took ? <span className="tabular text-xs text-muted">{duration(took)}</span> : null}
                      </div>
                      <p className="mt-0.5 text-[13px] text-muted">{STAGE_NOTE[s.id](job)}</p>
                      {active && job.stage !== "CHUNKED" && job.stage !== "UPLOADED" && (
                        <div className="mt-2.5">
                          <Meter value={job.progress} label={`تقدّم ${s.label}`} />
                          <p className="tabular mt-1 text-xs text-muted">{job.progress}%</p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {tab === "chunks" && (
            <ul className="flex flex-col gap-3">
              {chunks === null && <li className="py-8 text-center text-sm text-muted">جارٍ التحميل…</li>}
              {chunks?.length === 0 && <li className="py-8 text-center text-sm text-muted">لا توجد مقاطع بعد.</li>}
              {chunks?.map((c) => (
                <li key={c.id} className="rounded-xl border border-line p-3.5">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Code>{c.id.slice(-6)}</Code>
                    {c.page && <span>ص {c.page}</span>}
                    {c.tokens && <span className="tabular">{c.tokens} توكن</span>}
                    {typeof c.confidence === "number" && <span className="tabular">ثقة {c.confidence.toFixed(2)}</span>}
                    <span className="ms-auto">
                      {c.status === "INDEXED" ? (
                        <StatusPill tone="ok">{job.kind === "EXAM" ? "معتمد" : "مفهرس"}</StatusPill>
                      ) : c.status === "PENDING" ? (
                        <StatusPill tone="idle">{job.kind === "EXAM" ? "للمراجعة" : "بالانتظار"}</StatusPill>
                      ) : (
                        <StatusPill tone="error">{job.kind === "EXAM" ? "مرفوض" : "فشل التضمين"}</StatusPill>
                      )}
                    </span>
                  </div>
                  {c.section && <p className="mb-1.5 text-[11px] font-medium text-teal-700">{c.section}</p>}
                  <p className="line-clamp-3 text-[13px] leading-6 text-ink">
                    <MathText>{c.text}</MathText>
                  </p>
                </li>
              ))}
            </ul>
          )}

          {tab === "logs" && (
            <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-navy-950 p-4 text-[12px] leading-6 text-navy-100">
              {job.log
                .map((l) => `[${timeOf(l.at)}] ${l.step.padEnd(9)} ${l.level === "info" ? "" : `${l.level.toUpperCase()} `}${l.message}`)
                .join("\n") || "—"}
            </pre>
          )}
        </div>
      </Drawer>

      <Modal
        open={confirm === "delete"}
        onClose={() => setConfirm(null)}
        tone="danger"
        title="حذف الملف نهائياً؟"
        description={
          <>
            سيُحذف <b dir="auto">«{job.name}»</b> مع مقاطعه ومتجهاته.
            {job.kind === "EXAM" && " الأسئلة المعتمدة في البنك تبقى، لكن تفقد رابطها بالمصدر؛ والأسئلة غير المراجعة تُحذف."}
          </>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              إلغاء
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => act(() => deleteJob(job.id).then(onDeleted), "حُذف الملف ومقاطعه.")}>
              حذف نهائياً
            </Button>
          </>
        }
      />

      <Modal
        open={confirm === "rechunk"}
        onClose={() => setConfirm(null)}
        title="إعادة تقطيع الكتاب؟"
        description={
          optionsChanged && currentOptions ? (
            <>
              ستُطبَّق خيارات لوحة المعالجة الحالية: {currentOptions.chunkSize} توكن، تداخل {currentOptions.overlap}،{" "}
              {{ structure: "حسب البنية", semantic: "دلالي", fixed: "ثابت" }[currentOptions.strategy]} (بدلاً من {job.options.chunkSize}/{job.options.overlap}). تُحذف المقاطع
              الحالية ويُعاد تضمينها؛ النص المستخرج يُعاد استخدامه.
            </>
          ) : (
            "بنفس الخيارات السابقة. عدّل «خيارات المعالجة» في الصفحة أولاً إن أردت حجماً أو طريقة مختلفة."
          )
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              إلغاء
            </Button>
            <Button
              variant="accent"
              disabled={busy}
              onClick={() => act(() => rechunkJob(job.id, currentOptions ?? job.options), "بدأت إعادة التقطيع.")}
            >
              إعادة التقطيع
            </Button>
          </>
        }
      />
    </>
  );
}
