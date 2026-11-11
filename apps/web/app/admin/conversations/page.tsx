"use client";
import { useCallback, useEffect, useState } from "react";
import { BookOpenText, Bot, FileText, Flag, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import RichText from "@/components/ui/RichText";
import Spinner from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/ToastProvider";
import { BarList } from "../_components/charts";
import { AdminPageHeader, Input, LabeledControl, Modal, Panel, SearchInput, Segmented, StatusPill, fmt } from "../_components/ui";
import { errorMessage } from "../_data/http";
import {
  INTENT_LABEL,
  ago,
  flagConversation,
  getConversationStats,
  getTranscript,
  listConversations,
  pct,
  type ConversationRow,
  type ConversationStats,
  type Transcript,
} from "../_data/platform";

type Filter = "all" | "flagged" | "errors" | "off_topic";

function seconds(ms: number | null | undefined) {
  return ms === null || ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} ث`;
}

export default function ConversationsPage() {
  const { showToast } = useToast();
  const [stats, setStats] = useState<ConversationStats | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);
  const [note, setNote] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    getConversationStats()
      .then(setStats)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const loadPage = useCallback(
    async (p: number) => {
      try {
        const r = await listConversations({ filter, q: query || undefined, page: p });
        setRows((prev) => (p === 1 ? r.items : [...(prev ?? []), ...r.items]));
        setTotal(r.total);
        setPage(p);
        setLoadError("");
        if (p === 1) setActiveId((cur) => (cur && r.items.some((x) => x.id === cur) ? cur : (r.items[0]?.id ?? null)));
      } catch (e) {
        setLoadError(errorMessage(e));
      }
    },
    [filter, query],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- جلب عند تغيّر الفلتر
    setRows(null);
    void loadPage(1);
  }, [loadPage]);

  useEffect(() => {
    if (!activeId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- محادثة جديدة
    setTranscript(null);
    getTranscript(activeId)
      .then((t) => alive && setTranscript(t))
      .catch((e) => showToast({ type: "error", message: errorMessage(e) }));
    return () => {
      alive = false;
    };
  }, [activeId, showToast]);

  async function setFlag(flagged: boolean, text?: string) {
    if (!transcript) return;
    try {
      const t = await flagConversation(transcript.id, flagged, text);
      setTranscript(t);
      setRows((rs) => rs?.map((r) => (r.id === t.id ? { ...r, flagged: t.flagged, flagNote: t.flagNote } : r)) ?? rs);
      setFlagOpen(false);
      setNote("");
      showToast({ type: "success", message: flagged ? "أُبلغ عن المحادثة." : "أُلغي البلاغ." });
    } catch (e) {
      showToast({ type: "error", message: errorMessage(e) });
    }
  }

  return (
    <>
      <AdminPageHeader title="المحادثات" description="راقب جودة ردود المساعد: ما الذي يطلبه الطلاب، أين يُرفضون، وأين يفشل التوليد." />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Panel title="نوايا الرسائل" description={`آخر ${stats?.days ?? 7} أيام`} className="lg:col-span-1">
          {!stats ? (
            <Spinner className="py-8" />
          ) : stats.intents.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">لا رسائل مصنّفة بعد.</p>
          ) : (
            <BarList tone="teal" items={stats.intents.map((i) => ({ label: INTENT_LABEL[i.intent] ?? i.intent, value: i.count }))} />
          )}
        </Panel>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          {(
            [
              ["رسائل الطلاب", stats ? fmt(stats.studentMessages) : "—", stats ? `في ${fmt(stats.sessions)} محادثة نشطة` : ""],
              ["نسبة الرفض (خارج المادة)", pct(stats?.offTopicRate), "من الرسائل المصنّفة"],
              ["ردود فاشلة", pct(stats?.errorRate), "حصة منتهية، لا مراجع، أو خطأ نموذج"],
              ["زمن الرد الوسيط", seconds(stats?.medianLatencyMs.generation), `الشرح: ${seconds(stats?.medianLatencyMs.answer)}`],
            ] as const
          ).map(([k, v, h]) => (
            <div key={k} className="rounded-2xl border border-line bg-white p-5 shadow-card">
              <p className="text-[13px] text-muted">{k}</p>
              <p className="tabular mt-1 text-2xl font-bold text-navy-900" dir="auto">
                {v}
              </p>
              <p className="mt-1 text-xs text-subtle">{h}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="flex max-h-[75vh] flex-col rounded-2xl border border-line bg-white shadow-card">
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <Segmented
              size="sm"
              label="تصفية"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "الكل" },
                { value: "flagged", label: "مُبلَّغ" },
                { value: "errors", label: "أخطاء" },
                { value: "off_topic", label: "مرفوضة" },
              ]}
            />
            <SearchInput placeholder="طالب أو نص رسالة…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="بحث في المحادثات" />
          </div>
          <ul className="flex-1 overflow-y-auto p-2">
            {loadError && <li className="p-4 text-sm text-rose-700">{loadError}</li>}
            {!rows && !loadError && <Spinner className="py-10" />}
            {rows?.length === 0 && <li className="py-10 text-center text-sm text-muted">لا محادثات.</li>}
            {rows?.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  aria-current={c.id === activeId}
                  className={`flex w-full items-start gap-3 rounded-xl p-3 text-start ${c.id === activeId ? "bg-navy-50 ring-1 ring-navy-200" : "hover:bg-canvas"}`}
                >
                  <Avatar name={c.student.name || c.student.email} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-navy-900">{c.student.name || c.student.email}</p>
                      <span className="shrink-0 text-[11px] text-subtle">{ago(c.updatedAt)}</span>
                    </div>
                    <p className="text-xs text-muted">
                      {c.subject.name} · <span className="tabular">{c.messages}</span> رسالة
                    </p>
                    {(c.flagged || c.errors > 0) && (
                      <p className="mt-1 flex gap-3 text-[11px] font-medium">
                        {c.flagged && (
                          <span className="inline-flex items-center gap-1 text-rose-600">
                            <Flag size={11} /> مُبلَّغ عنها
                          </span>
                        )}
                        {c.errors > 0 && <span className="text-amber-700">{c.errors} رد فاشل</span>}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
            {rows && rows.length < total && (
              <li className="p-2">
                <Button variant="ghost" size="sm" block onClick={() => void loadPage(page + 1)}>
                  عرض المزيد ({total - rows.length})
                </Button>
              </li>
            )}
          </ul>
        </aside>

        <section className="flex min-w-0 flex-col rounded-2xl border border-line bg-white shadow-card">
          {!activeId ? (
            <p className="p-12 text-center text-sm text-muted">اختر محادثة.</p>
          ) : !transcript ? (
            <Spinner className="py-24" />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy-900">
                    {transcript.student.name || transcript.student.email} — {transcript.subject.name}
                  </p>
                  <p className="text-xs text-muted">
                    بدأت {ago(transcript.createdAt)} · {transcript.isActive ? "نشطة" : "مغلقة"}
                  </p>
                </div>
                <Button size="sm" variant={transcript.flagged ? "secondary" : "ghost"} onClick={() => (transcript.flagged ? void setFlag(false) : setFlagOpen(true))}>
                  <Flag size={15} />
                  {transcript.flagged ? "إلغاء البلاغ" : "إبلاغ"}
                </Button>
              </div>
              {transcript.flagged && (
                <p className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-[13px] text-rose-800">
                  مُبلَّغ عنها {ago(transcript.flaggedAt)}
                  {transcript.flaggedBy && ` بواسطة ${transcript.flaggedBy.name || transcript.flaggedBy.email}`}
                  {transcript.flagNote && `: ${transcript.flagNote}`}
                </p>
              )}
              <ol className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto bg-canvas/50 p-5">
                {transcript.messages.map((m) =>
                  m.role === "STUDENT" ? (
                    <li key={m.id} className="flex flex-col items-start">
                      <div className="max-w-[80%] rounded-2xl rounded-ss-md bg-white px-4 py-2.5 text-[14px] leading-7 text-ink shadow-card">
                        {m.type === "FILE_UPLOAD" ? (
                          <span className="flex items-center gap-2">
                            <FileText size={15} /> {m.content}
                          </span>
                        ) : (
                          <RichText text={m.content} />
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-subtle">{ago(m.createdAt)}</p>
                    </li>
                  ) : (
                    <li key={m.id} className="flex flex-col items-end">
                      <div
                        className={`flex max-w-[85%] gap-2.5 rounded-2xl rounded-se-md px-4 py-2.5 text-[14px] leading-7 ${
                          m.type === "ERROR" ? "border border-rose-200 bg-rose-50 text-rose-900" : "bg-navy-900 text-white"
                        }`}
                      >
                        <Bot size={16} className={`mt-1.5 shrink-0 ${m.type === "ERROR" ? "text-rose-500" : "text-teal-300"}`} aria-hidden />
                        <div className="min-w-0 max-h-72 overflow-y-auto">
                          <RichText text={m.content} />
                        </div>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[11px] text-subtle">
                        {m.intent && (
                          <StatusPill tone={m.intent === "OFF_TOPIC" ? "error" : m.type === "ERROR" ? "warn" : "ok"} className="!py-0.5 !text-[11px]">
                            {INTENT_LABEL[m.intent] ?? m.intent}
                            {m.confidence !== null && ` · ${Math.round(m.confidence * 100)}%`}
                          </StatusPill>
                        )}
                        {m.questionCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <ListChecks size={12} /> {m.questionCount} أسئلة
                          </span>
                        )}
                        {m.sourceCount > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <BookOpenText size={12} /> {m.sourceCount} مقاطع من الكتاب
                          </span>
                        )}
                        <span>{ago(m.createdAt)}</span>
                      </p>
                    </li>
                  ),
                )}
              </ol>
            </>
          )}
        </section>
      </div>

      <Modal
        open={flagOpen}
        onClose={() => setFlagOpen(false)}
        title="إبلاغ عن المحادثة"
        description="تظهر في تبويب «مُبلَّغ» ليراجعها الفريق — لا يرى الطالب البلاغ."
        footer={
          <>
            <Button variant="secondary" onClick={() => setFlagOpen(false)}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={() => void setFlag(true, note)}>
              إبلاغ
            </Button>
          </>
        }
      >
        <LabeledControl label="ملاحظة (اختياري)">{(id) => <Input id={id} autoFocus value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="مثال: شرح خاطئ لقاعدة الاشتقاق" className="w-full" />}</LabeledControl>
      </Modal>
    </>
  );
}
