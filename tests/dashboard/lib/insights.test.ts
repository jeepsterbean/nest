import { describe, expect, it } from "vitest";
import {
  outcomeStats,
  readInsightRange,
  windowInsight,
  writeInsightRange,
} from "../../../src/dashboard/lib/insights";
import type { Phase, PhaseCheckIn } from "../../../src/lib/types";

const phases: Phase[] = [
  { id: 1, name: "Doing", createdAt: 0, inactiveSince: null },
  { id: 2, name: "Resting", createdAt: 0, inactiveSince: null },
];

const phaseCheckIn = (
  id: number,
  createdAt: number,
  phaseId: number,
): PhaseCheckIn => ({
  id,
  createdAt,
  phaseId,
  phaseLabel: null,
});

describe("outcomeStats", () => {
  it("uses zeros when nothing was scored", () => {
    expect(outcomeStats([], [], [], { from: 0, to: 100 })).toEqual([
      { label: "Completed", value: "0" },
      { label: "Value", value: "0" },
      { label: "Effort", value: "0" },
      { label: "Check-ins", value: "0" },
    ]);
  });
});

describe("windowInsight", () => {
  it("keeps quiet time in totals and trims it from the strip", () => {
    const insight = windowInsight(
      [],
      [],
      [],
      [
        phaseCheckIn(1, 0, 1),
        phaseCheckIn(2, 80, 2),
      ],
      phases,
      0,
      200,
    );
    expect(insight.sessions).toEqual([
      { phaseId: 1, from: 0, to: 80 },
      { phaseId: 2, from: 80, to: 200 },
    ]);
    expect(insight.stripSessions).toEqual([{ phaseId: 1, from: 0, to: 80 }]);
  });
});

describe("insight range memory", () => {
  const memory = () => {
    let value: string | null = null;
    return {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };
  };

  it("defaults to 24 hours and restores the last saved range", () => {
    const storage = memory();
    expect(readInsightRange(storage)).toBe("24h");
    writeInsightRange("7d", storage);
    expect(readInsightRange(storage)).toBe("7d");
  });

  it("ignores unknown stored values", () => {
    const storage = memory();
    storage.setItem("nest:insights-range", "yesterday");
    expect(readInsightRange(storage)).toBe("24h");
  });
});
