import { describe, expect, it } from "vitest";
import { NEST_ICONS, pickRandomIcon } from "../../../src/dashboard/components/PulseIcon";

describe("NEST_ICONS", () => {
  it("keeps unique keys the backend will accept", () => {
    const keys = NEST_ICONS.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(/^[a-z-]{1,32}$/);
    }
  });
});

describe("pickRandomIcon", () => {
  it("picks a catalog icon different from the current one", () => {
    const icon = pickRandomIcon("activity", () => 0);
    expect(icon).not.toBe("activity");
    expect(NEST_ICONS.some(({ key }) => key === icon)).toBe(true);
  });
});
