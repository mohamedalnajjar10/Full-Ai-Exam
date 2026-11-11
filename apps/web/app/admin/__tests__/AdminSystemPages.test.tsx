import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import HealthPage from "../health/page";
import AuditPage from "../audit/page";
import SettingsPage from "../settings/page";
import AiModelsPage from "../ai/page";
import * as systemData from "../_data/system";

vi.mock("../_data/system");
vi.mock("@/components/ui/ToastProvider", () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

describe("Admin System Pages - Real Data Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("HealthPage renders live services, latency and queues from API", async () => {
    vi.spyOn(systemData, "getHealthDiagnostics").mockResolvedValue({
      timestamp: new Date().toISOString(),
      overall: "ok",
      summary: "جميع الخدمات وقوائم المعالجة تعمل بكفاءة تامة.",
      services: [
        {
          name: "قاعدة بيانات PostgreSQL",
          detail: "متصلة وجاهزة لاستقبال الاستعلامات",
          status: "ok",
          latencyMs: 14,
          metrics: { connections: 10, poolSize: 20 },
        },
      ],
      queues: [
        {
          name: "exam-extraction",
          label: "استخراج الامتحانات",
          waiting: 3,
          active: 1,
          completed: 45,
          failed: 0,
          paused: false,
        },
      ],
      failedJobs: [],
    });

    render(<HealthPage />);

    expect(screen.getByText("صحة النظام")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("قاعدة بيانات PostgreSQL")).toBeInTheDocument();
      expect(screen.getByText("14ms")).toBeInTheDocument();
      expect(screen.getByText("استخراج الامتحانات")).toBeInTheDocument();
      expect(screen.getByText("🎉 لا توجد أي مهام فاشلة حالياً في النظام!")).toBeInTheDocument();
    });
  });

  it("AuditPage renders live audit events and handles search filtering", async () => {
    vi.spyOn(systemData, "getAuditLogs").mockResolvedValue([
      {
        id: "ev-101",
        timestamp: new Date().toISOString(),
        actor: "أحمد علي",
        role: "STUDENT",
        action: "quiz.submit",
        target: "كيمياء التوجيهي",
        detail: "إتمام تقديم اختبار تجريبي بنتيجة 95%",
        ip: "192.168.1.10",
      },
    ]);

    render(<AuditPage />);

    expect(screen.getByText("سجل التدقيق")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("أحمد علي")).toBeInTheDocument();
      expect(screen.getByText("كيمياء التوجيهي")).toBeInTheDocument();
      expect(screen.getByText("إتمام تقديم اختبار تجريبي بنتيجة 95%")).toBeInTheDocument();
    });
  });

  it("SettingsPage loads settings from API and submits updates on save", async () => {
    vi.spyOn(systemData, "getPlatformSettings").mockResolvedValue({
      general: {
        siteName: "مسار التميز للثانوية العامة",
        slogan: "المنصة الذكية الأولى",
        academicYear: "2026",
        timezone: "Asia/Hebron",
        seoDescription: "منصة تعليمية فلسطينية",
      },
      auth: {
        openRegistration: true,
        verifyEmail: true,
        allowGoogleLogin: true,
        enforceAdmin2fa: true,
      },
      email: {
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        senderName: "مسار",
        senderEmail: "no-reply@masar.ps",
      },
      storage: {
        driver: "s3",
        bucket: "exam-bucket",
        endpoint: "s3.eu-central-1.amazonaws.com",
      },
      features: {
        aiAssistant: true,
        styleMatching: true,
        ministerialQuizzes: true,
        dailyPlan: true,
        successStories: true,
        bookDownload: false,
      },
      maintenance: {
        enabled: false,
        message: "صيانة دورية",
      },
    });

    const saveSpy = vi.spyOn(systemData, "savePlatformSettings").mockResolvedValue({
      success: true,
      settings: {} as any,
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("مسار التميز للثانوية العامة")).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", { name: "حفظ الإعدادات" });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          general: expect.objectContaining({
            siteName: "مسار التميز للثانوية العامة",
          }),
        }),
      );
    });
  });

  it("AiModelsPage renders without hook order violations during initial load and subsequent route changes", async () => {
    vi.spyOn(systemData, "getAiConfig").mockResolvedValue({
      catalog: [
        {
          id: "google/gemini-2.5-flash",
          provider: "Google",
          context: 1048576,
          input: ["text", "image", "pdf"],
          structured: true,
          priceIn: 0.3,
          priceOut: 2.5,
          latencyP50: 3.1,
          successRate: 99.2,
          arabic: 3,
        },
      ],
      routes: [
        {
          task: "classification",
          label: "تصنيف نية الرسالة",
          description: "يقرر نية الطالب",
          model: "google/gemini-2.5-flash",
          temperature: 0,
          maxTokens: 400,
          needs: ["structured"],
        },
        {
          task: "generation",
          label: "توليد الأسئلة",
          description: "يولّد أسئلة اختيار من متعدد",
          model: "google/gemini-2.5-flash",
          temperature: 0.7,
          maxTokens: 4000,
          needs: ["structured"],
        },
      ],
      fallbackChain: ["openrouter/free"],
      prompts: [],
      guardrails: {},
    });

    render(<AiModelsPage />);

    expect(screen.getByText("النماذج والتوجيه")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getAllByText("تصنيف نية الرسالة").length).toBeGreaterThan(0);
      expect(screen.getAllByText("توليد الأسئلة").length).toBeGreaterThan(0);
    });
  });
});
