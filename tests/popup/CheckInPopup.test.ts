import { describe, expect, it } from "vitest";
import { shouldRescheduleAfterCompletion } from "../../src/popup/CheckInPopup";

describe("check-in completion cadence", () => {
  it("preserves a running timer after a manual check-in", () => {
    expect(shouldRescheduleAfterCompletion(false)).toBe(false);
    expect(shouldRescheduleAfterCompletion(true)).toBe(true);
  });
});
