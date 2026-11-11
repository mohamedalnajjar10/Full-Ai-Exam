"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, Check, ChevronLeft, Pause, Play, Plus, RotateCcw, Target, Timer, Trash2 } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import PageHeader from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { inputClass } from "@/components/ui/Field";
import ScoreRing from "@/components/quiz/ScoreRing";
import { useQuizHistory } from "@/lib/quiz";
import { todayKey, useDailyPlan } from "@/lib/dailyPlan";

export default function DailyPlanPage() {
  return (
    <AppShell>
      <DailyPlan />
    </AppShell>
  );
}

function DailyPlan() {
  const { attempts } = useQuizHistory();
  const { plan, today, day, tasks, isDone, toggle, updateDay, isLoading, total, completed, percent, minutesLeft } = useDailyPlan();
  const [newTask, setNewTask] = useState("");

  function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const text = newTask.trim();
    if (!text) return;
    updateDay((d) => ({ ...d, custom: [...d.custom, { id: crypto.randomUUID(), text, done: false }] }));
    setNewTask("");
  }

  // نشاط آخر 7 أيام
  const week = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = todayKey(d);
    const saved = plan[key];
    return {
      key,
      label: d.toLocaleDateString("ar-EG-u-nu-latn", { weekday: "short" }),
      num: d.getDate(),
      active:
        attempts.some((a) => todayKey(new Date(a.finishedAt)) === key) ||
        (saved?.done.length ?? 0) > 0 ||
        (saved?.custom.some((c) => c.done) ?? false),
      isToday: key === today,
    };
  });

  const dateLabel = new Date().toLocaleDateString("ar-EG-u-nu-latn", { weekday: "long", day: "numeric", month: "long" });

  const check = (done: boolean) =>
    `flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
      done ? "border-teal-600 bg-teal-600 text-white" : "border-navy-200 hover:border-teal-600"
    }`;

  return (
    <>
      <PageHeader
        eyebrow={dateLabel}
        icon={CalendarCheck}
        title="خطة اليوم"
        description="خطة دراسية تتجدد يومياً وتركّز على المواد التي تحتاجها أكثر، مع مؤقت تركيز ومهام خاصة بك."
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <ol aria-label="نشاط الأسبوع" className="grid grid-cols-7 gap-1.5 rounded-2xl border border-line bg-white p-2 shadow-card sm:gap-2 sm:p-3">
            {week.map((d) => (
              <li
                key={d.key}
                aria-current={d.isToday ? "date" : undefined}
                className={`flex flex-col items-center gap-1 rounded-xl py-2.5 text-center ${d.isToday ? "bg-navy-900 text-white" : "text-muted"}`}
              >
                <span className="text-[11px]">{d.label}</span>
                <span className="text-base font-semibold tabular">{d.num}</span>
                <span
                  className={`h-1.5 w-1.5 rounded-full ${d.active ? (d.isToday ? "bg-teal-300" : "bg-teal-600") : d.isToday ? "bg-white/30" : "bg-line"}`}
                  aria-label={d.active ? "يوم نشط" : undefined}
                />
              </li>
            ))}
          </ol>

          <Card>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-navy-900">مهام اليوم</h2>
              <span className="text-sm text-muted tabular">
                {completed}/{total} مكتملة
              </span>
            </div>

            {isLoading ? (
              <div className="flex flex-col gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-canvas" />
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {tasks.map((t) => {
                  const done = isDone(t);
                  const Icon = t.icon;
                  return (
                    <li
                      key={t.id}
                      className={`flex items-center gap-3 rounded-xl border p-3.5 transition-colors sm:gap-4 ${
                        done ? "border-teal-100 bg-teal-50/40" : "border-line hover:border-navy-200"
                      }`}
                    >
                      <button type="button" onClick={() => toggle(t.id)} aria-pressed={done} aria-label={done ? `إلغاء إكمال: ${t.title}` : `تعليم كمكتملة: ${t.title}`} className={check(done)}>
                        {done && <Check size={13} strokeWidth={3} />}
                      </button>
                      <span className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg sm:flex ${done ? "bg-teal-50 text-teal-700" : "bg-navy-50 text-navy-900"}`}>
                        <Icon size={18} strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm font-semibold ${done ? "text-subtle line-through" : "text-navy-900"}`}>{t.title}</p>
                        <p className="text-xs text-muted">
                          {t.hint} · {t.minutes} دقيقة
                        </p>
                      </div>
                      {t.href && !done && (
                        <Link
                          href={t.href}
                          className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-3 py-1.5 text-xs font-semibold text-navy-900 transition-colors hover:border-navy-900 hover:bg-navy-900 hover:text-white"
                        >
                          ابدأ
                          <ChevronLeft size={14} />
                        </Link>
                      )}
                    </li>
                  );
                })}

                {day.custom.map((c) => (
                  <li
                    key={c.id}
                    className={`group flex items-center gap-3 rounded-xl border p-3.5 sm:gap-4 ${c.done ? "border-teal-100 bg-teal-50/40" : "border-dashed border-navy-200"}`}
                  >
                    <button
                      type="button"
                      onClick={() => updateDay((d) => ({ ...d, custom: d.custom.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) }))}
                      aria-pressed={c.done}
                      aria-label={c.done ? `إلغاء إكمال: ${c.text}` : `تعليم كمكتملة: ${c.text}`}
                      className={check(c.done)}
                    >
                      {c.done && <Check size={13} strokeWidth={3} />}
                    </button>
                    <p className={`flex-1 text-sm font-medium ${c.done ? "text-subtle line-through" : "text-ink"}`}>{c.text}</p>
                    <button
                      type="button"
                      onClick={() => updateDay((d) => ({ ...d, custom: d.custom.filter((x) => x.id !== c.id) }))}
                      aria-label={`حذف المهمة: ${c.text}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-rose-50 hover:text-rose-600 sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                    >
                      <Trash2 size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form onSubmit={addCustom} className="mt-5 flex gap-2">
              <label className="sr-only" htmlFor="new-task">
                مهمة جديدة
              </label>
              <input
                id="new-task"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
                maxLength={120}
                placeholder="أضف مهمة خاصة بك… (مثلاً: حل ورقة عمل الفيزياء)"
                className={inputClass(false, "h-11 flex-1")}
              />
              <Button type="submit" variant="accent" size="icon" disabled={!newTask.trim()} aria-label="إضافة مهمة">
                <Plus size={20} />
              </Button>
            </form>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card className="flex flex-col items-center text-center">
            <ScoreRing percent={percent} size={150} stroke={13} label="من خطة اليوم" />
            <p className="mt-4 text-sm font-semibold text-navy-900">
              {percent === 100 ? "أنجزت خطة اليوم بالكامل!" : percent >= 50 ? "أكثر من النصف — واصل!" : "لنبدأ يوماً منتجاً"}
            </p>
            {minutesLeft > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                <Target size={13} />
                متبقٍ حوالي {minutesLeft} دقيقة من المهام المقترحة
              </p>
            )}
          </Card>
          <FocusTimer />
        </aside>
      </div>
    </>
  );
}

const MODES = {
  focus: { label: "تركيز", seconds: 25 * 60 },
  break: { label: "استراحة", seconds: 5 * 60 },
} as const;

function FocusTimer() {
  const [mode, setMode] = useState<keyof typeof MODES>("focus");
  const [left, setLeft] = useState<number>(MODES.focus.seconds);
  const [running, setRunning] = useState(false);
  const [sessions, setSessions] = useState(0);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (left > 0 || !running) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- انتهاء الجولة يبدّل الوضع
    setRunning(false);
    if (mode === "focus") setSessions((s) => s + 1);
    const next = mode === "focus" ? "break" : "focus";
    setMode(next);
    setLeft(MODES[next].seconds);
  }, [left, running, mode]);

  function switchMode(m: keyof typeof MODES) {
    setMode(m);
    setRunning(false);
    setLeft(MODES[m].seconds);
  }

  const total = MODES[mode].seconds;
  const progress = ((total - left) / total) * 100;
  const mm = Math.floor(left / 60).toString().padStart(2, "0");
  const ss = (left % 60).toString().padStart(2, "0");

  return (
    <div className="rounded-2xl bg-navy-900 p-6 text-white shadow-raised">
      <div className="mb-5 flex items-center justify-between">
        <p className="flex items-center gap-2 font-semibold">
          <Timer size={18} />
          مؤقت التركيز
        </p>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] tabular">{sessions} جلسة اليوم</span>
      </div>

      <div role="tablist" aria-label="نوع الجولة" className="flex rounded-xl bg-white/10 p-1">
        {(Object.keys(MODES) as (keyof typeof MODES)[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => switchMode(m)}
            className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${mode === m ? "bg-white text-navy-900" : "text-white/70 hover:text-white"}`}
          >
            {MODES[m].label}
          </button>
        ))}
      </div>

      <p className="my-6 text-center text-6xl font-semibold tracking-wider tabular" dir="ltr" aria-live="off">
        {mm}:{ss}
      </p>

      <div className="mb-6 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-teal-400 transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex gap-3">
        <Button variant="accent" size="lg" onClick={() => setRunning((r) => !r)} className="flex-1">
          {running ? <Pause size={17} /> : <Play size={17} />}
          {running ? "إيقاف مؤقت" : "ابدأ"}
        </Button>
        <Button variant="inverse-outline" size="icon-lg" onClick={() => switchMode(mode)} aria-label="إعادة ضبط">
          <RotateCcw size={17} />
        </Button>
      </div>
    </div>
  );
}
