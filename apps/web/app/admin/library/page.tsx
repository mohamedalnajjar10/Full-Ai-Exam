"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenText, Download, FileText, Layers, ListRestart, Loader2, RefreshCw, Search, Trash2, UploadCloud } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminPageHeader, Code, Drawer, LabeledControl, Meter, Modal, Panel, SearchInput, Select, StatusPill, Table, Tabs, Td, Th, fmt, MathText } from "../_components/ui";
import { downloadFile } from "../_data/http";
import {
  deleteJob,
  deleteSubjectBooks,
  downloadJobFile,
  errorMessage,
  getExamFiles,
  getLibrarySubjects,
  getSubjectChunks,
  mb,
  reembedSubject,
  retryJob,
  searchKnowledge,
  uploadSubjectBook,
  type ExamFileRow,
  type LibraryChunk,
  type LibrarySubject,
  type RetrievedChunk,
} from "../_data/knowledge";

const FILE_STATUS = {
  PENDING: <StatusPill tone="idle">بالانتظار</StatusPill>,
  PROCESSING: <StatusPill tone="busy">قيد المعالجة</StatusPill>,
  COMPLETED: <StatusPill tone="ok">مكتمل</StatusPill>,
  FAILED: <StatusPill tone="error">فشل</StatusPill>,
} as const;

const STRATEGY_LABEL = { structure: "حسب البنية", semantic: "دلالي", fixed: "ثابت" } as const;

type PendingDelete = { kind: "books"; subject: LibrarySubject } | { kind: "exam"; file: ExamFileRow };

