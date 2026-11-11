"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AdminPageHeader,
  Drawer,
  Input,
  LabeledControl,
  MathText,
  Modal,
  Panel,
  SearchInput,
  Select,
  StatusPill,
  Table,
  Td,
  Textarea,
  Th,
  fmt,
} from "../_components/ui";
import { BLOOM_LABEL, DIFFICULTY_LABEL, type Bloom, type Difficulty } from "@/lib/bloom";
import {
  bulkBank,
  createBankQuestion,
  deleteBankQuestion,
  errorMessage,
  exportBank,
  getBankQuestion,
  getBankStats,
  getLibrarySubjects,
  getSimilar,
  importBankCsv,
  listBank,
  updateBankQuestion,
  type BankFilters,
  type BankQuestion,
  type Choice,
  type LibrarySubject,
  type Paged,
} from "../_data/knowledge";

const DIFF_TONE = { EASY: "bg-teal-50 text-teal-800", MEDIUM: "bg-amber-50 text-amber-800", HARD: "bg-rose-50 text-rose-700" } as const;

export default function BankPage() {
  const { showToast } = useToast();
  const [filters, setFilters] = useState<BankFilters>({ page: 1 });
  const [q, setQ] = useState("");
  const [data, setData] = useState<Paged<BankQuestion> | null>(null);
  const [stats, setStats] = useState<{ total: number; indexed: number; pending: number; failed: number } | null>(null);
  const [subjects, setSubjects] = useState<LibrarySubject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const setFilter = (patch: BankFilters) => {
    setFilters((f) => ({ ...f, ...patch, page: patch.page ?? 1 }));
    setSelected(new Set());
  };

  // البحث بالنص بعد توقف الكتابة
  useEffect(() => {
    const t = setTimeout(() => setFilter({ q: q.trim() || undefined }), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    Promise.all([listBank(filters), getBankStats()])
      .then(([d, s]) => {
        setData(d);
        setStats(s);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [filters]);
  useEffect(load, [load]);

  useEffect(() => {
    getLibrarySubjects()
      .then(setSubjects)
      .catch(() => undefined);
  }, []);

  const rows = data?.data ?? [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.limit)) : 1;
  const page = filters.page ?? 1;
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function bulk(action: "reembed" | "difficulty" | "delete", difficulty?: Difficulty) {
    try {
      const { affected } = await bulkBank(action, [...selected], difficulty);
      showToast({
        type: "success",
        message:
          action === "reembed"
            ? `أُضيف ${affected} سؤال لقائمة التضمين.`
            : action === "difficulty"
              ? `تغيّرت صعوبة ${affected} سؤال.`
              : `حُذف ${affected} سؤال من البنك.`,
      });
      setSelected(new Set());
      load();
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setConfirmBulkDelete(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        title="بنك الأسئلة"
        description="الأسئلة الوزارية المعتمدة التي يرتكز عليها توليد الأسئلة. كل سؤال له متجه تضمين للبحث الدلالي."
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload size={16} />
              استيراد CSV
            </Button>
            <Button variant="secondary" onClick={() => void exportBank(filters).catch((e) => showToast({ type: "error", message: errorMessage(e) }))}>
              <Download size={16} />
              تصدير
            </Button>
            <Button variant="accent" onClick={() => setCreating(true)}>
              <Plus size={17} />
              سؤال جديد
            </Button>
          </>
        }
      />

      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(
          [
            ["إجمالي الأسئلة", stats?.total, "all"],
            ["مفهرسة للبحث الدلالي", stats?.indexed, "INDEXED"],
            ["بانتظار التضمين", stats?.pending, "PENDING"],
            ["فشل تضمينها", stats?.failed, "FAILED"],
          ] as const
        ).map(([k, v, status], i) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter({ embeddingStatus: status === "all" ? undefined : status })}
            aria-pressed={(filters.embeddingStatus ?? "all") === status}
            className={`rounded-2xl border bg-white px-5 py-4 text-start shadow-card transition-colors ${
              (filters.embeddingStatus ?? "all") === status ? "border-teal-600 ring-1 ring-teal-600" : "border-line hover:border-navy-200"
            }`}
          >
            <p className="text-[13px] text-muted">{k}</p>
            <p className={`tabular mt-1 text-2xl font-bold ${i === 3 && v ? "text-rose-600" : "text-navy-900"}`}>{v === undefined ? "—" : fmt(v)}</p>
          </button>
        ))}
      </div>

      <Panel bodyClassName="">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-4">
          <SearchInput placeholder="ابحث في نص السؤال…" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-56 flex-1" aria-label="بحث" />
          <Select aria-label="المادة" value={filters.subjectId ?? "all"} onChange={(e) => setFilter({ subjectId: e.target.value === "all" ? undefined : e.target.value })}>
            <option value="all">كل المواد</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {s.branch}
              </option>
            ))}
          </Select>
          <Select aria-label="الصعوبة" value={filters.difficulty ?? "all"} onChange={(e) => setFilter({ difficulty: e.target.value === "all" ? undefined : e.target.value })}>
            <option value="all">كل الصعوبات</option>
            {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select aria-label="مستوى بلوم" value={filters.bloomTaxonomy ?? "all"} onChange={(e) => setFilter({ bloomTaxonomy: e.target.value === "all" ? undefined : e.target.value })}>
            <option value="all">كل مستويات بلوم</option>
            {Object.entries(BLOOM_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select
            aria-label="حالة التضمين"
            value={filters.embeddingStatus ?? "all"}
            onChange={(e) => setFilter({ embeddingStatus: e.target.value === "all" ? undefined : e.target.value })}
          >
            <option value="all">كل حالات التضمين</option>
            <option value="INDEXED">مفهرس</option>
            <option value="PENDING">بالانتظار</option>
            <option value="FAILED">فشل</option>
          </Select>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-navy-50/70 px-4 py-2.5 text-sm">
            <span className="font-medium text-navy-900">
              حُدد <span className="tabular">{selected.size}</span>
            </span>
            <Button size="sm" variant="secondary" onClick={() => void bulk("reembed")}>
              <RefreshCw size={14} />
              إعادة التضمين
            </Button>
            <Select
              aria-label="تغيير الصعوبة"
              className="h-9"
              value=""
              onChange={(e) => {
                if (e.target.value) void bulk("difficulty", e.target.value as Difficulty);
              }}
            >
              <option value="" disabled>
                تغيير الصعوبة…
              </option>
              {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
            <Button size="sm" variant="ghost" className="text-rose-600 hover:bg-rose-50" onClick={() => setConfirmBulkDelete(true)}>
              <Trash2 size={14} />
              حذف
            </Button>
            <button type="button" className="ms-auto text-[13px] text-muted hover:text-navy-900" onClick={() => setSelected(new Set())}>
              إلغاء التحديد
            </button>
          </div>
        )}

        <Table>
          <thead>
            <tr>
              <Th className="w-10">
                <input
                  type="checkbox"
                  aria-label="تحديد الكل"
                  checked={allChecked}
                  onChange={() => setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)))}
                  className="h-4 w-4 accent-teal-600"
                />
              </Th>
              <Th>السؤال</Th>
              <Th>المادة والوحدة</Th>
              <Th>السنة</Th>
              <Th>الصعوبة</Th>
              <Th>بلوم</Th>
              <Th>التضمين</Th>
              <Th>استُخدم في التوليد</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`cursor-pointer hover:bg-canvas/60 ${selected.has(r.id) ? "bg-navy-50/40" : ""}`} onClick={() => setOpenId(r.id)}>
                <Td>
                  <input
                    type="checkbox"
                    aria-label="تحديد"
                    checked={selected.has(r.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggle(r.id)}
                    className="h-4 w-4 accent-teal-600"
                  />
                </Td>
                <Td className="max-w-md">
                  <p className="line-clamp-1">
                    <MathText>{r.questionText}</MathText>
                  </p>
                </Td>
                <Td className="whitespace-nowrap">
                  {r.subject.name}
                  <span className="block text-xs text-muted" dir="auto">
                    {r.topicId ?? "—"}
                  </span>
                </Td>
                <Td className="whitespace-nowrap">
                  <span className="tabular">{r.year}</span>
                  <span className="block text-xs text-muted">{r.term}</span>
                </Td>
                <Td>
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${DIFF_TONE[r.difficulty]}`}>{DIFFICULTY_LABEL[r.difficulty]}</span>
                </Td>
                <Td className="text-[13px]">{BLOOM_LABEL[r.bloomTaxonomy]}</Td>
                <Td>
                  {r.embeddingStatus === "INDEXED" ? (
                    <StatusPill tone="ok">مفهرس</StatusPill>
                  ) : r.embeddingStatus === "PENDING" ? (
                    <StatusPill tone="idle">بالانتظار</StatusPill>
                  ) : (
                    <StatusPill tone="error">فشل</StatusPill>
                  )}
                </Td>
                <Td className="tabular text-muted">{fmt(r.usageCount)} مرة</Td>
              </tr>
            ))}
            {data && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted">
                  لا توجد أسئلة بهذه الفلاتر.
                </td>
              </tr>
            )}
          </tbody>
        </Table>

        <div className="flex items-center justify-between px-4 py-3 text-[13px] text-muted">
          <span>
            {data && data.total > 0 ? (
              <>
                عرض{" "}
                <span className="tabular">
                  {(page - 1) * data.limit + 1}–{(page - 1) * data.limit + rows.length}
                </span>{" "}
                من <span className="tabular">{fmt(data.total)}</span>
              </>
            ) : (
              "—"
            )}
          </span>
          <Pager page={page} pages={pages} onPage={(p) => setFilter({ ...filters, page: p })} />
        </div>
      </Panel>

      {openId && (
        <EditDrawer
          id={openId}
          onClose={() => setOpenId(null)}
          onSaved={() => {
            setOpenId(null);
            load();
          }}
        />
      )}
      {creating && (
        <CreateDrawer
          subjects={subjects}
          defaultSubject={filters.subjectId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            load();
          }}
        />
      )}
      {importing && (
        <ImportModal
          subjects={subjects}
          defaultSubject={filters.subjectId}
          onClose={() => setImporting(false)}
          onImported={() => {
            setImporting(false);
            load();
          }}
        />
      )}
      <Modal
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        tone="danger"
        title={`حذف ${selected.size} سؤال؟`}
        description="تُستبعد الأسئلة فوراً من البحث والتوليد. الأسئلة المولّدة سابقاً منها تبقى."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmBulkDelete(false)}>
              إلغاء
            </Button>
            <Button variant="danger" onClick={() => void bulk("delete")}>
              حذف
            </Button>
          </>
        }
      />
    </>
  );
}

function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const nums = useMemo(() => {
    const s = new Set([1, 2, 3, page - 1, page, page + 1, pages].filter((p) => p >= 1 && p <= pages));
    return [...s].sort((a, b) => a - b);
  }, [page, pages]);
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="السابق" className="rounded-lg p-1.5 hover:bg-navy-50 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronRight size={17} />
      </button>
      {nums.map((p, i) => (
        <span key={p} className="flex items-center">
          {i > 0 && p - nums[i - 1] > 1 && <span className="px-1">…</span>}
          <button
            type="button"
            onClick={() => onPage(p)}
            aria-current={p === page ? "page" : undefined}
            className={`tabular h-8 min-w-8 rounded-lg px-2 ${p === page ? "bg-navy-900 text-white" : "hover:bg-navy-50"}`}
          >
            {p}
          </button>
        </span>
      ))}
      <button type="button" aria-label="التالي" className="rounded-lg p-1.5 hover:bg-navy-50 disabled:opacity-40" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        <ChevronLeft size={17} />
      </button>
    </div>
  );
}

/* ───────── محرر السؤال (مشترك بين التعديل والإضافة) ───────── */

interface Draft {
  questionText: string;
  choices: Choice[];
  correctAnswer: string;
  explanation: string;
  difficulty: Difficulty;
  bloomTaxonomy: Bloom;
  topicId: string;
}

function QuestionFields({ draft, set }: { draft: Draft; set: (p: Partial<Draft>) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <LabeledControl label="نص السؤال" hint="استخدم $...$ للمعادلات.">
        {(id) => <Textarea id={id} rows={3} value={draft.questionText} onChange={(e) => set({ questionText: e.target.value })} dir="auto" />}
      </LabeledControl>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-[13px] font-medium text-navy-900">الخيارات — اختر الصحيح</legend>
        {draft.choices.map((c, i) => (
          <div key={c.label} className="flex items-center gap-2">
            <input
              type="radio"
              name="bank-correct"
              aria-label={`الخيار ${c.label} صحيح`}
              checked={draft.correctAnswer === c.label}
              onChange={() => set({ correctAnswer: c.label })}
              className="h-4 w-4 accent-teal-600"
            />
            <span className="w-5 text-sm font-semibold text-navy-900">{c.label}</span>
            <Input
              aria-label={`نص الخيار ${c.label}`}
              value={c.text}
              onChange={(e) => set({ choices: draft.choices.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
              className="flex-1"
              dir="auto"
            />
          </div>
        ))}
      </fieldset>
      <LabeledControl label="الشرح">
        {(id) => <Textarea id={id} rows={2} value={draft.explanation} onChange={(e) => set({ explanation: e.target.value })} dir="auto" />}
      </LabeledControl>
      <div className="grid grid-cols-2 gap-3">
        <LabeledControl label="الصعوبة">
          {(id) => (
            <Select id={id} value={draft.difficulty} onChange={(e) => set({ difficulty: e.target.value as Difficulty })}>
              {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </LabeledControl>
        <LabeledControl label="مستوى بلوم">
          {(id) => (
            <Select id={id} value={draft.bloomTaxonomy} onChange={(e) => set({ bloomTaxonomy: e.target.value as Bloom })}>
              {Object.entries(BLOOM_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </LabeledControl>
      </div>
      <LabeledControl label="الوحدة">{(id) => <Input id={id} value={draft.topicId} onChange={(e) => set({ topicId: e.target.value })} dir="auto" />}</LabeledControl>
    </div>
  );
}

function validDraft(d: Draft) {
  const filled = d.choices.filter((c) => c.text.trim());
  if (!d.questionText.trim()) return "نص السؤال مطلوب.";
  if (filled.length < 2) return "أدخل خيارين على الأقل.";
  if (!filled.some((c) => c.label === d.correctAnswer)) return "اختر الإجابة الصحيحة من الخيارات المعبأة.";
  return null;
}

function EditDrawer({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useToast();
  const [q, setQ] = useState<Awaited<ReturnType<typeof getBankQuestion>> | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [similar, setSimilar] = useState<{ id: string; questionText: string; similarity: number }[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getBankQuestion(id)
      .then((r) => {
        setQ(r);
        const labels = ["A", "B", "C", "D"];
        setDraft({
          questionText: r.questionText,
          choices: labels.map((l) => r.choices.find((c) => c.label === l) ?? { label: l, text: "" }),
          correctAnswer: r.correctAnswer,
          explanation: r.explanation ?? "",
          difficulty: r.difficulty,
          bloomTaxonomy: r.bloomTaxonomy,
          topicId: r.topicId ?? "",
        });
      })
      .catch((e) => showToast({ type: "error", message: errorMessage(e) }));
    getSimilar(id)
      .then(setSimilar)
      .catch(() => setSimilar([]));
  }, [id, showToast]);

  async function save() {
    if (!draft) return;
    const invalid = validDraft(draft);
    if (invalid) return showToast({ type: "error", message: invalid });
    setBusy(true);
    try {
      await updateBankQuestion(id, {
        questionText: draft.questionText,
        choices: draft.choices.filter((c) => c.text.trim()),
        correctAnswer: draft.correctAnswer,
        explanation: draft.explanation,
        difficulty: draft.difficulty,
        bloomTaxonomy: draft.bloomTaxonomy,
        topicId: draft.topicId || undefined,
      });
      showToast({
        type: "success",
        message: draft.questionText !== q?.questionText || draft.explanation !== (q?.explanation ?? "") ? "حُفظ السؤال وسيُعاد تضمينه." : "حُفظ السؤال.",
      });
      onSaved();
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteBankQuestion(id);
      showToast({ type: "success", message: "حُذف السؤال من البنك." });
      onSaved();
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="تعديل سؤال البنك"
      subtitle={q ? `${q.subject.name} · ${q.year} ${q.term}` : ""}
      footer={
        <>
          <Button variant="ghost" className="me-auto text-rose-600 hover:bg-rose-50" onClick={remove} disabled={busy || !q}>
            <Trash2 size={16} />
            حذف
          </Button>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !draft}>
            حفظ
          </Button>
        </>
      }
    >
      {draft && q ? (
        <div className="flex flex-col gap-4">
          <QuestionFields draft={draft} set={(p) => setDraft((d) => (d ? { ...d, ...p } : d))} />
          <div className="rounded-xl bg-canvas p-4 text-[13px] leading-6 text-muted">
            <p className="mb-1 font-semibold text-navy-900">الأصل والاستخدام</p>
            {q.source ? (
              <>
                استُخرج من <span dir="auto">«{q.source.originalName}»</span>،{" "}
              </>
            ) : (
              "أُضيف يدوياً أو بالاستيراد، "
            )}
            واستُخدم مرجعاً في <b className="tabular text-ink">{fmt(q.usageCount)}</b> عملية توليد.
            {similar === null ? null : similar.length === 0 ? (
              <span className="block">{q.embeddingStatus === "INDEXED" ? "لا أسئلة مشابهة في المادة." : "يظهر أقرب الأسئلة دلالياً بعد التضمين."}</span>
            ) : (
              <ul className="mt-2 flex flex-col gap-1.5">
                <li className="text-xs font-medium text-navy-900">أقرب الأسئلة دلالياً:</li>
                {similar.map((s) => (
                  <li key={s.id} className="flex gap-2">
                    <span className={`tabular shrink-0 font-semibold ${s.similarity > 0.92 ? "text-amber-700" : "text-ink"}`}>{s.similarity.toFixed(2)}</span>
                    <span className="line-clamp-1">
                      <MathText>{s.questionText}</MathText>
                    </span>
                  </li>
                ))}
                {similar.some((s) => s.similarity > 0.92) && <li className="text-xs text-amber-700">تشابه أعلى من 0.92 قد يعني سؤالاً مكرراً.</li>}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-muted">جارٍ التحميل…</p>
      )}
    </Drawer>
  );
}

function CreateDrawer({
  subjects,
  defaultSubject,
  onClose,
  onCreated,
}: {
  subjects: LibrarySubject[];
  defaultSubject?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { showToast } = useToast();
  const [subjectId, setSubjectId] = useState(defaultSubject ?? subjects[0]?.id ?? "");
  const [year, setYear] = useState(new Date().getFullYear());
  const [term, setTerm] = useState("الدورة الأولى");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    questionText: "",
    choices: ["A", "B", "C", "D"].map((label) => ({ label, text: "" })),
    correctAnswer: "A",
    explanation: "",
    difficulty: "MEDIUM",
    bloomTaxonomy: "UNDERSTAND",
    topicId: "",
  });

  async function create() {
    const invalid = !subjectId ? "اختر المادة." : validDraft(draft);
    if (invalid) return showToast({ type: "error", message: invalid });
    setBusy(true);
    try {
      await createBankQuestion({
        subjectId,
        year,
        term,
        questionText: draft.questionText,
        choices: draft.choices.filter((c) => c.text.trim()),
        correctAnswer: draft.correctAnswer,
        explanation: draft.explanation || undefined,
        difficulty: draft.difficulty,
        bloomTaxonomy: draft.bloomTaxonomy,
        topicId: draft.topicId || undefined,
      });
      showToast({ type: "success", message: "أُضيف السؤال للبنك وأُرسل للتضمين." });
      onCreated();
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title="سؤال جديد في البنك"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="accent" onClick={create} disabled={busy}>
            إضافة
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_96px_minmax(0,1fr)] gap-3">
          <LabeledControl label="المادة">
            {(id) => (
              <Select id={id} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.branch}
                  </option>
                ))}
              </Select>
            )}
          </LabeledControl>
          <LabeledControl label="السنة">
            {(id) => <Input id={id} type="number" min={2000} max={2100} value={year} onChange={(e) => setYear(+e.target.value)} className="tabular" />}
          </LabeledControl>
          <LabeledControl label="الدورة">
            {(id) => (
              <Select id={id} value={term} onChange={(e) => setTerm(e.target.value)}>
                <option>الدورة الأولى</option>
                <option>الدورة الثانية</option>
                <option>تكميلي</option>
              </Select>
            )}
          </LabeledControl>
        </div>
        <QuestionFields draft={draft} set={(p) => setDraft((d) => ({ ...d, ...p }))} />
      </div>
    </Drawer>
  );
}

function ImportModal({
  subjects,
  defaultSubject,
  onClose,
  onImported,
}: {
  subjects: LibrarySubject[];
  defaultSubject?: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const { showToast } = useToast();
  const [subjectId, setSubjectId] = useState(defaultSubject ?? subjects[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; message: string }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    if (!file || !subjectId) return;
    setBusy(true);
    try {
      const r = await importBankCsv(subjectId, file);
      setResult(r);
      if (r.imported) showToast({ type: "success", message: `استُورد ${r.imported} سؤال وأُرسل للتضمين.` });
      if (!r.errors.length) onImported();
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={result?.imported ? onImported : onClose}
      title="استيراد أسئلة من CSV"
      description={
        <>
          الأعمدة: <code dir="ltr">questionText, A, B, C, D, correctAnswer, explanation, year, term, difficulty, bloomTaxonomy, unit</code>. الصفوف الخاطئة تُتخطّى
          ويُذكر رقمها.
        </>
      }
      footer={
        <>
          <Button variant="secondary" onClick={result?.imported ? onImported : onClose}>
            {result ? "إغلاق" : "إلغاء"}
          </Button>
          {!result && (
            <Button variant="accent" onClick={submit} disabled={busy || !file || !subjectId}>
              استيراد
            </Button>
          )}
        </>
      }
    >
      {result ? (
        <div className="text-sm leading-6">
          <p className="text-ink">
            استُورد <b className="tabular">{result.imported}</b> سؤال.
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-rose-50 p-3 text-[13px] text-rose-800">
              {result.errors.map((e) => (
                <li key={e.row}>
                  السطر <span className="tabular">{e.row}</span>: <span dir="ltr">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <LabeledControl label="المادة">
            {(id) => (
              <Select id={id} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.branch}
                  </option>
                ))}
              </Select>
            )}
          </LabeledControl>
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              <Upload size={15} />
              اختيار ملف
            </Button>
            <span className="truncate text-[13px] text-muted" dir="auto">
              {file?.name ?? "لم يُختر ملف"}
            </span>
            <input ref={inputRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
        </div>
      )}
    </Modal>
  );
}
