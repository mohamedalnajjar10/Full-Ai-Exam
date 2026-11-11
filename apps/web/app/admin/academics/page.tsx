"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, BookOpenText, ChevronLeft, ChevronRight, GraduationCap, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/ToastProvider";
import { AdminPageHeader, Input, LabeledControl, Modal, Panel, Select, StatusPill, Switch, Tabs, Textarea, fmt } from "../_components/ui";
import { errorMessage } from "../_data/http";
import {
  createBranch,
  createSubject,
  createTeacher,
  deleteBranch,
  deleteSubject,
  deleteTeacher,
  getAcademics,
  renameBranch,
  renameSubject,
  reorderTeachers,
  saveUnits,
  updateTeacher,
  uploadTeacherPhoto,
  type Academics,
  type AcademicsSubject,
  type AcademicsTeacher,
  type TeacherInput,
} from "../_data/platform";

type Dialog =
  | { kind: "branch"; id?: string; name: string }
  | { kind: "deleteBranch"; id: string; name: string }
  | { kind: "subject"; id?: string; name: string; branchId: string }
  | { kind: "deleteSubject"; id: string; name: string }
  | { kind: "teacher"; teacher?: AcademicsTeacher }
  | { kind: "deleteTeacher"; id: string; name: string }
  | null;

