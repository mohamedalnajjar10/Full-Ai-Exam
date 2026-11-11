import { describe, it, expect } from "vitest";
import { todayKey } from "../dailyPlan";

describe("Daily Plan Utilities", () => {
  it("formats dates in YYYY-MM-DD format using todayKey", () => {
    const fixedDate = new Date(2026, 9, 21); // Month is 0-indexed: 9 = October
    expect(todayKey(fixedDate)).toBe("2026-10-21");
  });

  it("handles leap years and month transitions", () => {
    const leapDate = new Date(2028, 1, 29); // 2028-02-29
    expect(todayKey(leapDate)).toBe("2028-02-29");
  });
});
