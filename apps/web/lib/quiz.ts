"use client";
// سجل محاولات الكويزات — محفوظ محلياً لكل مستخدم (لا يوجد endpoint للنتائج بالباك اند حالياً)
import { useCallback, useEffect, useMemo } from "react";
import type { Difficulty, GeneratedQuestion } from "./api";
import { fetchWithAuth, readJson } from "./apiClient";
import { useAuth } from "@/context/AuthContext";
import { useLocalStore, useUserKey } from "./storage";

export interface QuizAttempt {
  id: string;
  subjectId: string;
  subjectName: string;
  difficulty: Difficulty | "MIXED";
  source: "GENERATED" | "CHAT" | "RETAKE";
  questions: GeneratedQuestion[];
  /** questionId → label المختار (null = بدون إجابة) */
  answers: Record<string, string | null>;
  correct: number;
  total: number;
  durationSec: number;
  finishedAt: string;
}

const MAX_ATTEMPTS = 60;
const EMPTY: QuizAttempt[] = [];

export const DIFFICULTY_LABELS: Record<Difficulty | "MIXED", string> = {
  EASY: "سهل",
  MEDIUM: "متوسط",
  HARD: "صعب",
  MIXED: "متنوع",
};

export const DIFFICULTY_STYLES: Record<Difficulty | "MIXED", string> = {
  EASY: "bg-teal-50 text-teal-800 ring-teal-700/15",
  MEDIUM: "bg-amber-50 text-amber-700 ring-amber-600/15",
  HARD: "bg-rose-50 text-rose-700 ring-rose-600/15",
  MIXED: "bg-navy-50 text-navy-800 ring-navy-900/10",
};

export function scorePercent(a: Pick<QuizAttempt, "correct" | "total">) {
  return a.total ? Math.round((a.correct / a.total) * 100) : 0;
}

export function scoreTone(percent: number) {
  // أخضر للممتاز، أزرق للجيد، كهرماني للمقبول، وردي لما يحتاج مراجعة
  if (percent >= 85) return { label: "ممتاز", text: "text-teal-700", bg: "bg-teal-600", soft: "bg-teal-50" };
  if (percent >= 70) return { label: "جيد جداً", text: "text-navy-600", bg: "bg-navy-500", soft: "bg-navy-50" };
  if (percent >= 50) return { label: "مقبول", text: "text-amber-600", bg: "bg-amber-500", soft: "bg-amber-50" };
  return { label: "يحتاج مراجعة", text: "text-rose-600", bg: "bg-rose-500", soft: "bg-rose-50" };
}

export function formatDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDate(iso: string, withTime = false) {
  return new Date(iso).toLocaleDateString("ar-EG-u-nu-latn", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
}

function dayKey(d: Date) {
  return d.toLocaleDateString("en-CA");
}

/** عدد الأيام المتتالية التي حُلّ فيها كويز. اليوم الحالي لا يكسر السلسلة إن لم يُحل فيه شيء بعد. */
export function computeStreak(attempts: Pick<QuizAttempt, "finishedAt">[]) {
  const days = new Set(attempts.map((a) => dayKey(new Date(a.finishedAt))));
  let streak = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function useQuizHistory() {
  const { user } = useAuth();
  const key = useUserKey("quizAttempts");
  const [attempts, setAttempts] = useLocalStore<QuizAttempt[]>(key, EMPTY);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function syncCloudAttempts() {
      try {
        const res = await fetchWithAuth("/questions/quiz-attempts");
        if (!res.ok) return;
        const cloudAttempts = await readJson<QuizAttempt[]>(res);
        if (cancelled || !cloudAttempts || !Array.isArray(cloudAttempts)) return;

        setAttempts((prev) => {
          const map = new Map<string, QuizAttempt>();
          for (const item of cloudAttempts) {
            map.set(item.id, item);
          }
          for (const item of prev) {
            const isDup = Array.from(map.values()).some(
              (c) =>
                c.id === item.id ||
                (c.subjectId === item.subjectId &&
                  Math.abs(new Date(c.finishedAt).getTime() - new Date(item.finishedAt).getTime()) < 10000),
            );
            if (!isDup && !map.has(item.id)) {
              map.set(item.id, item);
            }
          }
          return Array.from(map.values())
            .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt))
            .slice(0, MAX_ATTEMPTS);
        });
      } catch {
        // تجاهل أخطاء الشبكة أثناء وضع عدم الاتصال
      }
    }

    syncCloudAttempts();
    return () => {
      cancelled = true;
    };
  }, [user, setAttempts]);

  const sorted = useMemo(
    () => [...attempts].sort((a, b) => b.finishedAt.localeCompare(a.finishedAt)),
    [attempts],
  );

  const saveAttempt = useCallback(
    (attempt: QuizAttempt) => setAttempts((prev) => [attempt, ...prev].slice(0, MAX_ATTEMPTS)),
    [setAttempts],
  );

  const removeAttempt = useCallback(
    (id: string) => setAttempts((prev) => prev.filter((a) => a.id !== id)),
    [setAttempts],
  );

  const clearAll = useCallback(() => setAttempts([]), [setAttempts]);

  return { attempts: sorted, saveAttempt, removeAttempt, clearAll };
}

