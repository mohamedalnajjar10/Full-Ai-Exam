import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AdminShell from "../AdminShell";
import * as authContext from "@/context/AuthContext";
import * as navigation from "next/navigation";

vi.mock("@/context/AuthContext");
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
}));

vi.mock("../nav", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../nav")>();
  const mockItem = {
    href: "/admin/demo-preview",
    label: "شاشة تجريبية",
    icon: actual.ALL_NAV[0].icon,
    mock: true,
  };
  return {
    ...actual,
    NAV: [
      ...actual.NAV,
      {
        section: "معاينة",
        items: [mockItem],
      },
    ],
    ALL_NAV: [...actual.ALL_NAV, mockItem],
    navFor: (user: any) => [
      ...actual.navFor(user),
      {
        section: "معاينة",
        items: [mockItem],
      },
    ],
  };
});

describe("AdminShell Component & Transparency Badges", () => {
  const mockAdminUser = {
    id: "admin-1",
    name: "مدير النظام",
    email: "admin@masar.test",
    role: "ADMIN" as const,
    permissions: [
      "settings.edit",
      "users.view",
      "users.manage",
      "content.upload",
      "ai.models",
    ] as any[],
    avatar: null,
    branchId: null,
    emailVerified: true,
    twoFactorEnabled: false,
    staffRole: {
      id: "sr-1",
      name: "مدير تقني",
      slug: "tech-admin",
      description: null,
      color: "blue",
      isSystem: true,
      permissions: [
        "settings.edit",
        "users.view",
        "users.manage",
        "content.upload",
        "ai.models",
      ] as any[],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(authContext, "useAuth").mockReturnValue({
      isLoggedIn: true,
      isLoading: false,
      user: mockAdminUser,
      selectedBranch: null,
      hasParentSession: false,
      refresh: vi.fn(),
      logout: vi.fn(),
      setSelectedBranch: vi.fn(),
      setHasParentSession: vi.fn(),
    });
  });

  it("renders mock preview alert and badge on simulated screens with mock: true", () => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/admin/demo-preview");

    render(
      <AdminShell>
        <div>محتوى تجريبي</div>
      </AdminShell>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "وضع المعاينة والعرض التجريبي",
    );
    expect(screen.getByText("بيانات تجريبية")).toBeInTheDocument();
    expect(screen.getByText("محتوى تجريبي")).toBeInTheDocument();
  });

  it("does not render mock alert on live connected pages like /admin/settings or /admin", () => {
    vi.spyOn(navigation, "usePathname").mockReturnValue("/admin/settings");

    render(
      <AdminShell>
        <div>لوحة الإعدادات الحقيقية</div>
      </AdminShell>,
    );

    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText("بيانات تجريبية")).toBeNull();
    expect(screen.getByText("لوحة الإعدادات الحقيقية")).toBeInTheDocument();
  });
});
