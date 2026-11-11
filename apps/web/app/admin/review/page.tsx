"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, FileText, Loader2, Pencil, SkipForward, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import EmptyState from "@/components/ui/EmptyState";
import { AdminPageHeader, Input, Kbd, LabeledControl, MathText, Select, Textarea } from "../_components/ui";
import { BLOOM_LABEL, DIFFICULTY_LABEL, type Bloom, type Difficulty } from "@/lib/bloom";
import {
  approveStaged,
  errorMessage,
  getSubjectUnits,
  listStaged,
  rejectStaged,
  updateStaged,
  type StagedQuestion,
} from "../_data/knowledge";

type Decision = "approved" | "rejected";

/** تصنيف المراجع — يبدأ من اقتراح النموذج */
interface Classification {
  difficulty: Difficulty;
  bloom: Bloom;
  unit: string;
}

const isRisky = (q: StagedQuestion) => q.confidence === null || q.confidence < 0.8 || q.flags.some((f) => f !== "بدون شرح");

export default function ReviewPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<StagedQuestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [classes, setClasses] = useState<Record<string, Classification>>({});
  const [units, setUnits] = useState<Record<string, string[]>>({});
  const [activeId, setActiveId] = useState<string | undefined>();
  const [editing, setEditing] = useState(false);
  const [fileFilter, setFileFilter] = useState("all");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    listStaged({ flaggedOnly: onlyFlagged || undefined })
      .then((r) => {
        setItems(r.data);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [onlyFlagged]);
  useEffect(load, [load]);

  const files = useMemo(() => Array.from(new Set((items ?? []).map((s) => s.examFile.originalName))), [items]);
  const pending = useMemo(
    () => (items ?? []).filter((q) => !decisions[q.id] && (fileFilter === "all" || q.examFile.originalName === fileFilter)),
    [items, decisions, fileFilter],
  );
  const active = pending.find((q) => q.id === activeId) ?? pending[0];
  const reviewed = Object.keys(decisions).length;

  // وحدات المادة (من عناوين الكتاب ووسوم البنك) — مرة لكل مادة
  const subjectId = active?.examFile.subjectId;
  useEffect(() => {
    if (!subjectId || units[subjectId]) return;
    getSubjectUnits(subjectId)
      .then((u) => setUnits((m) => ({ ...m, [subjectId]: u })))
      .catch(() => setUnits((m) => ({ ...m, [subjectId]: [] })));
  }, [subjectId, units]);

  const cls = useMemo<Classification | null>(
    () =>
      active
        ? (classes[active.id] ?? {
            difficulty: active.suggestedDifficulty ?? "MEDIUM",
            bloom: active.suggestedBloom ?? "UNDERSTAND",
            unit: active.suggestedUnit ?? "",
          })
        : null,
    [active, classes],
  );
  const unitOptions = useMemo(() => {
    const list = subjectId ? (units[subjectId] ?? []) : [];
    return cls?.unit && !list.includes(cls.unit) ? [cls.unit, ...list] : list;
  }, [subjectId, units, cls]);

  const decide = useCallback(
    async (d: Decision) => {
      if (!active || !cls || saving) return;
      const idx = pending.findIndex((q) => q.id === active.id);
      setSaving(true);
      try {
        if (d === "approved") {
          if (dirty.has(active.id)) {
            await updateStaged(active.id, {
              questionText: active.questionText,
              choices: active.choices,
              correctAnswer: active.correctAnswer,
              explanation: active.explanation,
            });
          }
          await approveStaged(active.id, { difficulty: cls.difficulty, bloomTaxonomy: cls.bloom, topicId: cls.unit || undefined });
        } else {
          await rejectStaged(active.id);
        }
        setDecisions((prev) => ({ ...prev, [active.id]: d }));
        setActiveId(pending[idx + 1]?.id ?? pending[idx - 1]?.id);
        setEditing(false);
        showToast({
          type: "success",
          message: d === "approved" ? `اعتُمد السؤال ${active.number ?? ""} وأُضيف للبنك.` : `رُفض السؤال ${active.number ?? ""}.`,
        });
      } catch (e) {
        showToast({ type: "error", message: errorMessage(e) });
        // سؤال انعالج من مراجع تاني — منحدّث القائمة
        if (/status/i.test(errorMessage(e))) load();
      } finally {
        setSaving(false);
      }
    },
    [active, cls, pending, dirty, saving, showToast, load],
  );

  const move = useCallback(
    (step: number) => {
      if (!active) return;
      const idx = pending.findIndex((q) => q.id === active.id);
      const next = pending[Math.max(0, Math.min(pending.length - 1, idx + step))];
      if (next) setActiveId(next.id);
    },
    [active, pending],
  );

  // اختصارات المراجعة السريعة — معطّلة وقت التحرير أو الكتابة بحقل
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (editing || e.ctrlKey || e.metaKey || /INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "a") void decide("approved");
      else if (k === "r") void decide("rejected");
      else if (k === "e") setEditing(true);
      else if (k === "j" || e.key === "ArrowDown") move(1);
      else if (k === "k" || e.key === "ArrowUp") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decide, move, editing]);

  function update(patch: Partial<StagedQuestion>) {
    if (!active) return;
    setItems((all) => (all ?? []).map((q) => (q.id === active.id ? { ...q, ...patch } : q)));
    setDirty((s) => new Set(s).add(active.id));
  }
  function classify(patch: Partial<Classification>) {
    if (!active || !cls) return;
    setClasses((m) => ({ ...m, [active.id]: { ...cls, ...patch } }));
  }

  return (
    <>
      <AdminPageHeader
        title="مراجعة الأسئلة المستخرجة"
        description="كل سؤال يستخرجه النموذج من ملف امتحان يمرّ من هنا قبل دخول البنك. راجع النص والإجابة والتصنيف، ثم اعتمد أو ارفض."
        actions={
          <div className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-2 text-[13px] text-muted shadow-card">
            <span>
              رُوجع <b className="tabular text-ink">{reviewed}</b> من <b className="tabular text-ink">{items?.length ?? 0}</b>
            </span>
            <span className="h-4 w-px bg-line" />
            <span className="hidden items-center gap-1.5 sm:flex">
              <Kbd>A</Kbd> اعتماد <Kbd>R</Kbd> رفض <Kbd>E</Kbd> تعديل <Kbd>J</Kbd>/<Kbd>K</Kbd> تنقّل
            </span>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ───── القائمة ───── */}
        <aside className="flex min-w-0 flex-col rounded-2xl border border-line bg-white shadow-card lg:sticky lg:top-24 lg:max-h-[calc(100dvh-8rem)]">
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <Select aria-label="الملف" value={fileFilter} onChange={(e) => setFileFilter(e.target.value)}>
              <option value="all">كل الملفات ({(items?.length ?? 0) - reviewed})</option>
              {files.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-2 px-1 text-[13px] text-ink">
              <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} className="h-4 w-4 accent-teal-600" />
              المشكوك فيها فقط (ثقة أقل من 0.8 أو تنبيهات)
            </label>
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {pending.map((q) => {
              const on = q.id === active?.id;
              const risky = isRisky(q);
              return (
                <li key={q.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(q.id);
                      setEditing(false);
                    }}
                    className={`w-full rounded-xl p-3 text-start transition-colors ${on ? "bg-navy-50 ring-1 ring-navy-200" : "hover:bg-canvas"}`}
                  >
                    <div className="mb-1 flex items-center gap-2 text-[11px] text-muted">
                      <span className="tabular font-semibold text-navy-900">س{q.number ?? "?"}</span>
                      <span>{q.examFile.subject.name}</span>
                      <span className="tabular">{q.examFile.year}</span>
                      <span className={`tabular ms-auto inline-flex items-center gap-1 font-semibold ${risky ? "text-amber-700" : "text-teal-700"}`}>
                        {risky && <TriangleAlert size={12} aria-hidden />}
                        {q.confidence !== null ? q.confidence.toFixed(2) : "—"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[13px] leading-6 text-ink">
                      <MathText>{q.questionText}</MathText>
                    </p>
                  </button>
                </li>
              );
            })}
            {items && pending.length === 0 && <li className="p-6 text-center text-sm text-muted">لا أسئلة متبقية بهذا الفلتر.</li>}
            {!items && !error && <li className="p-6 text-center text-sm text-muted">جارٍ التحميل…</li>}
          </ul>
        </aside>

        {/* ───── التفاصيل ───── */}
        {active && cls ? (
          <section className="min-w-0 rounded-2xl border border-line bg-white shadow-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-4 text-[13px] text-muted">
              <FileText size={15} className="text-rose-500" aria-hidden />
              <span dir="auto">{active.examFile.originalName}</span>
              <span>·</span>
              <span>السؤال {active.number ?? "?"}</span>
              <span className="ms-auto flex flex-wrap gap-1.5">
                {active.flags.map((f) => (
                  <span key={f} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                    <TriangleAlert size={12} aria-hidden />
                    {f}
                  </span>
                ))}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  ثقة النموذج <span className="tabular">{active.confidence !== null ? `${Math.round(active.confidence * 100)}%` : "—"}</span>
                </span>
              </span>
            </div>

            <div className="grid gap-8 p-6 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0">
                {editing ? (
                  <div className="flex flex-col gap-4">
                    <LabeledControl label="نص السؤال" hint="استخدم $...$ للمعادلات.">
                      {(id) => <Textarea id={id} rows={3} value={active.questionText} onChange={(e) => update({ questionText: e.target.value })} dir="auto" />}
                    </LabeledControl>
                    <fieldset className="flex flex-col gap-2">
                      <legend className="mb-1.5 text-[13px] font-medium text-navy-900">الخيارات — اختر الصحيح</legend>
                      {active.choices.map((c, i) => (
                        <div key={c.label} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="correct"
                            aria-label={`الخيار ${c.label} صحيح`}
                            checked={active.correctAnswer === c.label}
                            onChange={() => update({ correctAnswer: c.label })}
                            className="h-4 w-4 accent-teal-600"
                          />
                          <span className="w-5 text-sm font-semibold text-navy-900">{c.label}</span>
                          <Input
                            aria-label={`نص الخيار ${c.label}`}
                            value={c.text}
                            onChange={(e) => update({ choices: active.choices.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                            className="flex-1"
                            dir="auto"
                          />
                        </div>
                      ))}
                      {active.choices.length < 4 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="self-start"
                          onClick={() =>
                            update({
                              choices: [...active.choices, { label: "ABCD"[active.choices.length], text: "" }],
                              flags: active.flags.filter((f) => !f.includes("خيارات")),
                            })
                          }
                        >
                          + إضافة خيار
                        </Button>
                      )}
                    </fieldset>
                    <LabeledControl label="الشرح">
                      {(id) => <Textarea id={id} rows={2} value={active.explanation ?? ""} onChange={(e) => update({ explanation: e.target.value })} dir="auto" />}
                    </LabeledControl>
                  </div>
                ) : (
                  <>
                    <p className="text-[17px] leading-8 text-navy-900">
                      <MathText block>{active.questionText}</MathText>
                    </p>
                    <ul className="mt-5 flex flex-col gap-2">
                      {active.choices.map((c) => {
                        const right = c.label === active.correctAnswer;
                        return (
                          <li key={c.label} className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-[15px] ${right ? "border-teal-600 bg-teal-50/60" : "border-line"}`}>
                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${right ? "bg-teal-600 text-white" : "bg-canvas text-navy-900"}`}>
                              {c.label}
                            </span>
                            <MathText block className="flex-1">{c.text}</MathText>
                            {right && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                                <Check size={14} aria-hidden /> الإجابة
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    <div className="mt-5 rounded-xl bg-canvas p-4">
                      <p className="mb-1 text-xs font-semibold text-muted">الشرح</p>
                      {active.explanation ? (
                        <p className="text-sm leading-7 text-ink">
                          <MathText block>{active.explanation}</MathText>
                        </p>
                      ) : (
                        <p className="text-sm text-subtle">لم يُستخرج شرح لهذا السؤال.</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-4 xl:border-s xl:border-line xl:ps-6">
                <p className="text-[13px] font-semibold text-navy-900">التصنيف المقترح</p>
                <LabeledControl label="الصعوبة">
                  {(id) => (
                    <Select id={id} value={cls.difficulty} onChange={(e) => classify({ difficulty: e.target.value as Difficulty })}>
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
                    <Select id={id} value={cls.bloom} onChange={(e) => classify({ bloom: e.target.value as Bloom })}>
                      {Object.entries(BLOOM_LABEL).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </Select>
                  )}
                </LabeledControl>
                <LabeledControl label="الوحدة" hint={unitOptions.length ? undefined : "لا وحدات معروفة بعد — ارفع كتاب المادة، أو اكتبها يدوياً."}>
                  {(id) =>
                    unitOptions.length ? (
                      <Select id={id} value={cls.unit} onChange={(e) => classify({ unit: e.target.value })}>
                        <option value="">— بدون وحدة —</option>
                        {unitOptions.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </Select>
                    ) : (
                      <Input id={id} value={cls.unit} onChange={(e) => classify({ unit: e.target.value })} dir="auto" />
                    )
                  }
                </LabeledControl>
                <p className="text-xs leading-5 text-muted">عند الاعتماد يُضاف السؤال لبنك «{active.examFile.subject.name}» ويُرسل للتضمين تلقائياً.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/60 px-6 py-4">
              <Button variant="accent" onClick={() => void decide("approved")} disabled={saving}>
                {saving ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} />}
                اعتماد
              </Button>
              <Button variant="secondary" className="text-rose-700" onClick={() => void decide("rejected")} disabled={saving}>
                <X size={17} />
                رفض
              </Button>
              <Button variant="ghost" onClick={() => setEditing((e) => !e)}>
                <Pencil size={16} />
                {editing ? "إنهاء التعديل" : "تعديل"}
              </Button>
              <Button variant="ghost" className="ms-auto" onClick={() => move(1)}>
                تخطّي
                <SkipForward size={16} className="rotate-180" />
              </Button>
            </div>
          </section>
        ) : items ? (
          <EmptyState icon={ClipboardCheck} title="انتهت المراجعة" description="لا توجد أسئلة بانتظار المراجعة حالياً. ارفع ملفات امتحانات جديدة لتظهر هنا." actionHref="/admin/ingestion" actionLabel="رفع ملفات" />
        ) : null}
      </div>
    </>
  );
}