export default function LibraryPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<"books" | "exams">("books");
  const [branch, setBranch] = useState("all");
  const [q, setQ] = useState("");
  const [subjects, setSubjects] = useState<LibrarySubject[] | null>(null);
  const [exams, setExams] = useState<ExamFileRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chunksOf, setChunksOf] = useState<LibrarySubject | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PendingDelete | null>(null);
  const [uploadModal, setUploadModal] = useState<{ open: boolean; subject?: LibrarySubject | null }>({
    open: false,
    subject: null,
  });
  const [downloadingSubjectId, setDownloadingSubjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadSubjects = useCallback(() => {
    getLibrarySubjects()
      .then((s) => {
        setSubjects(s);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const loadExams = useCallback(() => {
    getExamFiles({ branch: branch === "all" ? undefined : branch, q: q.trim() || undefined })
      .then(setExams)
      .catch((e) => setError(errorMessage(e)));
  }, [branch, q]);

  useEffect(loadSubjects, [loadSubjects]);
  useEffect(() => {
    const t = setTimeout(loadExams, 250);
    return () => clearTimeout(t);
  }, [loadExams]);

  // تحديث تلقائي وقت في كتاب قيد المعالجة
  const processing = subjects?.some((s) => s.books.some((b) => !["INDEXED", "CHUNKED", "FAILED"].includes(b.stage)));
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(loadSubjects, 4000);
    return () => clearInterval(t);
  }, [processing, loadSubjects]);

  const branches = useMemo(() => Array.from(new Set((subjects ?? []).map((s) => s.branch))), [subjects]);
  // المواد يلي إلها كتب أول — هي يلي المشرف بيشتغل عليها
  const books = (subjects ?? [])
    .filter((s) => (branch === "all" || s.branch === branch) && s.name.includes(q.trim()))
    .sort((a, b) => Number(b.books.length > 0) - Number(a.books.length > 0));
  const bookCount = (subjects ?? []).filter((s) => s.books.length).length;

  const handleDownloadBook = async (s: LibrarySubject) => {
    setDownloadingSubjectId(s.id);
    try {
      await downloadFile(`/subjects/${s.id}/book/file`, `${s.name}.pdf`);
    } catch (err) {
      showToast({ type: "error", message: errorMessage(err) });
    } finally {
      setDownloadingSubjectId(null);
    }
  };

  async function run(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await fn();
      showToast({ type: "success", message: success });
      loadSubjects();
      loadExams();
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
      setConfirmDelete(null);
    }
  }

  return (
    <>
      <AdminPageHeader
        title="مكتبة المصادر"
        description="كل الكتب المدرسية وملفات الامتحانات في قاعدة المعرفة، مع حالة تقطيعها وفهرستها."
        actions={
          tab === "books" ? (
            <Button variant="accent" onClick={() => setUploadModal({ open: true, subject: null })}>
              <UploadCloud size={17} />
              رفع كتاب
            </Button>
          ) : (
            <ButtonLink href="/admin/ingestion?new=exam" variant="accent">
              <UploadCloud size={17} />
              رفع امتحان
            </ButtonLink>
          )
        }
      />

      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "books", label: "الكتب المدرسية", count: bookCount },
            { value: "exams", label: "ملفات الامتحانات", count: exams?.length ?? 0 },
          ]}
        />
        <div className="flex flex-wrap gap-2">
          <SearchInput placeholder="بحث…" value={q} onChange={(e) => setQ(e.target.value)} className="min-w-0 flex-1 sm:w-56 sm:flex-none" aria-label="بحث في المكتبة" />
          <Select aria-label="الفرع" value={branch} onChange={(e) => setBranch(e.target.value)}>
            <option value="all">كل الفروع</option>
            {branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </Select>
        </div>
      </div>

      {tab === "books" ? (
        !subjects ? (
          <p className="py-16 text-center text-sm text-muted">{error ? "" : "جارٍ التحميل…"}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {books.map((s) => (
              <BookCard
                key={s.id}
                s={s}
                busy={busy}
                downloadingId={downloadingSubjectId}
                onChunks={() => setChunksOf(s)}
                onReembed={() => run(() => reembedSubject(s.id), `أُضيفت «${s.name}» لقائمة إعادة التضمين.`)}
                onRetry={(id) => run(() => retryJob(id), "أُعيدت المعالجة من المرحلة التي فشلت.")}
                onDelete={() => setConfirmDelete({ kind: "books", subject: s })}
                onUpload={() => setUploadModal({ open: true, subject: s })}
                onReplace={() => setUploadModal({ open: true, subject: s })}
                onDownload={() => void handleDownloadBook(s)}
              />
            ))}
            {books.length === 0 && <p className="col-span-full py-16 text-center text-sm text-muted">لا توجد مواد بهذا البحث.</p>}
          </div>
        )
      ) : (
        <Panel bodyClassName="">
          <Table>
            <thead>
              <tr>
                <Th>الملف</Th>
                <Th>المادة</Th>
                <Th>السنة والدورة</Th>
                <Th>الحالة</Th>
                <Th>المستخرج ← المعتمد</Th>
                <Th className="w-0" />
              </tr>
            </thead>
            <tbody>
              {(exams ?? []).map((f) => (
                <tr key={f.id} className="hover:bg-canvas/50">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <FileText size={16} className="shrink-0 text-rose-500" />
                      <span className="truncate font-medium" dir="auto">
                        {f.name}
                      </span>
                      <span className="tabular shrink-0 text-xs text-subtle">{mb(f.sizeMb)}</span>
                    </div>
                  </Td>
                  <Td>
                    {f.subject} <span className="text-xs text-subtle">· {f.branch}</span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="tabular">{f.year}</span> · {f.term}
                  </Td>
                  <Td>{FILE_STATUS[f.status]}</Td>
                  <Td>
                    {f.extracted ? (
                      <div className="w-36">
                        <div className="tabular mb-1 text-xs text-muted">
                          {f.extracted} ← <b className="text-ink">{f.approved}</b>
                          {f.pending > 0 && <span className="text-amber-700"> · {f.pending} للمراجعة</span>}
                        </div>
                        <Meter value={f.approved} max={f.extracted} label="نسبة الاعتماد" />
                      </div>
                    ) : (
                      <span className="text-subtle">—</span>
                    )}
                  </Td>
                  <Td>
                    {f.documentId && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          aria-label="تنزيل"
                          onClick={() => void downloadJobFile(f.documentId!, f.name).catch((e) => showToast({ type: "error", message: errorMessage(e) }))}
                          className="rounded-lg p-2 text-subtle hover:bg-navy-50 hover:text-navy-900"
                        >
                          <Download size={16} />
                        </button>
                        {f.status === "FAILED" && (
                          <button
                            type="button"
                            aria-label="إعادة الاستخراج"
                            disabled={busy}
                            onClick={() => run(() => retryJob(f.documentId!), "أُعيد الملف لقائمة الاستخراج.")}
                            className="rounded-lg p-2 text-subtle hover:bg-navy-50 hover:text-navy-900"
                          >
                            <ListRestart size={16} />
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label="حذف"
                          onClick={() => setConfirmDelete({ kind: "exam", file: f })}
                          className="rounded-lg p-2 text-subtle hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
              {exams?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">
                    لا توجد ملفات امتحانات بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </Table>
        </Panel>
      )}

      {chunksOf && <ChunkExplorer subject={chunksOf} onClose={() => setChunksOf(null)} />}

      <UploadBookModal
        open={uploadModal.open}
        onClose={() => setUploadModal({ open: false, subject: null })}
        subjects={subjects ?? []}
        preselectedSubject={uploadModal.subject}
        onSuccess={loadSubjects}
      />

      <Modal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        tone="danger"
        title="حذف المصدر نهائياً؟"
        description={
          confirmDelete?.kind === "books" ? (
            <>
              ستُحذف كتب <b>«{confirmDelete.subject.name}»</b> ({confirmDelete.subject.books.length}) مع كل مقاطعها ومتجهاتها. توليد الأسئلة لهذه المادة سيعتمد على بنك الأسئلة فقط.
            </>
          ) : confirmDelete?.kind === "exam" ? (
            <>
              سيُحذف <b dir="auto">«{confirmDelete.file.name}»</b>. الأسئلة المعتمدة في البنك تبقى، لكن تفقد رابطها بالمصدر؛ والأسئلة غير المراجعة تُحذف.
            </>
          ) : null
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(null)}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                confirmDelete &&
                run(
                  () => (confirmDelete.kind === "books" ? deleteSubjectBooks(confirmDelete.subject.id) : deleteJob(confirmDelete.file.documentId!)),
                  "حُذف المصدر.",
                )
              }
            >
              حذف نهائياً
            </Button>
          </>
        }
      />
    </>
  );
}

function BookCard({
  s,
  busy,
  downloadingId,
  onChunks,
  onReembed,
  onRetry,
  onDelete,
  onUpload,
  onReplace,
  onDownload,
}: {
  s: LibrarySubject;
  busy: boolean;
  downloadingId: string | null;
  onChunks: () => void;
  onReembed: () => void;
  onRetry: (docId: string) => void;
  onDelete: () => void;
  onUpload: () => void;
  onReplace: () => void;
  onDownload: () => void;
}) {
  const latest = s.books[0];
  const hasBookFile = s.hasBook || Boolean(latest);
  const { total, indexed, failed, avgTokens } = s.chunks;
  const pct = total ? Math.round((indexed / total) * 100) : 0;
  const running = s.books.find((b) => !["INDEXED", "CHUNKED", "FAILED"].includes(b.stage));
  const failedBook = s.books.find((b) => b.stage === "FAILED");

  return (
    <article className="flex min-w-0 flex-col rounded-2xl border border-line bg-white p-5 shadow-card">
      <div className="flex items-start gap-3.5">
        <span
          className={`flex h-14 w-11 shrink-0 items-center justify-center rounded-md shadow-sm ${
            hasBookFile ? "bg-gradient-to-b from-navy-800 to-navy-950 text-white" : "border border-dashed border-navy-200 text-navy-300"
          }`}
        >
          <BookOpenText size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-navy-900">{s.name}</h3>
          <p className="text-xs text-muted">الفرع {s.branch}</p>
          {latest ? (
            <p className="mt-1 truncate text-xs text-subtle" dir="auto">
              {s.books.length > 1 ? `${s.books.length} ملفات · ` : ""}
              {latest.name}
              {latest.pages ? ` · ${latest.pages} صفحة` : ""} · {mb(latest.sizeMb)}
            </p>
          ) : hasBookFile ? (
            <p className="mt-1 truncate text-xs text-teal-700" dir="auto">
              {s.bookPdfOriginalName || "كتاب رسمي متاح للتحميل"}
              {s.bookPdfSize ? ` · ${mb(s.bookPdfSize / (1024 * 1024))}` : ""}
            </p>
          ) : (
            <p className="mt-1 text-xs text-amber-700">لا يوجد كتاب مرفوع لهذه المادة</p>
          )}
        </div>
      </div>

      {hasBookFile ? (
        <>
          <div className="mt-5">
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-muted">
                <b className="tabular text-ink">{fmt(indexed)}</b> / <span className="tabular">{fmt(total)}</span> مقطع مفهرس
                {failed > 0 && <span className="text-rose-700"> · {fmt(failed)} فشل</span>}
              </span>
              {running ? (
                <StatusPill tone="busy">قيد المعالجة</StatusPill>
              ) : failedBook && total === 0 ? (
                <StatusPill tone="error">فشلت المعالجة</StatusPill>
              ) : pct === 100 ? (
                <StatusPill tone="ok">جاهز</StatusPill>
              ) : pct === 0 ? (
                <StatusPill tone={total ? "warn" : "ok"}>{total ? "بحث نصي فقط" : "متاح للتحميل"}</StatusPill>
              ) : (
                <StatusPill tone="busy">{pct}%</StatusPill>
              )}
            </div>
            <Meter value={indexed} max={Math.max(1, total)} tone={pct === 100 ? "teal" : pct === 0 ? "teal" : "amber"} label={`فهرسة ${s.name}`} />
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              ["الوحدات", s.units.length || "—"],
              ["متوسط المقطع", avgTokens || "—"],
              ["أسئلة البنك", fmt(s.bankQuestions)],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-lg bg-canvas px-2 py-2">
                <dt className="text-[11px] text-muted">{k}</dt>
                <dd className="tabular text-sm font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button
              size="sm"
              variant="secondary"
              onClick={onDownload}
              disabled={downloadingId === s.id}
              aria-label={`تحميل كتاب ${s.name}`}
            >
              {downloadingId === s.id ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
              تحميل
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onReplace}
              disabled={busy}
              aria-label={`استبدال كتاب ${s.name}`}
            >
              <RefreshCw size={15} />
              استبدال
            </Button>
            {total > 0 && (
              <Button size="sm" variant="ghost" onClick={onChunks}>
                <Layers size={15} />
                المقاطع
              </Button>
            )}
            {failedBook ? (
              <Button size="sm" variant="ghost" onClick={() => onRetry(failedBook.id)} disabled={busy}>
                <ListRestart size={15} />
                إعادة المحاولة
              </Button>
            ) : total > 0 ? (
              <Button size="sm" variant="ghost" onClick={onReembed} disabled={busy || !!running}>
                <RefreshCw size={15} />
                إعادة التضمين
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="ms-auto text-rose-600 hover:bg-rose-50"
              onClick={onDelete}
              aria-label={`حذف كتب ${s.name}`}
              disabled={busy}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          className="mt-5 self-start"
          onClick={onUpload}
        >
          <UploadCloud size={15} />
          رفع الكتاب
        </Button>
      )}
    </article>
  );
}

function ChunkExplorer({ subject, onClose }: { subject: LibrarySubject; onClose: () => void }) {
  const { showToast } = useToast();
  const [mode, setMode] = useState<"browse" | "retrieve">("browse");
  const [q, setQ] = useState("");
  const [unit, setUnit] = useState("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ rows: LibraryChunk[]; total: number } | null>(null);
  const [hits, setHits] = useState<RetrievedChunk[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (mode !== "browse") return;
    const t = setTimeout(() => {
      getSubjectChunks(subject.id, { q: q.trim() || undefined, unit: unit === "all" ? undefined : unit, page })
        .then((r) => setData({ rows: page === 1 ? r.data : [...(data?.rows ?? []), ...r.data], total: r.total }))
        .catch((e) => showToast({ type: "error", message: errorMessage(e) }));
    }, 250);
    return () => clearTimeout(t);
    // data مقصود برّا: منضيف الصفحة الجاية على الموجود
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject.id, q, unit, page, mode, showToast]);

  async function retrieve() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      setHits(await searchKnowledge(subject.id, q.trim(), unit === "all" ? undefined : unit));
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setSearching(false);
    }
  }

  const opts = subject.books[0]?.options;
  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-2xl"
      title={`مقاطع كتاب ${subject.name}`}
      subtitle={`${fmt(subject.chunks.total)} مقطع${opts ? ` · ${STRATEGY_LABEL[opts.strategy]} · ${opts.chunkSize} توكن · تداخل ${opts.overlap}` : ""}`}
    >
      <div className="mb-3">
        <Tabs
          value={mode}
          onChange={(m) => {
            setMode(m);
            setHits(null);
          }}
          tabs={[
            { value: "browse", label: "تصفّح" },
            { value: "retrieve", label: "اختبار الاسترجاع" },
          ]}
        />
      </div>
      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "retrieve") void retrieve();
        }}
      >
        <SearchInput
          placeholder={mode === "browse" ? "ابحث داخل المقاطع…" : "اكتب سؤالاً كما يكتبه الطالب…"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          className="flex-1"
          aria-label="بحث في المقاطع"
        />
        <Select
          aria-label="الوحدة"
          value={unit}
          onChange={(e) => {
            setUnit(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">كل الوحدات</option>
          {subject.units.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </Select>
        {mode === "retrieve" && (
          <Button type="submit" variant="primary" disabled={searching || !q.trim()}>
            <Search size={15} />
            بحث
          </Button>
        )}
      </form>

      {mode === "retrieve" ? (
        <>
          <p className="mb-3 text-xs leading-5 text-muted">
            نفس البحث الهجين المستخدم عند توليد الأسئلة: تشابه المتجهات + البحث النصي، مدموجان بترتيب RRF.
          </p>
          <ul className="flex flex-col gap-3">
            {hits?.map((c, i) => (
              <li key={c.id} className="rounded-xl border border-line p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="tabular font-semibold text-navy-900">#{i + 1}</span>
                  <span>
                    صفحة {c.pageStart}
                    {c.pageEnd !== c.pageStart ? `–${c.pageEnd}` : ""}
                  </span>
                  <span className="tabular ms-auto">
                    دلالي {c.vectorRank ?? "—"} · نصي {c.keywordRank ?? "—"} · <Code>{c.score.toFixed(4)}</Code>
                  </span>
                </div>
                {c.section && <p className="mb-1.5 text-[11px] font-medium text-teal-700">{c.section}</p>}
                <MathText block className="text-[13px] leading-6 text-ink">{c.text}</MathText>
              </li>
            ))}
            {hits?.length === 0 && <li className="py-8 text-center text-sm text-muted">لا نتائج.</li>}
          </ul>
        </>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {data?.rows.map((c) => (
              <li key={c.id} className="rounded-xl border border-line p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Code>#{c.ordinal + 1}</Code>
                  <span>
                    صفحة {c.pageStart}
                    {c.pageEnd !== c.pageStart ? `–${c.pageEnd}` : ""}
                  </span>
                  <span className="tabular">{c.tokens} توكن</span>
                  <span className="ms-auto">
                    {c.embeddingStatus === "INDEXED" ? (
                      <StatusPill tone="ok">مفهرس</StatusPill>
                    ) : c.embeddingStatus === "PENDING" ? (
                      <StatusPill tone="idle">بالانتظار</StatusPill>
                    ) : (
                      <StatusPill tone="error">فشل</StatusPill>
                    )}
                  </span>
                </div>
                {c.section && <p className="mb-1.5 text-[11px] font-medium text-teal-700">{c.section}</p>}
                <MathText block className="text-[13px] leading-6 text-ink">{c.text}</MathText>
              </li>
            ))}
            {data?.rows.length === 0 && <li className="py-8 text-center text-sm text-muted">لا توجد مقاطع مطابقة.</li>}
            {!data && <li className="py-8 text-center text-sm text-muted">جارٍ التحميل…</li>}
          </ul>
          {data && data.rows.length < data.total && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" size="sm" onClick={() => setPage((p) => p + 1)}>
                عرض المزيد ({fmt(data.total - data.rows.length)})
              </Button>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}

function UploadBookModal({
  open,
  onClose,
  subjects,
  preselectedSubject,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  subjects: LibrarySubject[];
  preselectedSubject?: LibrarySubject | null;
  onSuccess: () => void;
}) {
  const { showToast } = useToast();
  const branches = useMemo(() => Array.from(new Set(subjects.map((s) => s.branch))), [subjects]);

  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (preselectedSubject) {
      setSelectedBranch(preselectedSubject.branch);
      setSelectedSubjectId(preselectedSubject.id);
    } else {
      const firstBranch = branches[0] || "";
      setSelectedBranch(firstBranch);
      const firstSub = subjects.find((s) => s.branch === firstBranch);
      setSelectedSubjectId(firstSub?.id || "");
    }
    setFile(null);
    setFileError(null);
    setUploading(false);
  }, [open, preselectedSubject, branches, subjects]);

  const filteredSubjects = useMemo(
    () => subjects.filter((s) => s.branch === selectedBranch),
    [subjects, selectedBranch]
  );

  const handleBranchChange = (branch: string) => {
    setSelectedBranch(branch);
    const firstSub = subjects.find((s) => s.branch === branch);
    setSelectedSubjectId(firstSub?.id || "");
  };

  const validateAndSetFile = (f: File) => {
    if (f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setFile(null);
      setFileError("يجب أن يكون الملف بصيغة PDF فقط.");
      return;
    }
    const maxBytes = 50 * 1024 * 1024; // 50 MB
    if (f.size > maxBytes) {
      setFile(null);
      setFileError(`حجم الملف (${(f.size / (1024 * 1024)).toFixed(1)} ميغابايت) يتجاوز الحد الأقصى المسموح به (50 ميغابايت).`);
      return;
    }
    setFileError(null);
    setFile(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) validateAndSetFile(selected);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) validateAndSetFile(dropped);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubjectId) {
      showToast({ type: "error", message: "يرجى اختيار المادة الدراسية." });
      return;
    }
    if (!file) {
      showToast({ type: "error", message: "يرجى اختيار ملف الكتاب بصيغة PDF." });
      return;
    }

    setUploading(true);
    try {
      await uploadSubjectBook(selectedSubjectId, file);
      showToast({ type: "success", message: "تم رفع الكتاب بنجاح وإتاحته للطلاب فوراً في لوحتهم الرئيسية." });
      onSuccess();
      onClose();
    } catch (err) {
      showToast({ type: "error", message: errorMessage(err) });
    } finally {
      setUploading(false);
    }
  };

  const currentSubject = subjects.find((s) => s.id === selectedSubjectId);
  const isReplacing = currentSubject && (currentSubject.hasBook || currentSubject.books.length > 0);

  return (
    <Modal
      open={open}
      onClose={() => !uploading && onClose()}
      title={isReplacing ? `استبدال كتاب «${currentSubject?.name}»` : "رفع كتاب مدرسي رسمي"}
      description="ارفع الكتاب المعتمد بصيغة PDF (بحد أقصى 50MB). يُتاح الكتاب للطلاب في صفحتهم الرئيسية فور اكتمال الرفع."
    >
      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <LabeledControl label="الفرع الدراسي">
            {(id) => (
              <Select
                id={id}
                value={selectedBranch}
                onChange={(e) => handleBranchChange(e.target.value)}
                disabled={uploading}
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            )}
          </LabeledControl>

          <LabeledControl label="المادة الدراسية">
            {(id) => (
              <Select
                id={id}
                value={selectedSubjectId}
                onChange={(e) => setSelectedSubjectId(e.target.value)}
                disabled={uploading}
              >
                {filteredSubjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.hasBook || s.books.length > 0 ? "✓ (يوجد كتاب)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </LabeledControl>
        </div>

        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-navy-900">ملف الكتاب (PDF)</label>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
              file
                ? "border-teal-500 bg-teal-50/40"
                : fileError
                  ? "border-rose-400 bg-rose-50/40"
                  : "border-navy-200 bg-canvas hover:border-teal-400 hover:bg-white"
            }`}
          >
            <input
              type="file"
              accept=".pdf,application/pdf"
              disabled={uploading}
              onChange={handleFileChange}
              className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              aria-label="اختيار ملف الكتاب"
            />
            {file ? (
              <div className="flex flex-col items-center gap-1.5">
                <FileText size={32} className="text-teal-600" />
                <span className="max-w-[280px] truncate text-sm font-semibold text-navy-900" dir="auto">
                  {file.name}
                </span>
                <span className="text-xs text-muted">{(file.size / (1024 * 1024)).toFixed(2)} ميغابايت</span>
                <span className="mt-1 text-[11px] text-teal-700 underline">اضغط لاختيار ملف بديل</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <UploadCloud size={32} className="text-navy-400" />
                <p className="text-sm font-medium text-navy-900">اضغط لاختيار ملف PDF أو اسحبه إلى هنا</p>
                <p className="text-xs text-muted">الحد الأقصى: 50 ميغابايت بصيغة PDF</p>
              </div>
            )}
          </div>
          {fileError && <p className="mt-1.5 text-xs font-medium text-rose-600">{fileError}</p>}
        </div>

        <div className="mt-2 flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={uploading}>
            إلغاء
          </Button>
          <Button type="submit" variant="accent" disabled={uploading || !file || !selectedSubjectId}>
            {uploading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                جاري الرفع والحفظ...
              </>
            ) : (
              <>
                <UploadCloud size={16} />
                {isReplacing ? "استبدال الكتاب" : "رفع وحفظ الكتاب"}
              </>
            )}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
