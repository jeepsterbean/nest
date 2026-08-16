import { describe, expect, it } from "vitest";
import { NEST_ICONS, pickRandomIcon } from "../../../src/dashboard/components/PulseIcon";

describe("pickRandomIcon", () => {
  it("picks a catalog icon different from the current one", () => {
    const icon = pickRandomIcon("activity", () => 0);
    expect(icon).not.toBe("activity");
    expect(NEST_ICONS.some(({ key }) => key === icon)).toBe(true);
  });
});