export default function AcademicsPage() {
  const { showToast } = useToast();
  const [data, setData] = useState<Academics | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<"subjects" | "teachers">("subjects");
  const [branchId, setBranchId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await getAcademics();
      setData(d);
      setLoadError("");
      setBranchId((cur) => (cur && d.branches.some((b) => b.id === cur) ? cur : (d.branches[0]?.id ?? null)));
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- جلب أولي من الخادم
    void load();
  }, [load]);

  /** تنفيذ إجراء ثم إعادة التحميل — رسالة الخطأ من الخادم كما هي */
  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      await load();
      setDialog(null);
      showToast({ type: "success", message: success });
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <>
        <AdminPageHeader title="الفروع والمواد" />
        {loadError ? <p className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">{loadError}</p> : <Spinner className="py-24" />}
      </>
    );
  }

  const branch = data.branches.find((b) => b.id === branchId) ?? null;
  const inBranch = data.subjects.filter((s) => s.branchId === branchId);

  return (
    <>
      <AdminPageHeader
        title="الفروع والمواد"
        description="هيكل المنهاج: الفروع، موادها، ووحدات كل مادة. الوحدات هي ما يختار منه الطالب ويُصنَّف به البنك والكتب."
        actions={
          tab === "subjects" ? (
            <Button variant="accent" disabled={!branch} onClick={() => branch && setDialog({ kind: "subject", name: "", branchId: branch.id })}>
              <Plus size={17} />
              مادة جديدة
            </Button>
          ) : (
            <Button variant="accent" onClick={() => setDialog({ kind: "teacher" })}>
              <Plus size={17} />
              معلم جديد
            </Button>
          )
        }
      />

      <div className="mb-5">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "subjects", label: "المواد والوحدات", count: data.subjects.length },
            { value: "teachers", label: "المعلمون", count: data.teachers.length },
          ]}
        />
      </div>

      {tab === "subjects" ? (
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <nav aria-label="الفروع" className="flex flex-col gap-1">
            {data.branches.map((b) => {
              const on = b.id === branchId;
              return (
                <div key={b.id} className={`group flex items-center rounded-xl transition-colors ${on ? "bg-white shadow-card ring-1 ring-line" : "hover:bg-white/70"}`}>
                  <button type="button" onClick={() => setBranchId(b.id)} aria-current={on} className="flex min-w-0 flex-1 items-center justify-between px-3.5 py-3 text-start">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-navy-900">الفرع {b.name}</span>
                      <span className="text-xs text-muted">
                        <span className="tabular">{b.subjects}</span> مواد · <span className="tabular">{fmt(b.students)}</span> طالب
                      </span>
                    </span>
                    <GraduationCap size={17} className={on ? "text-teal-600" : "text-navy-200"} />
                  </button>
                  {on && (
                    <span className="flex pe-1.5">
                      <button type="button" aria-label={`إعادة تسمية الفرع ${b.name}`} onClick={() => setDialog({ kind: "branch", id: b.id, name: b.name })} className="rounded-lg p-1.5 text-subtle hover:bg-navy-50 hover:text-navy-900">
                        <Pencil size={14} />
                      </button>
                      <button type="button" aria-label={`حذف الفرع ${b.name}`} onClick={() => setDialog({ kind: "deleteBranch", id: b.id, name: b.name })} className="rounded-lg p-1.5 text-subtle hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 size={14} />
                      </button>
                    </span>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              onClick={() => setDialog({ kind: "branch", name: "" })}
              className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-navy-200 px-3.5 py-2.5 text-[13px] text-muted hover:text-navy-900"
            >
              <Plus size={15} /> فرع جديد
            </button>
          </nav>

          <div className="flex min-w-0 flex-col gap-4">
            {data.branches.length === 0 && <p className="rounded-2xl border border-dashed border-navy-200 bg-white p-10 text-center text-sm text-muted">لا فروع بعد — ابدأ بإضافة فرع.</p>}
            {branch && inBranch.length === 0 && <p className="rounded-2xl border border-dashed border-navy-200 bg-white p-10 text-center text-sm text-muted">لا مواد في هذا الفرع بعد.</p>}
            {inBranch.map((s) => (
              <SubjectPanel
                key={s.id}
                subject={s}
                onEdit={() => setDialog({ kind: "subject", id: s.id, name: s.name, branchId: s.branchId })}
                onUnitsSaved={(units) => setData((d) => d && { ...d, subjects: d.subjects.map((x) => (x.id === s.id ? { ...x, units } : x)) })}
              />
            ))}
          </div>
        </div>
      ) : (
        <TeachersGrid
          teachers={data.teachers}
          onChanged={load}
          onEdit={(t) => setDialog({ kind: "teacher", teacher: t })}
          onDelete={(t) => setDialog({ kind: "deleteTeacher", id: t.id, name: t.name })}
        />
      )}

      {/* ───────── النوافذ ───────── */}

      {dialog?.kind === "branch" && (
        <NameDialog
          title={dialog.id ? "إعادة تسمية الفرع" : "فرع جديد"}
          label="اسم الفرع"
          placeholder="مثال: العلمي"
          initial={dialog.name}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(name) => run(() => (dialog.id ? renameBranch(dialog.id, name) : createBranch(name)), dialog.id ? "حُفظ اسم الفرع." : "أُضيف الفرع.")}
        />
      )}

      <Modal
        open={dialog?.kind === "deleteBranch"}
        onClose={() => setDialog(null)}
        tone="danger"
        title={`حذف الفرع ${dialog?.kind === "deleteBranch" ? dialog.name : ""}؟`}
        description="يُحذف الفرع فقط إذا لم تكن فيه مواد أو طلاب."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              إلغاء
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => dialog?.kind === "deleteBranch" && run(() => deleteBranch(dialog.id), "حُذف الفرع.")}>
              حذف
            </Button>
          </>
        }
      />

      {dialog?.kind === "subject" && (
        <SubjectDialog
          dialog={dialog}
          branches={data.branches}
          busy={busy}
          onClose={() => setDialog(null)}
          onDelete={dialog.id ? () => setDialog({ kind: "deleteSubject", id: dialog.id!, name: dialog.name }) : undefined}
          onSubmit={(name, branchId) =>
            run(
              () => (dialog.id ? renameSubject(dialog.id, name) : createSubject(name, branchId)),
              dialog.id ? "حُفظت المادة." : "أُضيفت المادة. ارفع كتابها من «رفع ومعالجة الملفات».",
            )
          }
        />
      )}

      <Modal
        open={dialog?.kind === "deleteSubject"}
        onClose={() => setDialog(null)}
        tone="danger"
        title={`حذف مادة ${dialog?.kind === "deleteSubject" ? dialog.name : ""}؟`}
        description="تفشل العملية إن كانت للمادة أسئلة في البنك أو محادثات أو كتب — احذفها أولاً."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              إلغاء
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => dialog?.kind === "deleteSubject" && run(() => deleteSubject(dialog.id), "حُذفت المادة.")}>
              حذف
            </Button>
          </>
        }
      />

      {dialog?.kind === "teacher" && (
        <TeacherDialog
          teacher={dialog.teacher}
          subjects={data.subjects}
          branches={data.branches}
          busy={busy}
          onClose={() => setDialog(null)}
          onSubmit={(input, photo) =>
            run(async () => {
              if (dialog.teacher) {
                await updateTeacher(dialog.teacher.id, input);
                if (photo) await uploadTeacherPhoto(dialog.teacher.id, photo);
              } else {
                await createTeacher(input, photo);
              }
            }, dialog.teacher ? "حُفظ المعلم." : "أُضيف المعلم.")
          }
        />
      )}

      <Modal
        open={dialog?.kind === "deleteTeacher"}
        onClose={() => setDialog(null)}
        tone="danger"
        title={`حذف ${dialog?.kind === "deleteTeacher" ? dialog.name : ""}؟`}
        description="تختفي بطاقته من الصفحة الرئيسية نهائياً. لإخفائها مؤقتاً استعمل مفتاح الإظهار."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              إلغاء
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => dialog?.kind === "deleteTeacher" && run(() => deleteTeacher(dialog.id), "حُذف المعلم.")}>
              حذف
            </Button>
          </>
        }
      />
    </>
  );
}

