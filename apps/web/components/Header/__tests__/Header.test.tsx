import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import Header from "../Header";
import * as authContext from "@/context/AuthContext";

vi.mock("@/context/AuthContext");

describe("Header Component & Persona Switcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders guest header when not logged in", () => {
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

    render(<Header />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.queryByText("لوحة ولي الأمر")).toBeNull();
  });

  it("renders parent dashboard switch pill when parent session is active", () => {
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      isLoggedIn: true,
      isLoading: false,
      user: {
        id: "u-1",
        name: "أحمد الطالب",
        email: "ahmad@test.com",
        role: "STUDENT",
        permissions: [],
        avatar: null,
        branchId: "b-1",
        emailVerified: true,
        twoFactorEnabled: false,
      },
      selectedBranch: null,
      hasParentSession: true,
      refresh: vi.fn(),
      logout: vi.fn(),
      setSelectedBranch: vi.fn(),
      setHasParentSession: vi.fn(),
    });

    render(<Header />);
    const switchPill = screen.getByText("لوحة ولي الأمر");
    expect(switchPill).toBeInTheDocument();
    expect(switchPill.closest("a")).toHaveAttribute(
      "href",
      "/parent/dashboard",
    );
  });
});
