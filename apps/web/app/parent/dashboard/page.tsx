"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Award,
  Bell,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  HeartHandshake,
  LineChart,
  Loader2,
  LogOut,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UploadCloud,
  User,
  Users,
  X,
} from "lucide-react";
import { fetchWithAuth, readJson } from "@/lib/apiClient";
import { apiUrl } from "@/lib/apiBase";
import { clearParentDeviceTrustToken, getParentDeviceTrustToken } from "@/lib/parentStorage";
import { notifyParentAuthChange } from "@/context/AuthContext";
import Logo from "@/components/ui/Logo";

interface CurrentUserResponse {
  id: string;
  name: string | null;
  email: string;
  role: string;
}

interface LinkedStudentStats {
  completedAssessments: number;
  averageScore: number;
  bestScore?: number;
  totalActivities: number;
  lastActiveAt: string | null;
  lastActivityTitle: string | null;
}

interface LinkedChild {
  linkId: string;
  studentId: string;
  name: string;
  email: string;
  avatar: string | null;
  branchName: string;
  stats: LinkedStudentStats;
}

interface StudentActivityEvent {
  id: string;
  studentId: string;
  eventType: string;
  title: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

interface SubjectCapability {
  subjectId: string;
  subjectName: string;
  score: number;
  bestScore?: number;
  latestScore: number;
  level: string;
  bloomTaxonomy: string;
  attemptsCount: number;
}

interface AiRecommendation {
  greeting: string;
  quote: string;
  strengthPoint: { subject: string; topic: string } | null;
  focusPoint: { subject: string; topic: string } | null;
  updatedAt: string;
}

interface ParentNotification {
  id: string;
  eventType: string;
  iconType: "ACHIEVEMENT" | "ALERT" | "ACTIVITY";
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

interface TodayKpis {
  activitiesCount: number;
  studyStartTime: string;
  hasStartedToday: boolean;
  questionsSolved: number;
  questionsGenerated?: number;
  accuracyRate: number;
  cognitiveScore: number;
  cognitiveLevel: string;
  assessmentsCount: number;
  planDoneTasks: number;
  planTotalTasks: number;
  planProgressPercentage: number;
}

interface ChildOverviewResponse {
  student: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
  };
  todayKpis?: TodayKpis;
  aiRecommendation: AiRecommendation | null;
  subjectCapabilities: SubjectCapability[];
  notifications: ParentNotification[];
}

interface TimelineResponse {
  student: {
    id: string;
    name: string | null;
    email: string;
    avatar: string | null;
  };
  data: StudentActivityEvent[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

function formatRelativeArabicTime(dateString: string | null | undefined): string {
  if (!dateString) return "لا يوجد نشاط بعد";
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "الآن";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "أمس";
  if (diffDays < 7) return `منذ ${diffDays} أيام`;

  return date.toLocaleDateString("ar-EG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatTimelineTime(dateString: string): string {
  const date = new Date(dateString);
  const timeStr = date.toLocaleTimeString("ar-EG", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const relStr = formatRelativeArabicTime(dateString);
  return `${relStr} (${timeStr})`;
}

export default function ParentDashboardPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUserResponse | null>(null);
  const [children, setChildren] = useState<LinkedChild[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);

  // نظرة عامة ورؤى الذكاء الاصطناعي والإشعارات
  const [todayKpis, setTodayKpis] = useState<TodayKpis | null>(null);
  const [aiRecommendation, setAiRecommendation] = useState<AiRecommendation | null>(null);
  const [subjectCapabilities, setSubjectCapabilities] = useState<SubjectCapability[]>([]);
  const [notifications, setNotifications] = useState<ParentNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  // السجل الزمني والتصفية
  const [timelineEvents, setTimelineEvents] = useState<StudentActivityEvent[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<"ALL" | "ASSESSMENTS" | "ALERTS">("ALL");

  const [loading, setLoading] = useState(true);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);

  // البث المباشر والتنبيهات اللحظية (Server-Sent Events)
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveToast, setLiveToast] = useState<{
    title: string;
    message: string;
    isHigh: boolean;
    timestamp: string;
  } | null>(null);

  // إغلاق قائمة الإشعارات عند النقر خارجها
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // 1. جلب بيانات ولي الأمر والأبناء المرتبطين
  const loadDashboardData = useCallback(
    async (isManualRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);

      try {
        // أ. جلب بيانات ولي الأمر
        const userRes = await fetchWithAuth("/parent/me");
        if (userRes.status === 401) {
          window.location.href = "/parent/login";
          return;
        }
        if (userRes.ok) {
          const user = await readJson<CurrentUserResponse>(userRes);
          if (user) setCurrentUser(user);
        }

        // ب. جلب قائمة الأبناء المرتبطين وإحصائياتهم
        const childrenRes = await fetchWithAuth("/parent/children");
        if (childrenRes.status === 401) {
          window.location.href = "/parent/login";
          return;
        }
        if (childrenRes.ok) {
          const data = await readJson<{ children: LinkedChild[] }>(childrenRes);
          const loadedChildren = data?.children ?? [];
          setChildren(loadedChildren);

          setSelectedChildId((prev) => {
            if (prev && loadedChildren.some((c) => c.studentId === prev)) {
              return prev;
            }
            return loadedChildren[0]?.studentId ?? null;
          });
        }

        setLastRefreshedAt(new Date());
      } catch (err) {
        console.error("تعذر تحديث بيانات الداشبورد:", err);
      } finally {
        setLoading(false);
        if (isManualRefresh) setRefreshing(false);
      }
    },
    [],
  );

  // 2. جلب تفاصيل ورؤى الطالب المحدد (Overview + Timeline)
  const loadChildInsights = useCallback(async (studentId: string) => {
    try {
      const [overviewRes, timelineRes] = await Promise.all([
        fetchWithAuth(`/parent/children/${studentId}/overview`),
        fetchWithAuth(`/parent/children/${studentId}/timeline?limit=25`),
      ]);

      if (overviewRes.ok) {
        const overview = await readJson<ChildOverviewResponse>(overviewRes);
        if (overview) {
          setTodayKpis(overview.todayKpis ?? null);
          setAiRecommendation(overview.aiRecommendation);
          setSubjectCapabilities(overview.subjectCapabilities ?? []);
          setNotifications(overview.notifications ?? []);
        }
      }

      if (timelineRes.ok) {
        const timeline = await readJson<TimelineResponse>(timelineRes);
        setTimelineEvents(timeline?.data ?? []);
      }
    } catch (err) {
      console.error("تعذر جلب تفاصيل الطالب:", err);
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  // التحميل المبدئي + تفعيل المؤقت التلقائي (Auto-Refresh كل 30 ثانية)
  useEffect(() => {
    loadDashboardData(false);

    refreshIntervalRef.current = setInterval(() => {
      loadDashboardData(false);
      if (selectedChildId) {
        loadChildInsights(selectedChildId);
      }
    }, 30_000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
    };
  }, [loadDashboardData, selectedChildId, loadChildInsights]);

  // مؤقت لإخفاء التنبيه اللحظي تلقائياً بعد 8 ثوانٍ
  useEffect(() => {
    if (!liveToast) return;
    const timer = setTimeout(() => {
      setLiveToast(null);
    }, 8000);
    return () => clearTimeout(timer);
  }, [liveToast]);

  // الاشتراك بالبث المباشر اللحظي (SSE) لحساب الطالب المحدد
  useEffect(() => {
    if (!selectedChildId) return;

    let eventSource: EventSource | null = null;
    let isCancelled = false;

    try {
      const streamUrl = apiUrl(`/parent/stream?studentId=${selectedChildId}`);
      eventSource = new EventSource(streamUrl, { withCredentials: true });

      eventSource.onopen = () => {
        if (!isCancelled) setLiveConnected(true);
      };

      eventSource.addEventListener("STUDENT_ACTIVITY", (event: MessageEvent) => {
        if (isCancelled || !event.data) return;
        try {
          const parsed = JSON.parse(event.data);
          const { title, data } = parsed;
          const isHigh = Boolean(data?.score >= 80 || data?.isImprovement);

          setLiveToast({
            title: isHigh ? "🎉 إنجاز متميز جديد للابن!" : "⚡ نشاط أكاديمي لحظي",
            message: title || "أنجز الطالب نشاطاً أكاديمياً للتو.",
            isHigh,
            timestamp: new Date().toLocaleTimeString("ar-EG", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            }),
          });

          // تحديث فوري فوري للداشبورد بدون انتظار أي مؤقت
          loadChildInsights(selectedChildId);
          loadDashboardData(false);
        } catch (e) {
          console.error("خطأ في قراءة حدث البث المباشر:", e);
        }
      });

      eventSource.onerror = () => {
        if (!isCancelled) setLiveConnected(false);
      };
    } catch (err) {
      console.warn("تعذر فتح اتصال SSE المباشر، سيتم الاعتماد على التحديث الدوري:", err);
    }

    return () => {
      isCancelled = true;
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [selectedChildId, loadChildInsights, loadDashboardData]);

  // عند تغيير الطالب المحدد
  useEffect(() => {
    if (selectedChildId) {
      setInsightsLoading(true);
      setTodayKpis(null);
      setAiRecommendation(null);
      setSubjectCapabilities([]);
      setNotifications([]);
      setTimelineEvents([]);
      loadChildInsights(selectedChildId);
    } else {
      setTimelineEvents([]);
      setAiRecommendation(null);
      setSubjectCapabilities([]);
      setNotifications([]);
      setTodayKpis(null);
      setInsightsLoading(false);
    }
  }, [selectedChildId, loadChildInsights]);

  const handleLogout = async () => {
    const deviceToken = getParentDeviceTrustToken();
    clearParentDeviceTrustToken();
    notifyParentAuthChange(false);
    try {
      await fetchWithAuth("/auth/parent/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(deviceToken ? { "x-device-trust-token": deviceToken } : {}),
        },
        body: JSON.stringify({ deviceTrustToken: deviceToken }),
      });
    } catch (err) {
      console.error("تعذر إنهاء جلسة ولي الأمر:", err);
    }
    window.location.href = "/parent/login";
  };

  const handleMarkAllNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  const activeChild = children.find((c) => c.studentId === selectedChildId) ?? children[0];

  // تصفية السجل الزمني (يشمل اختبارات القدرات والكويزات التفاعلية)
  const filteredTimeline = timelineEvents.filter((item) => {
    const isAcademic =
      item.eventType === "ASSESSMENT_COMPLETED" ||
      item.eventType === "QUIZ_COMPLETED";

    if (timelineFilter === "ASSESSMENTS") {
      return isAcademic;
    }
    if (timelineFilter === "ALERTS") {
      const score = item.metadata?.score;
      return isAcademic && score !== undefined && score < 60;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={38} className="animate-spin text-teal-600" />
          <p className="text-sm font-semibold text-navy-950">
            جاري مزامنة بيانات الطالب ولوحة متابعة ولي الأمر...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f8fafc] text-ink antialiased">
      {/* تنبيه الإشعارات اللحظية المباشرة (Live SSE Notification Toast) */}
      {liveToast && (
        <div className="fixed top-20 start-1/2 -translate-x-1/2 z-[100] flex items-center gap-3.5 rounded-2xl bg-gradient-to-r from-[#071728] via-[#0d273e] to-[#091a2b] text-white px-5 py-4 shadow-2xl border-2 border-teal-400/80 animate-in fade-in slide-in-from-top-4 duration-300 max-w-lg w-[92vw]">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              liveToast.isHigh
                ? "bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-400/40"
                : "bg-teal-500/20 text-teal-300"
            }`}
          >
            <Sparkles size={22} className="text-teal-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-black text-teal-300 truncate">{liveToast.title}</h4>
              <span className="text-[11px] text-slate-400 shrink-0 font-medium">
                {liveToast.timestamp}
              </span>
            </div>
            <p className="text-xs text-slate-200 mt-0.5 leading-relaxed font-medium">
              {liveToast.message}
            </p>
          </div>
          <button
            onClick={() => setLiveToast(null)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="إغلاق التنبيه"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* شريط الملاحة العلوي لولي الأمر المطابق تماماً للصورة والمربوط ببيانات الطالب الحقيقية */}
      <header className="sticky top-0 z-50 border-b border-[#142e47] bg-[#071728] shadow-lg backdrop-blur-md">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6 lg:px-8">
          {/* الجانب الأيمن: صورة/رمز الطالب، العنوان الرئيسي، شارة النشاط، والصف الدراسي وآخر نشاط حقيقي */}
          <div className="flex items-center gap-3.5">
            {/* الحرف الأول من اسم الطالب داخل مربع مدور مطابق للصورة */}
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#1d4363] bg-[#0f283c] text-xl font-black text-teal-300 shadow-inner">
              {activeChild?.name ? activeChild.name.trim().charAt(0) : "م"}
            </div>

            <div className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-sm font-extrabold text-white tracking-wide sm:text-base">
                  بوابة ولي الأمر — متابعة الطالب:{" "}
                  <span className="font-black text-white">
                    {activeChild?.name || "—"}
                  </span>
                </h1>

                {/* شارة النشاط الحي على المنصة مع حالة البث المباشر اللحظي */}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/40 bg-[#0c2a38]/90 px-2.5 py-0.5 text-[11px] font-bold text-teal-300 shadow-sm">
                  <span>{liveConnected ? "بث مباشر لحظي ⚡" : "نشط الآن على المنصة"}</span>
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                  </span>
                </span>
              </div>

              {/* الصف الدراسي وآخر نشاط حقيقي تم ربطه */}
              <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-slate-300">
                <span>
                  الصف الثاني عشر
                  {activeChild?.branchName
                    ? ` (${
                        activeChild.branchName.includes("التوجيهي")
                          ? activeChild.branchName
                          : `التوجيهي ${activeChild.branchName}`
                      })`
                    : ""}
                </span>
                <span className="text-slate-500">•</span>
                <span>
                  آخر نشاط:{" "}
                  <span className="text-slate-200">
                    {timelineEvents[0]?.title ||
                      activeChild?.stats?.lastActivityTitle ||
                      "لا يوجد نشاط مسجل بعد"}
                  </span>
                </span>
              </p>
            </div>
          </div>

          {/* الجانب الأيسر: زر إشعارات الأحداث المطابق للصورة 100% مع البادج الأحمر وأزرار التحكم */}
          <div className="flex items-center gap-3">
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setShowNotifications((prev) => !prev)}
                className="flex items-center gap-2.5 rounded-2xl border border-[#1f3f5c] bg-[#0d2235] px-3.5 py-2 text-xs font-bold text-white shadow-md transition-all hover:border-teal-500/50 hover:bg-[#132c44]"
                title="عرض سجل إشعارات الأحداث الفورية"
              >
                {unreadCount > 0 ? (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#f43f5e] px-1 text-[11px] font-black text-white shadow-sm">
                    {unreadCount}
                  </span>
                ) : notifications.length > 0 ? (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-slate-700 px-1 text-[11px] font-black text-slate-300 shadow-sm">
                    {notifications.length}
                  </span>
                ) : null}
                <span>إشعارات الأحداث</span>
                <Bell size={16} className="text-teal-400" />
              </button>

              {/* القائمة المنبثقة لسجل الإشعارات الفورية */}
              {showNotifications && (
                <div className="absolute end-0 top-full mt-2 w-80 sm:w-96 rounded-2xl border border-line bg-white shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-center justify-between border-b border-line/80 p-4 pb-3">
                    <div>
                      <h3 className="text-base font-extrabold text-navy-950">
                        سجل الإشعارات الفورية لولي الأمر
                      </h3>
                      <p className="mt-0.5 text-xs text-muted">
                        تنبيهات وإشعارات المتابعة اللحظية لحساب ولي الأمر
                      </p>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllNotificationsAsRead}
                        className="text-xs font-bold text-teal-700 hover:text-teal-900 transition-colors"
                      >
                        تحديد الكل كمقروء
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto divide-y divide-line/60">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted">
                        لا توجد إشعارات جديدة حتى الآن
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`flex items-start gap-3 p-4 transition-colors hover:bg-slate-50/70 ${
                            notif.read ? "bg-white opacity-80" : "bg-teal-50/20"
                          }`}
                        >
                          <span
                            className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                              notif.read ? "bg-slate-300" : "bg-emerald-500"
                            }`}
                          />
                          <div className="flex-1">
                            <div className="text-sm font-bold text-navy-950 leading-snug">
                              {notif.title}
                            </div>
                            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                              {notif.body}
                            </p>
                            <span className="mt-1.5 block text-[11px] font-medium text-muted">
                              {formatRelativeArabicTime(notif.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* التبديل لشاشة دراسة الطالب على الأجهزة المشتركة */}
            <Link
              href="/home"
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/40 bg-teal-950/40 px-3 py-2 text-xs font-semibold text-teal-300 transition hover:bg-teal-900/60 hover:text-white"
              title="الانتقال المباشر إلى شاشة دراسة الطالب"
            >
              <GraduationCap size={14} className="text-teal-400" />
              <span className="hidden sm:inline">شاشة الطالب</span>
            </Link>

            {/* زر التحديث الحي ومؤشر الحالة */}
            <button
              onClick={() => {
                loadDashboardData(true);
                if (selectedChildId) loadChildInsights(selectedChildId);
              }}
              disabled={refreshing}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-[#1f3f5c] bg-[#0d2235] px-3 py-2 text-xs font-semibold text-slate-300 shadow-sm transition hover:bg-[#132c44] hover:text-white disabled:opacity-50"
              title="تحديث البيانات فوراً"
            >
              <RefreshCw
                size={13}
                className={`text-teal-400 ${refreshing ? "animate-spin" : ""}`}
              />
              <span className="hidden md:inline">مزامنة</span>
            </button>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#1f3f5c] bg-[#0d2235] px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-[#132c44] hover:text-rose-400"
              title="تسجيل الخروج"
            >
              <LogOut size={15} />
              <span className="hidden sm:inline">خروج</span>
            </button>
          </div>
        </div>
      </header>

      {/* المحتوى الرئيسي للوحة المتابعة */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* مبدّل الطلاب إذا كان هناك أكثر من ابن مرتبط */}
        {children.length > 1 && (
          <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
            <span className="text-xs font-bold text-muted ps-1">الطالب النشط:</span>
            {children.map((child) => (
              <button
                key={child.studentId}
                onClick={() => setSelectedChildId(child.studentId)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                  selectedChildId === child.studentId
                    ? "bg-navy-950 text-white shadow-md shadow-navy-950/20"
                    : "border border-line bg-white text-navy-900 hover:bg-slate-50"
                }`}
              >
                <User size={14} className="text-teal-400" />
                <span>{child.name}</span>
                <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px]">
                  {child.branchName}
                </span>
              </button>
            ))}
          </div>
        )}

        {children.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-teal-200 bg-teal-50/50 p-8 text-center sm:p-12">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-100 text-teal-700">
              <Users size={28} />
            </div>
            <h3 className="mt-4 text-lg font-bold text-navy-950">لم يتم ربط أي حساب طالب بعد</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              يمكن لابنك توليد كود الدعوة المباشر من داخل حسابه في منصة مسار التميز ومشاركته معك ليتم ربط الحساب وعرض تقييماته فوراً.
            </p>
          </div>
        ) : (
          <>
            {/* ═══════════════════════════════════════════════════════════════════
                 مؤشرات الأداء العلوية الأربعة (مطابقة للصورة 100%)
               ═══════════════════════════════════════════════════════════════════ */}
            <div className="mb-6 grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {/* بطاقة 1: حالة الالتزام ونشاط اليوم (اليمين) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all hover:shadow-md flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500">حالة الالتزام ونشاط اليوم</span>
                  <div className="mt-1.5 text-xl font-black text-navy-950 sm:text-2xl">
                    {todayKpis ? (
                      `${todayKpis.activitiesCount} أنشطة مكتملة`
                    ) : insightsLoading ? (
                      <div className="my-1 h-6 w-32 animate-pulse rounded-lg bg-slate-200/80" />
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-500">
                    {todayKpis?.hasStartedToday && todayKpis.studyStartTime ? (
                      <>
                        <span className="text-emerald-600">✓</span>
                        <span className="text-emerald-600 font-bold">{todayKpis.studyStartTime}</span>
                      </>
                    ) : activeChild?.stats?.lastActiveAt ? (
                      <span>آخر ظهور: {formatRelativeArabicTime(activeChild.stats.lastActiveAt)}</span>
                    ) : (
                      <span className="text-slate-400">لم يبدأ الدراسة اليوم بعد</span>
                    )}
                  </div>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-100/80">
                  <Clock size={22} className="stroke-[2.2]" />
                </div>
              </div>

              {/* بطاقة 2: الاختبارات والأسئلة اليوم */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all hover:shadow-md flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500">الاختبارات والأسئلة اليوم</span>
                  <div className="mt-1.5 text-xl font-black text-navy-950 sm:text-2xl">
                    {todayKpis ? (
                      `${todayKpis.questionsSolved} سؤالاً محلولاً`
                    ) : insightsLoading ? (
                      <div className="my-1 h-6 w-28 animate-pulse rounded-lg bg-slate-200/80" />
                    ) : (
                      "—"
                    )}
                  </div>
                  <div className="mt-1 text-xs font-bold text-teal-600">
                    نسبة الإجابات الصحيحة:{" "}
                    {todayKpis
                      ? todayKpis.questionsSolved > 0
                        ? `${todayKpis.accuracyRate}%`
                        : "—"
                      : activeChild?.stats?.averageScore !== undefined && activeChild.stats.averageScore > 0
                      ? `${activeChild.stats.averageScore}%`
                      : "—"}
                  </div>
                  {todayKpis && typeof todayKpis.questionsGenerated === "number" && todayKpis.questionsGenerated > 0 && (
                    <div className="mt-1 text-xs font-medium text-slate-400">
                      تم توليد {todayKpis.questionsGenerated} أسئلة تدريبية
                    </div>
                  )}
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-600 border border-teal-100/80">
                  <ClipboardCheck size={22} className="stroke-[2.2]" />
                </div>
              </div>

              {/* بطاقة 3: مؤشر القدرات المعرفية */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all hover:shadow-md flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500">مؤشر القدرات المعرفية</span>
                  <div className="mt-1.5 text-xl font-black text-navy-950 sm:text-2xl">
                    {todayKpis ? (
                      todayKpis.assessmentsCount > 0 ? (
                        `${todayKpis.cognitiveLevel} (${todayKpis.cognitiveScore}%)`
                      ) : (
                        "قيد التقييم"
                      )
                    ) : insightsLoading ? (
                      <div className="my-1 h-6 w-32 animate-pulse rounded-lg bg-slate-200/80" />
                    ) : activeChild?.stats?.completedAssessments !== undefined &&
                      activeChild.stats.completedAssessments > 0 ? (
                      `${
                        (activeChild.stats.averageScore ?? 0) >= 80
                          ? "متقدم"
                          : (activeChild.stats.averageScore ?? 0) >= 60
                          ? "متوسط"
                          : "يحتاج متابعة"
                      } (${activeChild.stats.averageScore ?? 0}%)`
                    ) : (
                      "قيد التقييم"
                    )}
                  </div>
                  <div className="mt-1 text-xs font-medium text-slate-400">
                    بناءً على{" "}
                    {todayKpis?.assessmentsCount ?? activeChild?.stats?.completedAssessments ?? 0}{" "}
                    اختبارات قدرات تشخيصية
                  </div>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100/80">
                  <TrendingUp size={22} className="stroke-[2.2]" />
                </div>
              </div>

              {/* بطاقة 4: إنجاز «خطة اليوم» (اليسار) */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm transition-all hover:shadow-md flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-500">إنجاز «خطة اليوم»</span>
                  <div className="mt-1.5 text-xl font-black text-navy-950 sm:text-2xl">
                    {todayKpis && todayKpis.planTotalTasks > 0 ? (
                      `${todayKpis.planDoneTasks} من ${todayKpis.planTotalTasks} مهام`
                    ) : insightsLoading ? (
                      <div className="my-1 h-6 w-28 animate-pulse rounded-lg bg-slate-200/80" />
                    ) : (
                      "—"
                    )}
                  </div>
                  {/* شريط الإنجاز البرتقالي */}
                  <div className="mt-2.5 h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-500"
                      style={{
                        width: `${
                          todayKpis && todayKpis.planTotalTasks > 0
                            ? todayKpis.planProgressPercentage
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 border border-amber-100/80">
                  <CheckCircle2 size={22} className="stroke-[2.2]" />
                </div>
              </div>
            </div>

            {/* التخطيط الشبكي المطابق للصورة 2 */}
            <div className="grid gap-6 lg:grid-cols-12 items-start">
            {/* ═══════════════════════════════════════════════════════════════════
                 العمود الأيمن في الصورة 2: السجل الزمني المباشر (7 أعمدة في الشاشات الكبيرة)
               ═══════════════════════════════════════════════════════════════════ */}
            <div className="lg:col-span-7 space-y-6">
              <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
                {/* ترويسة السجل الزمني مع التابات التفاعلية */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-5">
                  <div>
                    <h2 className="text-lg font-black text-navy-950 sm:text-xl">
                      السجل الزمني المباشر لأحداث اليوم (Live Activity Timeline)
                    </h2>
                    <p className="mt-1 text-xs text-muted leading-relaxed">
                      يُسجل تلقائياً كل اختبار قدرات، كويز، أو جلسة مذاكرة يقوم بها الطالب مع إشعار فوري
                    </p>
                  </div>

                  {/* أزرار التصفية: الكل / اختبارات القدرات / تنبيهات الأداء */}
                  <div className="flex items-center gap-1.5 rounded-xl bg-slate-100 p-1 self-start sm:self-auto shrink-0">
                    <button
                      onClick={() => setTimelineFilter("ALL")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        timelineFilter === "ALL"
                          ? "bg-white text-navy-950 shadow-sm"
                          : "text-muted hover:text-navy-900"
                      }`}
                    >
                      الكل
                    </button>
                    <button
                      onClick={() => setTimelineFilter("ASSESSMENTS")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        timelineFilter === "ASSESSMENTS"
                          ? "bg-white text-navy-950 shadow-sm"
                          : "text-muted hover:text-navy-900"
                      }`}
                    >
                      اختبارات القدرات
                    </button>
                    <button
                      onClick={() => setTimelineFilter("ALERTS")}
                      className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                        timelineFilter === "ALERTS"
                          ? "bg-white text-rose-700 shadow-sm"
                          : "text-muted hover:text-navy-900"
                      }`}
                    >
                      تنبيهات الأداء
                    </button>
                  </div>
                </div>

                {/* السجل الزمني المتصل (Timeline Cards with Vertical Track) */}
                <div
                  className={`mt-6 space-y-6 ${
                    filteredTimeline.length > 0
                      ? "relative before:absolute before:inset-0 before:end-5 before:w-0.5 before:bg-slate-200"
                      : ""
                  }`}
                >
                  {filteredTimeline.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted">
                      لا توجد نشاطات مسجلة ضمن هذا التصنيف اليوم
                    </div>
                  ) : (
                    filteredTimeline.map((item, index) => {
                      const isAssessment = item.eventType === "ASSESSMENT_COMPLETED";
                      const isQuiz = item.eventType === "QUIZ_COMPLETED";
                      const isAcademic = isAssessment || isQuiz;
                      const isRetake = Boolean(item.metadata?.isRetake);
                      const isImprovement = Boolean(item.metadata?.isImprovement);
                      const isLowScore = isAcademic && (item.metadata?.score ?? 0) < 60;
                      const scoreVal = item.metadata?.score;

                      return (
                        <div key={item.id || index} className="relative pe-10">
                          {/* النقطة الدائرية على الخط العمودي */}
                          <div
                            className={`absolute end-3.5 top-5 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow-sm ring-4 ${
                              isImprovement
                                ? "bg-purple-600 ring-purple-100 animate-pulse"
                                : isLowScore
                                ? "bg-amber-500 ring-amber-100"
                                : isAcademic
                                ? "bg-emerald-500 ring-emerald-100"
                                : "bg-sky-500 ring-sky-100"
                            }`}
                          />

                          {/* بطاقة النشاط التفصيلية المطابقة للتصميم */}
                          <div className="rounded-2xl border border-line bg-white p-5 shadow-sm transition-all hover:border-slate-300 hover:shadow-md">
                            {/* الصف العلوي للبادجات */}
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-full px-2.5 py-0.5 font-bold ${
                                    isImprovement
                                      ? "bg-purple-100 text-purple-900 border border-purple-200"
                                      : isQuiz
                                      ? "bg-teal-100 text-teal-900"
                                      : isAssessment
                                      ? "bg-emerald-100 text-emerald-900"
                                      : "bg-sky-100 text-sky-900"
                                  }`}
                                >
                                  {isImprovement
                                    ? "🚀 إعادة كويز (تحسن ملحوظ)"
                                    : isRetake
                                    ? "إعادة كويز تفاعلي"
                                    : isQuiz
                                    ? "كويز تفاعلي ذكي"
                                    : isAssessment
                                    ? "اختبار قدرات تشخيصي"
                                    : "مسار التميز AI"}
                                </span>
                                <span className="font-semibold text-slate-600">
                                  • {item.metadata?.subjectName ? `مادة ${item.metadata.subjectName}` : "مادة دراسية"}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                {scoreVal !== undefined && (
                                  <span
                                    className={`rounded-full px-2.5 py-0.5 font-black text-xs ${
                                      scoreVal >= 80
                                        ? "bg-emerald-100 text-emerald-800"
                                        : scoreVal < 60
                                        ? "bg-rose-100 text-rose-800"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {scoreVal}%
                                  </span>
                                )}
                                {isImprovement && item.metadata?.previousScore !== undefined && (
                                  <span className="rounded-full bg-purple-50 border border-purple-200 px-2 py-0.5 text-[10px] font-bold text-purple-700">
                                    + قفزة من {item.metadata.previousScore}%
                                  </span>
                                )}
                                {!isAcademic && (
                                  <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 font-bold text-sky-800">
                                    مكتمل
                                  </span>
                                )}
                                <span className="text-[11px] text-muted font-medium">
                                  {formatTimelineTime(item.createdAt)}
                                </span>
                              </div>
                            </div>

                            {/* العنوان الرئيسي */}
                            <h4 className="mt-3 text-base font-extrabold text-navy-950">
                              {item.title}
                            </h4>

                            {/* الوصف والتحليل التربوي */}
                            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                              {item.metadata?.correctCount !== undefined
                                ? `أجاب بشكل صحيح على ${item.metadata.correctCount} من ${
                                    item.metadata.totalQuestions ?? item.metadata.correctCount
                                  } سؤالاً.` +
                                  (item.metadata?.score !== undefined
                                    ? ` نسبة الإنجاز: ${item.metadata.score}%.`
                                    : "")
                                : item.eventType === "QUESTIONS_GENERATED"
                                ? `طلب الطالب شرح وتوليد ${
                                    item.metadata?.count ?? 5
                                  } أسئلة تدريبية في مادة ${
                                    item.metadata?.subjectName ?? "الدراسية"
                                  } وتفاعل مع الشرح الذكي بالمنصة.`
                                : `تم تسجيل نشاط تعليمي للطالب وتحديث مؤشرات الأداء والقدرات الأكاديمية.`}
                            </p>

                            {/* فوتر البطاقة: حالة التوثيق في سجل المتابعة اللحظية */}
                            <div className="mt-3.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 border-t border-slate-100 pt-3">
                              <ShieldCheck size={14} className="text-teal-600" />
                              <span>تم توثيق النشاط في سجل المتابعة اللحظية</span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                 العمود الأيسر في الصورة 2: توصية الذكاء الاصطناعي + خريطة القدرات (5 أعمدة)
               ═══════════════════════════════════════════════════════════════════ */}
            <div className="lg:col-span-5 space-y-6">
              {/* 1. بطاقة توصية الذكاء الاصطناعي لولي الأمر اليوم (Dark Card المطابقة للصورة 2) */}
              <div className="relative overflow-hidden rounded-3xl border border-[#1b3547] bg-gradient-to-br from-[#0c1f2d] via-[#091823] to-[#050f16] p-6 text-white shadow-xl">
                {/* الترويسة العلوية للبطاقة */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-500/15 px-3 py-1 text-xs font-bold text-teal-300">
                    <Sparkles size={13} className="text-teal-400" />
                    توصية الذكاء الاصطناعي لولي الأمر اليوم
                  </span>
                  <span className="text-[11px] font-medium text-navy-300">محدث تلقائياً</span>
                </div>

                {/* نص التوصية المقتبس */}
                <div className="mt-4 rounded-2xl bg-white/[0.04] p-4 text-xs font-medium leading-relaxed text-slate-200 border border-white/5">
                  <p>
                    {aiRecommendation?.quote || (
                      <span className="text-slate-400">
                        لا توجد توصية ذكية مسجلة اليوم بعد. ستظهر التوصية تلقائياً بمجرد إكمال الطالب لاختبارات قدرات أو أنشطة أكاديمية.
                      </span>
                    )}
                  </p>
                </div>

                {/* الصندوقان المحددان: أبرز نقطة قوة اليوم + يحتاج للمتابعة في */}
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  {/* صندوق نقطة القوة (أخضر / تيل) */}
                  <div className="rounded-xl border border-teal-500/40 bg-teal-950/40 p-3">
                    <span className="block text-[11px] font-bold text-teal-400">
                      أبرز نقطة قوة اليوم:
                    </span>
                    <strong className="mt-1 block text-xs font-extrabold text-white">
                      {aiRecommendation?.strengthPoint?.subject
                        ? `${aiRecommendation.strengthPoint.subject} — ${aiRecommendation.strengthPoint.topic}`
                        : "—"}
                    </strong>
                  </div>

                  {/* صندوق يحتاج للمتابعة (أصفر / برتقالي) */}
                  <div className="rounded-xl border border-amber-500/40 bg-amber-950/40 p-3">
                    <span className="block text-[11px] font-bold text-amber-400">
                      يحتاج للمتابعة في:
                    </span>
                    <strong className="mt-1 block text-xs font-extrabold text-white">
                      {aiRecommendation?.focusPoint?.subject
                        ? `${aiRecommendation.focusPoint.subject} — ${aiRecommendation.focusPoint.topic}`
                        : "—"}
                    </strong>
                  </div>
                </div>
              </div>

              {/* 2. خريطة قدرات الطالب حسب المادة (هرم بلوم المطابقة للصورة 2) */}
              <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div>
                    <h3 className="text-base font-extrabold text-navy-950">
                      خريطة قدرات الطالب حسب المادة
                    </h3>
                    <p className="mt-0.5 text-xs text-muted">
                      مستمدة مباشرة من ميزة «اختبارات القدرات التشخيصية»
                    </p>
                  </div>
                  <span className="rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-black text-purple-700">
                    هرم بلوم
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  {subjectCapabilities.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted">
                      لا توجد نتائج اختبارات قدرات تشخيصية مسجلة حتى الآن
                    </div>
                  ) : (
                    subjectCapabilities.map((sub) => {
                      const isHigh = sub.score >= 80;
                      const isLow = sub.score < 60;

                      return (
                        <div
                          key={sub.subjectId}
                          className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 transition-all hover:bg-white hover:shadow-sm hover:border-slate-200"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold text-navy-950">
                              {sub.subjectName}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {sub.bestScore !== undefined && sub.bestScore > sub.score && (
                                <span className="rounded-full bg-teal-50 border border-teal-200 px-2 py-0.5 text-[10px] font-black text-teal-700">
                                  أعلى: {sub.bestScore}% 🚀
                                </span>
                              )}
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                                  isHigh
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isLow
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {sub.score}% — {sub.level}
                              </span>
                            </div>
                          </div>

                          {/* شريط التقدم */}
                          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                isHigh
                                  ? "bg-emerald-500"
                                  : isLow
                                  ? "bg-rose-500"
                                  : "bg-amber-500"
                              }`}
                              style={{ width: `${Math.min(100, Math.max(10, sub.score))}%` }}
                            />
                          </div>

                          <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
                            <span>مستويات الإتقان: {sub.bloomTaxonomy}</span>
                            <span>{sub.attemptsCount} محاولات واختبارات</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  </div>
);
}
