import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdminOverview from "../page";
import * as overviewApi from "../_data/overview";
import * as authContext from "@/context/AuthContext";

vi.mock("../_data/overview");
vi.mock("@/context/AuthContext");

describe("AdminOverview Page (Live Real-time Data)", () => {
  const mockOverviewData: overviewApi.AdminOverviewData = {
    timestamp: new Date().toISOString(),
    rangeDays: 30,
    kpis: {
      students: { value: 125, delta: 12.5, trend: [100, 110, 125] },
      activeToday: { value: 42, delta: 5.0, trend: [30, 35, 42] },
      bankQuestions: { value: 850, delta: 8.2, trend: [700, 800, 850] },
      aiCost: { value: "$14.20", rawCost: 14.2, note: "استهلاك الشهر الحالي" },
    },
    aiRequestsSeries: [
      { day: "1/10", value: 45 },
      { day: "2/10", value: 60 },
      { day: "3/10", value: 85 },
    ],
    requestsByTask: [
      { label: "توليد الأسئلة", value: 120 },
      { label: "المساعد الذكي والشرح", value: 80 },
    ],
    pipeline: {
      activeJobsCount: 1,
      jobs: [
        {
          id: "job-1",
          name: "كيمياء_علمي.pdf",
          kind: "book",
          subject: "الكيمياء",
          branch: "العلمي",
          stage: "embedding",
          progress: 75,
          chunks: 120,
          error: null,
          startedAt: new Date().toISOString(),
        },
      ],
    },
    knowledgeReadiness: {
      overallPercent: 88,
      totalChunks: 500,
      indexedChunks: 440,
      subjects: [
        {
          id: "sub-1",
          name: "الكيمياء",
          branch: "العلمي",
          chunks: 120,
          indexed: 100,
          percent: 83,
        },
      ],
    },
    services: [
      {
        name: "قاعدة بيانات PostgreSQL",
        detail: "الاتصال متصل واستعلامات pgvector جاهزة",
        status: "ok",
      },
      {
        name: "خادم الذاكرة Redis",
        detail: "جاهز لإدارة الجلسات والطوابير والبث المباشر",
        status: "ok",
      },
    ],
    queues: [
      {
        name: "exam-extraction",
        label: "استخراج الامتحانات",
        waiting: 0,
        active: 1,
        completed: 10,
        failed: 0,
      },
    ],
    activity: [
      {
        id: "act-1",
        icon: "check",
        who: "أحمد الطالب",
        what: "أنهى كويز تفاعلي بنجاح",
        target: "الكيمياء",
        when: "قبل 5 دقائق",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      isLoggedIn: true,
      isLoading: false,
      user: {
        id: "admin-1",
        name: "عمر المشرف",
        email: "admin@masar.test",
        role: "ADMIN",
        permissions: [],
        avatar: null,
        branchId: null,
        emailVerified: true,
        twoFactorEnabled: false,
      },
      selectedBranch: null,
      hasParentSession: false,
      refresh: vi.fn(),
      logout: vi.fn(),
      setSelectedBranch: vi.fn(),
      setHasParentSession: vi.fn(),
    });

    vi.spyOn(overviewApi, "getAdminOverview").mockResolvedValue(mockOverviewData);
  });

  it("renders live KPIs, pipeline jobs, services health and recent activities from backend API", async () => {
    render(<AdminOverview />);

    // Initially loading state exists
    expect(screen.getByText("لوحة المتابعة اللحظية")).toBeInTheDocument();
    expect(screen.getByText("أهلاً وسهلاً، عمر المشرف")).toBeInTheDocument();

    // After data loads
    await waitFor(() => {
      expect(screen.getByText("125")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("850")).toBeInTheDocument();
      expect(screen.getByText("$14.20")).toBeInTheDocument();
    });

    // Verify pipeline job is rendered
    expect(screen.getByText("كيمياء_علمي.pdf")).toBeInTheDocument();
    expect(screen.getByText(/كتاب مدرسي/)).toBeInTheDocument();

    // Verify services health rendered
    expect(screen.getByText("قاعدة بيانات PostgreSQL")).toBeInTheDocument();
    expect(screen.getByText("خادم الذاكرة Redis")).toBeInTheDocument();

    // Verify live activity rendered
    expect(screen.getByText("أحمد الطالب")).toBeInTheDocument();
    expect(screen.getByText("أنهى كويز تفاعلي بنجاح")).toBeInTheDocument();
    expect(screen.getByText("قبل 5 دقائق")).toBeInTheDocument();
  });

  it("refreshes data when clicking 'تحديث فوري' button", async () => {
    render(<AdminOverview />);

    await waitFor(() => {
      expect(screen.getByText("125")).toBeInTheDocument();
    });

    const refreshBtn = screen.getByRole("button", { name: /تحديث فوري/i });
    await act(async () => {
      fireEvent.click(refreshBtn);
    });

    expect(overviewApi.getAdminOverview).toHaveBeenCalledTimes(2);
  });
});
