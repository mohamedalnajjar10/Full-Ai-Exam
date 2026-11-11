import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import OfflineBanner from "../OfflineBanner";
import * as networkHook from "@/lib/useNetworkStatus";

vi.mock("@/lib/useNetworkStatus");

describe("OfflineBanner Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when online and not returning from offline state", () => {
    vi.spyOn(networkHook, "useNetworkStatus").mockReturnValue({
      isOnline: true,
      wasOffline: false,
    });

    const { container } = render(<OfflineBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders amber offline notice when offline", () => {
    vi.spyOn(networkHook, "useNetworkStatus").mockReturnValue({
      isOnline: false,
      wasOffline: false,
    });

    render(<OfflineBanner />);
    expect(
      screen.getByText(/أنت الآن في وضع عدم الاتصال بالإنترنت/i),
    ).toBeInTheDocument();
  });

  it("renders teal reconnection message when returning online", () => {
    vi.spyOn(networkHook, "useNetworkStatus").mockReturnValue({
      isOnline: true,
      wasOffline: true,
    });

    render(<OfflineBanner />);
    expect(
      screen.getByText(/تمت استعادة الاتصال بالإنترنت بنجاح/i),
    ).toBeInTheDocument();
  });

  it("accepts custom messages and class names", () => {
    vi.spyOn(networkHook, "useNetworkStatus").mockReturnValue({
      isOnline: false,
      wasOffline: false,
    });

    render(
      <OfflineBanner
        message="رسالة انقطاع مخصصة"
        className="test-custom-class"
      />,
    );
    expect(screen.getByText("رسالة انقطاع مخصصة")).toBeInTheDocument();
  });
});
