import { describe, expect, it } from "vitest";
import {
  insightColumns,
  openAtPct,
  stepColumns,
  outcomeStats,
  readInsightMode,
  windowInsight,
  writeInsightMode,
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
  it("keeps quiet time, so the strip reads as a linear clock", () => {
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
  });
});

describe("insightColumns", () => {
  // 18 Aug 2026 is a Tuesday, so week columns must start on the 17th.
  const anchor = new Date(2026, 7, 18, 15, 30).getTime();

  it("gives one real local day for Day", () => {
    const [column] = insightColumns("day", anchor, anchor);
    expect(column.from).toBe(new Date(2026, 7, 18).getTime() / 1000);
    expect(column.to).toBe(new Date(2026, 7, 19).getTime() / 1000);
    expect(column.label).toBe("Today");
  });

  it("gives seven Monday-first days for Week", () => {
    const columns = insightColumns("week", anchor, anchor);
    expect(columns).toHaveLength(7);
    expect(columns[0].from).toBe(new Date(2026, 7, 17).getTime() / 1000);
    expect(columns[6].to).toBe(new Date(2026, 7, 24).getTime() / 1000);
    expect(columns.every((column, index) => index === 0 || column.from === columns[index - 1].to)).toBe(true);
  });

  it("snaps a Sunday anchor back to its own Monday", () => {
    const sunday = new Date(2026, 7, 23, 9).getTime();
    expect(insightColumns("week", sunday, sunday)[0].from).toBe(
      new Date(2026, 7, 17).getTime() / 1000,
    );
  });

  it("keeps a DST day at its real length", () => {
    // 25 Oct 2026: clocks go back in most of Europe, forward-shift days elsewhere.
    // Whatever the zone does, a column is a whole number of hours, never 86400
    // by assumption.
    const dst = new Date(2026, 9, 25, 12).getTime();
    const [column] = insightColumns("day", dst, dst);
    expect((column.to - column.from) % 3600).toBe(0);
    expect(column.to - column.from).toBeGreaterThanOrEqual(23 * 3600);
    expect(column.to - column.from).toBeLessThanOrEqual(25 * 3600);
  });
});

describe("openAtPct", () => {
  const tuesday = new Date(2026, 7, 18, 16, 57).getTime();
  const nowSec = Math.floor(tuesday / 1000);

  it("opens Day on the live edge", () => {
    const columns = insightColumns("day", tuesday, tuesday);
    expect(openAtPct(columns, nowSec, null)).toBeCloseTo(
      ((16 * 60 + 57) / (24 * 60)) * 100,
      5,
    );
  });

  it("measures Week against the day holding now, not against Monday", () => {
    const columns = insightColumns("week", tuesday, tuesday);
    // Monday is columns[0]; a Tuesday afternoon read off it would be ~170% and
    // scroll the grid off its own bottom.
    expect(openAtPct(columns, nowSec, null)).toBeLessThan(100);
    expect(openAtPct(columns, nowSec, null)).toBe(
      openAtPct(insightColumns("day", tuesday, tuesday), nowSec, null),
    );
  });

  it("stays under 100% for the last day of the week", () => {
    const sunday = new Date(2026, 7, 23, 23, 30).getTime();
    const columns = insightColumns("week", sunday, sunday);
    const pct = openAtPct(columns, Math.floor(sunday / 1000), null);
    expect(pct).toBeGreaterThan(95);
    expect(pct).toBeLessThan(100);
  });

  it("falls back to the first block when the range is all past", () => {
    const july = new Date(2026, 6, 1, 12).getTime();
    const columns = insightColumns("day", july, tuesday);
    expect(openAtPct(columns, nowSec, 42)).toBe(42);
    expect(openAtPct(columns, nowSec, null)).toBe(null);
  });
});

describe("stepColumns", () => {
  const tuesday = new Date(2026, 7, 18, 16, 57).getTime();

  it("steps Day by one calendar day and Week by a whole week", () => {
    expect(stepColumns("day", tuesday, -1, tuesday)[0].from).toBe(
      new Date(2026, 7, 17).getTime() / 1000,
    );
    expect(stepColumns("week", tuesday, -1, tuesday)[0].from).toBe(
      new Date(2026, 7, 10).getTime() / 1000,
    );
  });

  it("lands on a real local midnight, which fixed 86400 would miss across a clock change", () => {
    // Paging back through late October crosses a DST change in many zones; a
    // page must still start at midnight, not at 23:00 the evening before.
    const november = new Date(2026, 10, 3, 12).getTime();
    for (const mode of ["day", "week"] as const) {
      const midnight = new Date(stepColumns(mode, november, -1, november)[0].from * 1000);
      expect([midnight.getHours(), midnight.getMinutes()]).toEqual([0, 0]);
    }
  });

  it("leaves no gap between the previous page and the current one", () => {
    // The Earlier guard tests the previous page's start against the loaded
    // window, which is only sound if pages abut rather than skip time.
    for (const mode of ["day", "week"] as const) {
      const current = insightColumns(mode, tuesday, tuesday);
      const previous = stepColumns(mode, tuesday, -1, tuesday);
      expect(previous[previous.length - 1].to).toBe(current[0].from);
    }
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

  it("defaults to Day and restores the last saved mode", () => {
    const storage = memory();
    expect(readInsightMode(storage)).toBe("day");
    writeInsightMode("week", storage);
    expect(readInsightMode(storage)).toBe("week");
  });

  it("falls back to Day for a mode it no longer has, so a stored 24h migrates", () => {
    const storage = memory();
    storage.setItem("nest:insights-range", "24h");
    expect(readInsightMode(storage)).toBe("day");
  });
});
