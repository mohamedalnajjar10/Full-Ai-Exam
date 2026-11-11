import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ContactForm from "../ContactForm";
import * as apiClient from "@/lib/apiClient";
import * as authContext from "@/context/AuthContext";

vi.mock("@/lib/apiClient");
vi.mock("@/context/AuthContext");

describe("ContactForm Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      isLoggedIn: false,
      isLoading: false,
      user: null,
      selectedBranch: null,
      hasParentSession: false,
      refresh: vi.fn(),
      logout: vi.fn(),
      setSelectedBranch: vi.fn(),
      setHasParentSession: vi.fn(),
    });
  });

  it("displays validation errors when submitting empty form", async () => {
    render(<ContactForm />);

    const submitBtn = screen.getByRole("button", { name: /إرسال الرسالة/i });
    fireEvent.click(submitBtn);

    expect(await screen.findByText("اكتب اسمك")).toBeInTheDocument();
    expect(
      screen.getByText("البريد الإلكتروني مطلوب للرد عليك"),
    ).toBeInTheDocument();
  });

  it("submits valid form data and displays ticket reference", async () => {
    vi.spyOn(apiClient, "fetchPublic").mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    vi.spyOn(apiClient, "readJson").mockResolvedValue({
      success: true,
      ticketId: "TIC-TEST-1234",
      message: "تم استلام رسالتك بنجاح!",
    });

    render(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/الاسم الكامل/i), {
      target: { value: "محمد علي" },
    });
    fireEvent.change(screen.getByLabelText(/البريد الإلكتروني/i), {
      target: { value: "mohammed@test.com" },
    });
    fireEvent.change(screen.getByLabelText(/رسالتك/i), {
      target: {
        value: "مرحباً، لدي استفسار بخصوص منهاج التوجيهي العلمي لمادة الفيزياء.",
      },
    });

    const submitBtn = screen.getByRole("button", { name: /إرسال الرسالة/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("TIC-TEST-1234")).toBeInTheDocument();
    });
    expect(screen.getByText("تم إرسال رسالتك بنجاح!")).toBeInTheDocument();
    expect(screen.getByText(/شكراً لتواصلك معنا/i)).toBeInTheDocument();
  });
});
