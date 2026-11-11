"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowUp,
  BookOpen,
  Bot,
  ChevronRight,
  FileText,
  ListChecks,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import SubjectGlyph from "@/components/ui/SubjectGlyph";
import RichText from "@/components/ui/RichText";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  closeChatSession,
  createChatSession,
  describeError,
  getChatSession,
  listChatSessions,
  sendChatMessage,
  uploadChatFile,
  ApiError,
  type ChatMessage,
  type ChatSession,
  type ChatSource,
} from "@/lib/api";
import QuotaExceededModal from "@/components/subscriptions/QuotaExceededModal";
import { useBranchSubjects } from "@/lib/subjects";
import { setQuizHandoff } from "@/lib/quiz";
import { toPlainText } from "@/lib/richText";

const SUGGESTIONS = [
  "أريد 5 أسئلة متوسطة في أول وحدة",
  "أعطني أسئلة أصعب",
  "أسئلة مشابهة لامتحان التوجيهي 2023",
  "المزيد من الأسئلة",
];

const ACCEPTED_FILES = "application/pdf,image/png,image/jpeg,image/webp,image/gif";

export default function AiPathPage() {
  return (
    <AppShell bare>
      <Suspense
        fallback={<Spinner className="min-h-[60vh]" />}
      >
        <AiChat />
      </Suspense>
    </AppShell>
  );
}