// تمرير أسئلة جاهزة بين الصفحات (من المحادثة أو إعادة محاولة) بدون استهلاك حصة التوليد
const HANDOFF_KEY = "quizHandoff";

export interface QuizHandoff {
  subjectId: string;
  subjectName: string;
  difficulty: Difficulty | "MIXED";
  source: QuizAttempt["source"];
  questions: GeneratedQuestion[];
}

export function setQuizHandoff(data: QuizHandoff) {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(data));
  } catch {
    // تجاهل
  }
}

export function takeQuizHandoff(): QuizHandoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(HANDOFF_KEY);
    return JSON.parse(raw) as QuizHandoff;
  } catch {
    return null;
  }
}

// ---------- مسودة الكويز النشط للحماية من انقطاع الاتصال أو إعادة التحميل ----------
const QUIZ_DRAFT_PREFIX = "quiz_active_draft_";
const PENDING_SYNC_KEY = "quiz_pending_cloud_sync";

export interface QuizDraft {
  answers: Record<string, string | null>;
  current: number;
  startedAt: number;
}

export function getStoredQuizDraft(quizKey: string): QuizDraft | null {
  if (typeof window === "undefined") return null;
  const key = `${QUIZ_DRAFT_PREFIX}${quizKey}`;
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as QuizDraft;
  } catch {
    return null;
  }
}

export function setStoredQuizDraft(quizKey: string, draft: QuizDraft): void {
  if (typeof window === "undefined") return;
  const key = `${QUIZ_DRAFT_PREFIX}${quizKey}`;
  const serialized = JSON.stringify(draft);
  try {
    localStorage.setItem(key, serialized);
  } catch {
    try {
      sessionStorage.setItem(key, serialized);
    } catch {
      // تجاهل امتلاء الحصة التخزينية
    }
  }
}

export function clearStoredQuizDraft(quizKey: string): void {
  if (typeof window === "undefined") return;
  const key = `${QUIZ_DRAFT_PREFIX}${quizKey}`;
  try {
    localStorage.removeItem(key);
  } catch {}
  try {
    sessionStorage.removeItem(key);
  } catch {}
}

export function queuePendingQuizSubmission(payload: unknown): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    const list = raw ? (JSON.parse(raw) as unknown[]) : [];
    list.push(payload);
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(list.slice(-10)));
  } catch {}
}

export async function flushPendingQuizSubmissions(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as unknown[];
    if (!Array.isArray(list) || list.length === 0) return;

    const remaining: unknown[] = [];
    for (const item of list) {
      try {
        const res = await fetchWithAuth("/questions/submit-quiz-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item),
        });
        if (!res.ok && res.status >= 500) {
          remaining.push(item);
        }
      } catch {
        remaining.push(item);
      }
    }

    if (remaining.length > 0) {
      localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify(remaining));
    } else {
      localStorage.removeItem(PENDING_SYNC_KEY);
    }
  } catch {}
}

// محاولة تفريغ طابور التسليمات المعلقة تلقائياً فور عودة اتصال الإنترنت
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    flushPendingQuizSubmissions();
  });
}