/* ───────── المادة ووحداتها ───────── */

function BookStatus({ books }: { books: AcademicsSubject["books"] }) {
  if (books.indexed > 0)
    return (
      <StatusPill tone="ok">
        <BookOpenText size={12} className="-ms-0.5" />
        {books.indexed > 1 ? `${books.indexed} كتب مفهرسة` : "الكتاب مفهرس"}
      </StatusPill>
    );
  if (books.processing > 0) return <StatusPill tone="busy">الكتاب قيد المعالجة</StatusPill>;
  if (books.failed > 0) return <StatusPill tone="error">فشلت معالجة الكتاب</StatusPill>;
  return <StatusPill tone="warn">بلا كتاب</StatusPill>;
}

/**
 * الوحدات بتنحفظ فوراً مع كل تعديل (إضافة، حذف، ترتيب) — تحديث متفائل
 * بيرجع لورا إذا رفض الخادم.
 */
function SubjectPanel({ subject, onEdit, onUnitsSaved }: { subject: AcademicsSubject; onEdit: () => void; onUnitsSaved: (units: string[]) => void }) {
  const { showToast } = useToast();
  const [units, setUnits] = useState(subject.units);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function commit(next: string[]) {
    const prev = units;
    setUnits(next);
    setSaving(true);
    try {
      const saved = await saveUnits(subject.id, next);
      setUnits(saved.units);
      onUnitsSaved(saved.units);
    } catch (e) {
      setUnits(prev);
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  function move(i: number, by: -1 | 1) {
    const next = [...units];
    [next[i], next[i + by]] = [next[i + by], next[i]];
    void commit(next);
  }

  return (
    <Panel
      title={subject.name}
      description={
        <>
          <span className="tabular">{fmt(subject.bankQuestions)}</span> سؤال في البنك · <span className="tabular">{fmt(subject.students)}</span> طالب في الفرع
        </>
      }
      action={
        <>
          {saving && <Loader2 size={15} className="animate-spin text-subtle" aria-label="جاري الحفظ" />}
          <Link href="/admin/ingestion?new=book" title="رفع ومعالجة الكتب">
            <BookStatus books={subject.books} />
          </Link>
          <button type="button" aria-label={`تعديل ${subject.name}`} onClick={onEdit} className="rounded-lg p-2 text-subtle hover:bg-navy-50 hover:text-navy-900">
            <Pencil size={15} />
          </button>
        </>
      }
    >
      <p className="mb-2.5 text-[13px] font-medium text-navy-900">الوحدات {units.length === 0 && <span className="font-normal text-muted">— لم تُحدَّد بعد؛ تُستنتج مؤقتاً من عناوين الكتاب</span>}</p>
      <ol className="flex flex-wrap gap-2">
        {units.map((u, i) => (
          <li key={u} className="group inline-flex items-center gap-1 rounded-lg border border-line bg-canvas py-1 pe-1 ps-2.5 text-[13px] text-ink" dir="auto">
            <span className="tabular text-[11px] text-subtle">{i + 1}</span>
            <span className="ms-0.5">{u}</span>
            <span className="flex opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
              <button type="button" aria-label={`تقديم ${u}`} disabled={i === 0 || saving} onClick={() => move(i, -1)} className="rounded p-0.5 text-subtle hover:text-navy-900 disabled:opacity-30">
                <ChevronRight size={13} />
              </button>
              <button type="button" aria-label={`تأخير ${u}`} disabled={i === units.length - 1 || saving} onClick={() => move(i, 1)} className="rounded p-0.5 text-subtle hover:text-navy-900 disabled:opacity-30">
                <ChevronLeft size={13} />
              </button>
              <button type="button" aria-label={`حذف وحدة ${u}`} disabled={saving} onClick={() => void commit(units.filter((x) => x !== u))} className="rounded p-0.5 text-subtle hover:text-rose-600">
                <X size={13} />
              </button>
            </span>
          </li>
        ))}
        <li>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const u = draft.trim();
              if (!u || units.includes(u)) return;
              setDraft("");
              void commit([...units, u]);
            }}
            className="flex"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="+ وحدة جديدة"
              aria-label={`وحدة جديدة في ${subject.name}`}
              maxLength={120}
              dir="auto"
              className="h-8 w-40 rounded-lg border border-dashed border-navy-200 bg-white px-2.5 text-[13px] outline-none focus:border-teal-600"
            />
          </form>
        </li>
      </ol>
    </Panel>
  );
}

