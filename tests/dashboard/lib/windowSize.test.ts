import { describe, expect, it } from "vitest";
import { nextDashboardSize } from "../../../src/dashboard/lib/windowSize";

describe("nextDashboardSize", () => {
  it("steps in both directions and respects the window bounds", () => {
    expect(nextDashboardSize(900, 700, 1200, 900, 1)).toEqual({
      width: 1000,
      height: 780,
    });
    expect(nextDashboardSize(600, 500, 1200, 900, -1)).toEqual({
      width: 600,
      height: 500,
    });
    expect(nextDashboardSize(1200, 900, 1200, 900, 1)).toEqual({
      width: 1200,
      height: 900,
    });
  });
});
