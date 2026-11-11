"use client";
// خطة اليوم: مهام مقترحة حسب المواد الأضعف + مهام الطالب الخاصة.
// كانت كلها جوا صفحة /daily-plan؛ هلق hook مشترك حتى اللوحة الرئيسية
// تعرض نفس الخطة بدون ما تنسخ المنطق.
import { useCallback, useEffect, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { BookOpen, Bot, ListChecks, RotateCcw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { fetchWithAuth, readJson } from "./apiClient";
import { useBranchSubjects } from "./subjects";
import { scorePercent, useQuizHistory } from "./quiz";
import { readStore, useLocalStore, useUserKey } from "./storage";

export interface DayState {
  done: string[];
  custom: { id: string; text: string; done: boolean }[];
}
type PlanStore = Record<string, DayState>;

export interface PlanTask {
  id: string;
  title: string;
  hint: string;
  href?: string;
  icon: LucideIcon;
  minutes: number;
  /** مهمة الكويز بتنعلّم لحالها لما يُحل كويز بهاي المادة اليوم */
  auto?: boolean;
}

const EMPTY_PLAN: PlanStore = {};
const EMPTY_DAY: DayState = { done: [], custom: [] };

export function todayKey(d = new Date()) {
  return d.toLocaleDateString("en-CA");
}

function dayOfYear(d = new Date()) {
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

export function useDailyPlan() {
  const { user } = useAuth();
  const { subjects, isLoading } = useBranchSubjects();
  const { attempts } = useQuizHistory();
  const storeKey = useUserKey("dailyPlan");
  const [plan, setPlan] = useLocalStore<PlanStore>(storeKey, EMPTY_PLAN);

  // مزامنة الخطة السحابية عند تسجيل الدخول
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function syncCloudPlan() {
      try {
        const res = await fetchWithAuth("/questions/daily-plan");
        if (!res.ok) return;
        const cloudPlan = await readJson<PlanStore>(res);
        if (cancelled || !cloudPlan || typeof cloudPlan !== "object") return;

        setPlan((prev) => {
          const merged: PlanStore = { ...cloudPlan };
          for (const [dateKey, localDay] of Object.entries(prev)) {
            if (!merged[dateKey]) {
              merged[dateKey] = localDay;
            } else {
              const cloudDay = merged[dateKey];
              const mergedDone = Array.from(new Set([...(cloudDay.done || []), ...(localDay.done || [])]));
              const customMap = new Map<string, { id: string; text: string; done: boolean }>();
              (cloudDay.custom || []).forEach((c) => customMap.set(c.id, c));
              (localDay.custom || []).forEach((c) => customMap.set(c.id, c));
              merged[dateKey] = {
                done: mergedDone,
                custom: Array.from(customMap.values()),
              };
            }
          }
          return merged;
        });
      } catch {
        // تجاهل أخطاء الشبكة أثناء وضع عدم الاتصال
      }
    }

    syncCloudPlan();
    return () => {
      cancelled = true;
    };
  }, [user, setPlan]);

  const today = todayKey();
  const day = plan[today] ?? EMPTY_DAY;

  // اختيار مواد اليوم: الأضعف أولاً ثم تدوير يومي على باقي المواد
  const focusSubjects = useMemo(() => {
    if (!subjects.length) return [];
    const avg = (id: string) => {
      const list = attempts.filter((a) => a.subjectId === id);
      return list.length ? list.map(scorePercent).reduce((x, y) => x + y, 0) / list.length : null;
    };
    const weak = subjects
      .map((s) => ({ s, avg: avg(s.id) }))
      .filter((x) => x.avg !== null && x.avg < 60)
      .sort((a, b) => a.avg! - b.avg!)
      .map((x) => x.s);
    const offset = dayOfYear() % subjects.length;
    const rotated = [...subjects.slice(offset), ...subjects.slice(0, offset)];
    return Array.from(new Map([...weak, ...rotated].map((s) => [s.id, s])).values()).slice(0, 2);
  }, [subjects, attempts]);

  const tasks: PlanTask[] = useMemo(() => {
    const list: PlanTask[] = [];
    focusSubjects.forEach((s, i) => {
      list.push({
        id: `quiz-${s.id}`,
        title: `حل كويز في ${s.name}`,
        hint: i === 0 ? "10 أسئلة بمستوى متوسط" : "5 أسئلة سريعة للمراجعة",
        href: `/quizzes?subject=${s.id}`,
        icon: ListChecks,
        minutes: i === 0 ? 20 : 10,
        auto: true,
      });
      list.push({
        id: `ai-${s.id}`,
        title: `اسأل المساعد الذكي في ${s.name}`,
        hint: "اطلب شرح أصعب درس واجهته هذا الأسبوع",
        href: `/ai-path?subject=${s.id}`,
        icon: Bot,
        minutes: 10,
      });
    });
    if (focusSubjects[0]) {
      list.push({
        id: `read-${focusSubjects[0].id}`,
        title: `اقرأ 25 دقيقة من كتاب ${focusSubjects[0].name}`,
        hint: "استخدم مؤقت التركيز لجلسة مركّزة",
        href: "/home#books",
        icon: BookOpen,
        minutes: 25,
      });
    }
    if (attempts.some((a) => a.correct < a.total)) {
      list.push({
        id: "review-mistakes",
        title: "راجع أخطاء آخر كويز",
        hint: "اقرأ شرح كل إجابة خاطئة",
        href: `/exams/archive?attempt=${attempts[0].id}`,
        icon: RotateCcw,
        minutes: 10,
      });
    }
    return list;
  }, [focusSubjects, attempts]);

  const solvedToday = useMemo(
    () => new Set(attempts.filter((a) => todayKey(new Date(a.finishedAt)) === today).map((a) => a.subjectId)),
    [attempts, today],
  );

  const isDone = (t: PlanTask) => day.done.includes(t.id) || Boolean(t.auto && solvedToday.has(t.id.replace("quiz-", "")));

  const updateDay = useCallback(
    (fn: (d: DayState) => DayState) => {
      const current = readStore<PlanStore>(storeKey, EMPTY_PLAN);
      const nextDay = fn(current[today] ?? EMPTY_DAY);
      const next = { ...current, [today]: nextDay };
      const trimmed = Object.fromEntries(
        Object.entries(next)
          .sort(([a], [b]) => b.localeCompare(a))
          .slice(0, 30),
      );
      setPlan(trimmed);

      if (user) {
        fetchWithAuth("/questions/daily-plan", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(trimmed),
        }).catch((err) => {
          console.warn("تعذر حفظ الخطة اليومية على السيرفر:", err);
        });
      }
    },
    [setPlan, storeKey, today, user],
  );

  const total = tasks.length + day.custom.length;
  const completed = tasks.filter(isDone).length + day.custom.filter((c) => c.done).length;

  return {
    isLoading,
    plan,
    today,
    day,
    tasks,
    isDone,
    updateDay,
    toggle: (id: string) =>
      updateDay((d) => ({ ...d, done: d.done.includes(id) ? d.done.filter((x) => x !== id) : [...d.done, id] })),
    total,
    completed,
    percent: total ? Math.round((completed / total) * 100) : 0,
    minutesLeft: tasks.filter((t) => !isDone(t)).reduce((s, t) => s + t.minutes, 0),
  };
}