/* ───────── المعلمون ───────── */

function TeachersGrid({
  teachers,
  onChanged,
  onEdit,
  onDelete,
}: {
  teachers: AcademicsTeacher[];
  onChanged: () => Promise<void>;
  onEdit: (t: AcademicsTeacher) => void;
  onDelete: (t: AcademicsTeacher) => void;
}) {
  const { showToast } = useToast();
  const [pending, setPending] = useState<string | null>(null);

  async function act(id: string, action: () => Promise<unknown>) {
    setPending(id);
    try {
      await action();
      await onChanged();
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    } finally {
      setPending(null);
    }
  }

  function move(i: number, by: -1 | 1) {
    const ids = teachers.map((t) => t.id);
    [ids[i], ids[i + by]] = [ids[i + by], ids[i]];
    void act(teachers[i].id, () => reorderTeachers(ids));
  }

  if (teachers.length === 0) return <p className="rounded-2xl border border-dashed border-navy-200 bg-white p-10 text-center text-sm text-muted">لا معلمين بعد.</p>;

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {teachers.map((t, i) => (
        <article key={t.id} className={`flex flex-col rounded-2xl border border-line bg-white p-5 shadow-card transition-opacity ${t.isActive ? "" : "opacity-60"}`}>
          <div className="flex items-start gap-3">
            <Avatar name={t.name} src={t.hasPhoto ? `/api/v1/teachers/${t.id}/photo` : null} size={48} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[15px] font-semibold text-navy-900" dir="auto">
                {t.name}
              </h3>
              <p className="truncate text-[13px] text-muted" dir="auto">
                {t.title}
              </p>
              <p className="mt-1 text-xs text-teal-700">{t.subjectName ?? "بلا مادة"}</p>
            </div>
            <Switch
              size="sm"
              checked={t.isActive}
              disabled={pending === t.id}
              onChange={(v) => void act(t.id, () => updateTeacher(t.id, { isActive: v }))}
              label={`إظهار ${t.name} في الصفحة الرئيسية`}
            />
          </div>
          <div className="mt-4 flex items-center gap-1 border-t border-line pt-3">
            <span className="tabular me-auto text-xs text-muted">الترتيب {i + 1}</span>
            {pending === t.id && <Loader2 size={14} className="animate-spin text-subtle" />}
            <button type="button" aria-label="تقديم" disabled={i === 0 || pending !== null} onClick={() => move(i, -1)} className="rounded-lg p-1.5 text-subtle hover:bg-navy-50 hover:text-navy-900 disabled:opacity-30">
              <ArrowUp size={15} />
            </button>
            <button type="button" aria-label="تأخير" disabled={i === teachers.length - 1 || pending !== null} onClick={() => move(i, 1)} className="rounded-lg p-1.5 text-subtle hover:bg-navy-50 hover:text-navy-900 disabled:opacity-30">
              <ArrowDown size={15} />
            </button>
            <button type="button" aria-label={`تعديل ${t.name}`} onClick={() => onEdit(t)} className="rounded-lg p-1.5 text-subtle hover:bg-navy-50 hover:text-navy-900">
              <Pencil size={15} />
            </button>
            <button type="button" aria-label={`حذف ${t.name}`} onClick={() => onDelete(t)} className="rounded-lg p-1.5 text-subtle hover:bg-rose-50 hover:text-rose-600">
              <Trash2 size={15} />
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ───────── نوافذ التحرير ───────── */

function NameDialog({
  title,
  label,
  placeholder,
  initial,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  placeholder: string;
  initial: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial);
  const valid = name.trim().length > 0 && name.trim() !== initial;
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={!valid || busy} onClick={() => onSubmit(name.trim())}>
            حفظ
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !busy) onSubmit(name.trim());
        }}
      >
        <LabeledControl label={label}>{(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={placeholder} maxLength={60} className="w-full" />}</LabeledControl>
      </form>
    </Modal>
  );
}

function SubjectDialog({
  dialog,
  branches,
  busy,
  onClose,
  onDelete,
  onSubmit,
}: {
  dialog: { id?: string; name: string; branchId: string };
  branches: Academics["branches"];
  busy: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onSubmit: (name: string, branchId: string) => void;
}) {
  const [name, setName] = useState(dialog.name);
  const [branchId, setBranchId] = useState(dialog.branchId);
  const valid = name.trim().length > 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={dialog.id ? "تعديل المادة" : "مادة جديدة"}
      footer={
        <>
          {onDelete && (
            <Button variant="ghost" className="me-auto text-rose-600" onClick={onDelete}>
              <Trash2 size={15} />
              حذف المادة
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button variant="primary" disabled={!valid || busy} onClick={() => onSubmit(name.trim(), branchId)}>
            {dialog.id ? "حفظ" : "إضافة"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <LabeledControl label="اسم المادة">{(id) => <Input id={id} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: الرياضيات" maxLength={80} className="w-full" />}</LabeledControl>
        {!dialog.id && (
          <LabeledControl label="الفرع">
            {(id) => (
              <Select id={id} value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full">
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            )}
          </LabeledControl>
        )}
      </div>
    </Modal>
  );
}

function TeacherDialog({
  teacher,
  subjects,
  branches,
  busy,
  onClose,
  onSubmit,
}: {
  teacher?: AcademicsTeacher;
  subjects: AcademicsSubject[];
  branches: Academics["branches"];
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: TeacherInput, photo: File | null) => void;
}) {
  const [form, setForm] = useState({
    name: teacher?.name ?? "",
    title: teacher?.title ?? "",
    bio: teacher?.bio ?? "",
    subjectId: teacher?.subjectId ?? "",
    years: teacher?.yearsOfExperience?.toString() ?? "",
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim() && form.title.trim() && form.bio.trim();
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  return (
    <Modal
      open
      onClose={onClose}
      title={teacher ? `تعديل ${teacher.name}` : "معلم جديد"}
      description="تظهر البطاقة في قسم «معلمو المنصة» بالصفحة الرئيسية للطلاب."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            variant="primary"
            disabled={!valid || busy}
            onClick={() =>
              onSubmit(
                {
                  name: form.name.trim(),
                  title: form.title.trim(),
                  bio: form.bio.trim(),
                  subjectId: form.subjectId || undefined,
                  yearsOfExperience: form.years ? Number(form.years) : undefined,
                },
                photo,
              )
            }
          >
            {teacher ? "حفظ" : "إضافة"}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <LabeledControl label="الاسم">{(id) => <Input id={id} value={form.name} onChange={set("name")} placeholder="أ. أمل محمود" className="w-full" dir="auto" />}</LabeledControl>
        <LabeledControl label="التخصص">{(id) => <Input id={id} value={form.title} onChange={set("title")} placeholder="معلمة رياضيات" className="w-full" dir="auto" />}</LabeledControl>
        <LabeledControl label="المادة">
          {(id) => (
            <Select id={id} value={form.subjectId} onChange={set("subjectId")} className="w-full">
              <option value="">— بلا مادة —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {branchName.get(s.branchId)}
                </option>
              ))}
            </Select>
          )}
        </LabeledControl>
        <LabeledControl label="سنوات الخبرة">{(id) => <Input id={id} type="number" min={0} max={60} value={form.years} onChange={set("years")} className="tabular w-full" dir="ltr" />}</LabeledControl>
        <div className="sm:col-span-2">
          <LabeledControl label="نبذة">{(id) => <Textarea id={id} rows={3} value={form.bio} onChange={set("bio")} className="w-full" dir="auto" />}</LabeledControl>
        </div>
        <div className="sm:col-span-2">
          <LabeledControl label="الصورة" hint="JPG أو PNG أو WebP، حتى 5 ميجابايت.">
            {(id) => (
              <input
                id={id}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-muted file:me-3 file:rounded-lg file:border-0 file:bg-navy-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-navy-900"
              />
            )}
          </LabeledControl>
        </div>
      </div>
    </Modal>
  );
}
