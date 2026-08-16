import { describe, expect, it } from "vitest";
import { placeMenuSelect } from "../../../src/dashboard/lib/placeMenuSelect";

const trigger = {
  top: 80,
  bottom: 116,
  left: 40,
  width: 220,
};

describe("placeMenuSelect", () => {
  it("opens below when there is room", () => {
    const box = placeMenuSelect(trigger, { width: 800, height: 600 }, 4);
    expect(box.openUp).toBe(false);
    expect(box.top).toBe(122);
    expect(box.left).toBe(40);
    expect(box.width).toBe(220);
  });

  it("flips up and clamps height when the trigger sits near the bottom", () => {
    const box = placeMenuSelect(
      { top: 520, bottom: 556, left: 40, width: 220 },
      { width: 800, height: 600 },
      12,
    );
    expect(box.openUp).toBe(true);
    expect(box.top).toBe(514);
    expect(box.maxHeight).toBeLessThanOrEqual(520 - 6 - 8);
    expect(box.maxHeight).toBeGreaterThan(26);
  });

  it("keeps the menu inside the viewport horizontally", () => {
    const box = placeMenuSelect(
      { top: 80, bottom: 116, left: 760, width: 220 },
      { width: 800, height: 600 },
      3,
    );
    expect(box.left + box.width).toBeLessThanOrEqual(792);
    expect(box.left).toBeGreaterThanOrEqual(8);
  });
});
