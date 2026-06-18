import { describe, expect, it } from "vitest";
import { initialBrainDumpStart } from "../../../src/dashboard/lib/brainDumps";
import type { BrainDump } from "../../../src/lib/types";

const dump = (id: number, createdAt: number): BrainDump => ({
  id,
  createdAt,
  title: null,
  text: `dump ${id}`,
});

describe("initialBrainDumpStart", () => {
  it("shows only the latest three dumps from the last hour", () => {
    const now = 10_000;
    const dumps = [
      dump(1, 1_000),
      dump(2, 7_000),
      dump(3, 7_500),
      dump(4, 8_000),
      dump(5, 9_500),
    ];

    expect(initialBrainDumpStart(dumps, now)).toBe(2);
  });

  it("starts empty when every dump is older than one hour", () => {
    const dumps = [dump(1, 1_000), dump(2, 2_000)];

    expect(initialBrainDumpStart(dumps, 10_000)).toBe(2);
  });
});