function AiChat() {
  const params = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();
  const { subjects, isLoading: subjectsLoading } = useBranchSubjects();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [active, setActive] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingSession, setLoadingSession] = useState(false);
  const [sending, setSending] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(0);
  const [isAnalyzingFile, setIsAnalyzingFile] = useState(false);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [quotaModalOpen, setQuotaModalOpen] = useState(false);
  const [quotaModalMessage, setQuotaModalMessage] = useState<string | undefined>();
  const [quotaModalResetAt, setQuotaModalResetAt] = useState<string | undefined>();

  useEffect(() => {
    if (!sending) {
      setThinkingStep(0);
      return;
    }
    const t1 = setTimeout(() => setThinkingStep(1), 2000);
    const t2 = setTimeout(() => setThinkingStep(2), 4800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [sending]);

  const thinkingText = useMemo(() => {
    if (isAnalyzingFile) {
      if (thinkingStep === 0) return "جاري قراءة الملف المرفق واستخراج النصوص...";
      if (thinkingStep === 1) return "جاري البحث في مراجع المنهاج وتصنيف الأسئلة...";
      return "جاري صياغة الشرح والحل النموذجي...";
    }
    if (thinkingStep === 0) return "جاري تحليل السؤال والبحث في المنهاج الوزاري...";
    if (thinkingStep === 1) return "جاري مراجعة المعايير وتنظيم الأفكار التعليمية...";
    return "جاري صياغة الإجابة النموذجية بدقة...";
  }, [isAnalyzingFile, thinkingStep]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const openedFromParam = useRef(false);

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listChatSessions());
    } catch {
      // القائمة الجانبية ليست حرجة
    }
  }, []);

  const openSession = useCallback(
    async (subjectId: string) => {
      setLoadingSession(true);
      setError("");
      setSidebarOpen(false);
      try {
        const created = await createChatSession(subjectId);
        const full = await getChatSession(created.id);
        setActive(full);
        setMessages(full.messages ?? []);
        router.replace(`/ai-path?subject=${subjectId}`, { scroll: false });
        refreshSessions();
      } catch (err) {
        showToast({ type: "error", message: describeError(err) });
      } finally {
        setLoadingSession(false);
      }
    },
    [refreshSessions, router, showToast],
  );

  async function viewSession(id: string) {
    setLoadingSession(true);
    setError("");
    setSidebarOpen(false);
    try {
      const full = await getChatSession(id);
      setActive(full);
      setMessages(full.messages ?? []);
      router.replace(full.isActive ? `/ai-path?subject=${full.subjectId}` : "/ai-path", { scroll: false });
    } catch (err) {
      showToast({ type: "error", message: describeError(err) });
    } finally {
      setLoadingSession(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- جلب أولي من الباك اند
    refreshSessions();
  }, [refreshSessions]);

  // فتح محادثة المادة القادمة من الرابط (?subject=)
  useEffect(() => {
    const subjectId = params.get("subject");
    if (subjectId && !openedFromParam.current) {
      openedFromParam.current = true;
      openSession(subjectId);
    }
  }, [params, openSession]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send(text?: string) {
    if (!active || sending) return;
    const content = (text ?? input).trim();
    if (!content && !file) return;

    setError("");
    setSending(true);
    const pendingFile = file;
    setIsAnalyzingFile(Boolean(pendingFile));
    setInput("");
    setFile(null);
    if (textareaRef.current) textareaRef.current.style.height = "";

    const optimistic: ChatMessage = pendingFile
      ? { role: "STUDENT", type: "FILE_UPLOAD", content: pendingFile.name, fileMimeType: pendingFile.type }
      : { role: "STUDENT", type: "TEXT", content };
    setMessages((m) => [...m, optimistic]);

    try {
      const reply = pendingFile ? await uploadChatFile(active.id, pendingFile) : await sendChatMessage(active.id, content);
      setMessages((m) => [...m, { ...reply, createdAt: new Date().toISOString() }]);
      refreshSessions();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setQuotaModalMessage(err.message);
        setQuotaModalResetAt(err.payload?.resetAt);
        setQuotaModalOpen(true);
      }
      setError(describeError(err));
      setMessages((m) => m.slice(0, -1));
      if (!pendingFile) setInput(content);
    } finally {
      setSending(false);
      setIsAnalyzingFile(false);
    }
  }

  async function closeActive() {
    if (!active) return;
    try {
      await closeChatSession(active.id);
      showToast({ type: "success", message: "تم إغلاق المحادثة وحفظ رسائلها" });
      setActive(null);
      setMessages([]);
      router.replace("/ai-path", { scroll: false });
      refreshSessions();
    } catch (err) {
      showToast({ type: "error", message: describeError(err) });
    }
  }

  function practiceQuestions(msg: ChatMessage) {
    const questions = msg.metadata?.questions;
    if (!active || !questions?.length) return;
    setQuizHandoff({
      subjectId: active.subjectId,
      subjectName: active.subject.name,
      difficulty: "MIXED",
      source: "CHAT",
      questions,
    });
    router.push("/quizzes?from=chat");
  }


  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-line p-4">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
          <MessageSquarePlus size={17} />
          محادثة جديدة حسب المادة
        </p>
        {subjectsLoading ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-canvas" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openSession(s.id)}
                disabled={loadingSession}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-start text-xs font-semibold transition-colors disabled:opacity-60 ${
                  active?.subjectId === s.id
                    ? "border-teal-600 bg-teal-50 text-teal-800"
                    : "border-line text-ink hover:border-navy-200 hover:bg-canvas"
                }`}
              >
                <SubjectGlyph name={s.name} size="sm" tone={active?.subjectId === s.id ? "teal" : "navy"} />
                <span className="truncate">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <p className="mb-3 text-xs font-semibold text-subtle">المحادثات السابقة</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted">لا توجد محادثات بعد</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => viewSession(s.id)}
                  className={`w-full rounded-lg p-3 text-start transition-colors ${
                    active?.id === s.id ? "bg-navy-50" : "hover:bg-canvas"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold text-navy-900">{s.subject.name}</span>
                    {!s.isActive && <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-[10px] text-muted">مغلقة</span>}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-muted">
                    {s.messages?.[0] ? toPlainText(s.messages[0].content) : "..."}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <>
      <QuotaExceededModal
        isOpen={quotaModalOpen}
        onClose={() => setQuotaModalOpen(false)}
        feature="chat"
        message={quotaModalMessage}
        resetAt={quotaModalResetAt}
      />
      <div className="mx-auto flex h-[calc(100dvh-4rem)] max-w-7xl gap-0 px-0 sm:px-4 sm:py-4 lg:h-[calc(100dvh-72px)] lg:gap-4 lg:px-8">
      {/* الشريط الجانبي — ديسكتوب */}
      <aside className="hidden w-80 shrink-0 overflow-hidden rounded-2xl border border-line bg-white shadow-card lg:block">{sidebar}</aside>

      {/* الشريط الجانبي — موبايل */}
      <div
        className={`fixed inset-0 z-50 bg-navy-950/40 backdrop-blur-[2px] transition-opacity lg:hidden ${sidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        inert={!sidebarOpen}
        className={`fixed inset-y-0 start-0 z-50 w-[85%] max-w-sm bg-white shadow-float transition-transform duration-300 lg:hidden ${
          sidebarOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          aria-label="إغلاق"
          className="absolute end-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-lg bg-canvas text-muted"
        >
          <X size={18} />
        </button>
        {sidebar}
      </aside>

      {/* نافذة المحادثة */}
      <section className="flex min-w-0 flex-1 flex-col overflow-hidden border-line bg-white sm:rounded-2xl sm:border sm:shadow-card">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="المواد والمحادثات"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-navy-900 lg:hidden"
          >
            <ChevronRight size={20} />
          </button>
          <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-navy-900 text-white">
            <Bot size={22} strokeWidth={1.75} />
            <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-white bg-teal-400" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-navy-900">مسار التميز AI</p>
            <p className="truncate text-xs text-muted">
              {active ? `مساعدك في مادة ${active.subject.name}` : "اختر مادة لبدء المحادثة"}
            </p>
          </div>
          {active?.isActive && (
            <button
              type="button"
              onClick={closeActive}
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-rose-50 hover:text-rose-600"
            >
              إغلاق المحادثة
            </button>
          )}
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-canvas px-4 py-6 sm:px-8">
          {loadingSession ? (
            <Spinner className="h-full" />
          ) : !active ? (
            <Welcome
              subjects={subjects}
              onPick={openSession}
              onOpenSidebar={() => setSidebarOpen(true)}
            />
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-5">
              {messages.map((m, i) => (
                <MessageBubble
                  key={m.id ?? `local-${i}`}
                  message={m}
                  subjectName={active.subject.name}
                  onPractice={() => practiceQuestions(m)}
                />
              ))}
              {sending && (
                <div className="flex items-end gap-2.5">
                  <BotAvatar />
                  <div
                    className="flex flex-col gap-2 rounded-2xl rounded-es-md border border-teal-100 bg-white px-4 py-3 shadow-xs"
                    role="status"
                    aria-label="المساعد يكتب"
                  >
                    <div className="flex items-center gap-2 text-xs font-medium text-teal-800">
                      <Sparkles size={14} className="animate-spin text-teal-600 shrink-0" />
                      <span>{thinkingText}</span>
                    </div>
                    <div className="flex items-center gap-1.5 pe-1">
                      {[0, 150, 300].map((d) => (
                        <span
                          key={d}
                          className="h-1.5 w-1.5 animate-bounce rounded-full bg-teal-500"
                          style={{ animationDelay: `${d}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {active && (
          <footer className="border-t border-line bg-white px-3 py-3 sm:px-6 sm:py-4">
            {error && (
              <p role="alert" className="mx-auto mb-3 flex max-w-3xl items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertCircle size={14} />
                {error}
              </p>
            )}

            {!active.isActive ? (
              <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-xl bg-canvas p-3 text-sm text-muted">
                هذه المحادثة مغلقة
                <button
                  type="button"
                  onClick={() => openSession(active.subjectId)}
                  className="rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white hover:bg-navy-800"
                >
                  محادثة جديدة
                </button>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl">
                {messages.length <= 1 && !sending && (
                  <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => send(s)}
                        className="shrink-0 rounded-full border border-line bg-white px-3.5 py-1.5 text-xs text-ink transition-colors hover:border-teal-600 hover:bg-teal-50 hover:text-teal-800"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}

                {file && (
                  <div className="mb-2 inline-flex items-center gap-2 rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-900">
                    <FileText size={15} />
                    <span className="max-w-[200px] truncate">{file.name}</span>
                    <button type="button" onClick={() => setFile(null)} aria-label="إزالة الملف" className="text-subtle hover:text-rose-600">
                      <X size={14} />
                    </button>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send();
                  }}
                  className="flex items-end gap-2 rounded-2xl border border-line bg-white p-1.5 transition-[border-color,box-shadow] focus-within:border-teal-600 focus-within:ring-4 focus-within:ring-teal-600/10"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept={ACCEPTED_FILES}
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f && f.size > 15 * 1024 * 1024) {
                        showToast({ type: "error", message: "حجم الملف يجب ألا يتجاوز 15 ميجابايت" });
                      } else if (f) {
                        setFile(f);
                      }
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    aria-label="إرفاق ملف امتحان (PDF أو صورة)"
                    title="إرفاق ملف امتحان (PDF أو صورة)"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-subtle transition-colors hover:bg-canvas hover:text-navy-900"
                  >
                    <Paperclip size={19} />
                  </button>
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      e.target.style.height = "";
                      e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    rows={1}
                    maxLength={2000}
                    placeholder={file ? "اضغط إرسال لتحليل الملف..." : "اكتب سؤالك أو اطلب أسئلة تدريبية..."}
                    disabled={sending || !!file}
                    aria-label="رسالتك"
                    className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] leading-6 outline-none placeholder:text-subtle disabled:cursor-not-allowed"
                  />
                  <button
                    type="submit"
                    disabled={sending || (!input.trim() && !file)}
                    aria-label="إرسال"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white transition-colors hover:bg-navy-800 disabled:bg-canvas disabled:text-subtle"
                  >
                    {sending ? <Loader2 size={18} className="animate-spin" /> : <ArrowUp size={19} />}
                  </button>
                </form>
                <p className="mt-2 hidden text-center text-[11px] text-subtle sm:block">
                  Enter للإرسال · Shift+Enter لسطر جديد · يمكنك إرفاق امتحان سابق (PDF/صورة) لتوليد أسئلة مشابهة
                </p>
              </div>
            )}
          </footer>
        )}
      </section>
    </div>
    </>
  );
}

function Welcome({
  subjects,
  onPick,
  onOpenSidebar,
}: {
  subjects: ReturnType<typeof useBranchSubjects>["subjects"];
  onPick: (id: string) => void;
  onOpenSidebar: () => void;
}) {
  const { user } = useAuth();
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center py-8 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy-900 text-white shadow-raised">
        <Bot size={30} strokeWidth={1.5} />
      </span>
      <span className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 ring-1 ring-inset ring-teal-700/15">
        <Sparkles size={13} />
        مسار التميز AI
      </span>
      <h1 className="mt-4 text-2xl font-bold text-navy-900 sm:text-[28px]">أهلاً {user?.name?.split(" ")[0] ?? "بك"}، بماذا أساعدك اليوم؟</h1>
      <p className="mt-3 max-w-md text-[15px] leading-7 text-muted">
        اختر المادة وابدأ المحادثة: اطلب أسئلة تدريبية بمستوى معيّن، أو ارفع امتحاناً سابقاً لتحصل على أسئلة مشابهة مع الحلول والشروحات.
      </p>

      <div className="mt-8 grid w-full grid-cols-2 gap-3 sm:grid-cols-3">
        {subjects.slice(0, 6).map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s.id)}
            className="flex items-center gap-3 rounded-xl border border-line bg-white p-3 text-start transition-colors hover:border-navy-200 hover:bg-white/60"
          >
            <SubjectGlyph name={s.name} size="sm" />
            <span className="text-sm font-semibold text-navy-900">{s.name}</span>
          </button>
        ))}
      </div>
      {subjects.length > 6 && (
        <button type="button" onClick={onOpenSidebar} className="mt-4 text-sm font-semibold text-teal-700 hover:underline lg:hidden">
          عرض كل المواد
        </button>
      )}
    </div>
  );
}

function BotAvatar() {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-navy-900 text-white" aria-hidden>
      <Bot size={16} strokeWidth={1.75} />
    </span>
  );
}

/** صفحات الكتاب يلي انبنى عليها الرد — مجمّعة لكل كتاب ومرتبة */
function Sources({ sources }: { sources: ChatSource[] }) {
  const byBook = new Map<string, ChatSource[]>();
  for (const s of sources) byBook.set(s.title, [...(byBook.get(s.title) ?? []), s]);

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-subtle">
        <BookOpen size={13} />
        من الكتاب المدرسي
      </p>
      <ul className="flex flex-col gap-1">
        {[...byBook.entries()].map(([title, list]) => {
          const pages = [...new Set(
            [...list]
              .sort((a, b) => a.pageStart - b.pageStart)
              .map((s) => (s.pageEnd !== s.pageStart ? `${s.pageStart}–${s.pageEnd}` : `${s.pageStart}`)),
          )];
          return (
            <li key={title} className="text-xs leading-5 text-muted">
              <span className="font-medium text-ink">{title}</span>
              {" · "}
              {pages.length > 1 ? "الصفحات" : "صفحة"} {pages.join("، ")}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MessageBubble({
  message,
  subjectName,
  onPractice,
}: {
  message: ChatMessage;
  subjectName: string;
  onPractice: () => void;
}) {
  const isStudent = message.role === "STUDENT";
  const questions = message.metadata?.questions;
  const time = message.createdAt ? new Date(message.createdAt).toLocaleTimeString("ar-EG-u-nu-latn", { hour: "numeric", minute: "2-digit" }) : "";

  // الطالب بجهة البداية (يمين)، والمساعد مقابله — مثل تطبيقات المراسلة العربية
  if (isStudent) {
    return (
      <div className="flex animate-toast-in justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-ss-md bg-navy-900 px-4 py-2.5 text-white sm:max-w-[75%]">
          {message.type === "FILE_UPLOAD" ? (
            <p className="flex items-center gap-2 text-sm">
              <FileText size={16} />
              {message.content}
            </p>
          ) : (
            <p dir="auto" className="whitespace-pre-wrap break-words text-[15px] leading-7">
              {message.content}
            </p>
          )}
          {time && <p className="mt-1 text-end text-[10px] text-white/50">{time}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex animate-toast-in items-end justify-end gap-2.5">
      <div
        className={`max-w-[90%] rounded-2xl rounded-ee-md border px-4 py-3 sm:max-w-[80%] ${
          message.type === "ERROR" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-line bg-white text-ink"
        }`}
      >
        {questions?.length ? (
          <div>
            <div className="mb-3 flex items-center gap-3">
              <SubjectGlyph name={subjectName} size="sm" />
              <div>
                <p className="font-semibold text-navy-900">جهّزت لك {questions.length} أسئلة تدريبية</p>
                <p className="text-xs text-muted">حلّها بشكل تفاعلي واحصل على تصحيح فوري</p>
              </div>
            </div>
            <ol className="mb-4 flex flex-col gap-2">
              {questions.slice(0, 3).map((q, i) => (
                <li key={q.id ?? i} className="line-clamp-2 rounded-lg bg-canvas px-3 py-2 text-[13px] leading-6 text-ink">
                  <b className="font-semibold text-navy-900">{i + 1}.</b> <RichText text={q.questionText} inline />
                </li>
              ))}
              {questions.length > 3 && <li className="text-center text-xs text-muted">+ {questions.length - 3} أسئلة أخرى</li>}
            </ol>
            <button
              type="button"
              onClick={onPractice}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-navy-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-800"
            >
              <ListChecks size={16} />
              حلّها ككويز تفاعلي
            </button>
          </div>
        ) : (
          <RichText text={message.content} className="text-[15px] leading-7" />
        )}
        {message.metadata?.sources?.length ? <Sources sources={message.metadata.sources} /> : null}
        {time && <p className="mt-1 text-[10px] text-subtle">{time}</p>}
      </div>
      <BotAvatar />
    </div>
  );
}
