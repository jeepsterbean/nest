import { describe, expect, it } from "vitest";
import {
  insightCheckIns,
  insightColumns,
  insightDays,
  openAtPct,
  stepColumns,
  outcomeStats,
  readRangeMode,
  windowInsight,
  writeRangeMode,
} from "../../../src/dashboard/lib/insights";
import { layoutWorkBlocks } from "../../../src/dashboard/lib/workTimeline";
import type {
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Pulse,
  Task,
  TaskStatus,
  TaskStatusEvent,
  TaskWorkStretch,
} from "../../../src/lib/types";

const phases: Phase[] = [
  { id: 1, name: "Doing", icon: "target", color: null, createdAt: 0, inactiveSince: null },
  { id: 2, name: "Resting", icon: "coffee", color: null, createdAt: 0, inactiveSince: null },
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
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, next: string) => {
        values.set(key, next);
      },
    };
  };

  it("defaults to Day and restores the last saved mode", () => {
    const storage = memory();
    expect(readRangeMode(storage)).toBe("day");
    writeRangeMode("week", storage);
    expect(readRangeMode(storage)).toBe("week");
  });

  it("falls back to Day for a mode it no longer has, so a stored 24h migrates", () => {
    const storage = memory();
    storage.setItem("nest:insights-range", "24h");
    expect(readRangeMode(storage)).toBe("day");
  });

  it("reads the legacy storage key until the new key is set", () => {
    const storage = memory();
    storage.setItem("nest:insights-range", "week");
    expect(readRangeMode(storage)).toBe("week");
    writeRangeMode("day", storage);
    expect(storage.getItem("nest:date-range")).toBe("day");
    expect(readRangeMode(storage)).toBe("day");
  });
});

const task = (
  id: number,
  title = `Task ${id}`,
  status: TaskStatus = "active",
): Task => ({
  id,
  title,
  description: "",
  status,
  workingNow: false,
  workedSeconds: 0,
  workStartedAt: null,
  scope: null,
  value: null,
  effort: null,
  parentTaskId: null,
  createdAt: 0,
  updatedAt: 0,
});

const stretch = (
  id: number,
  taskId: number,
  startedAt: number,
  endedAt: number | null,
): TaskWorkStretch => ({ id, taskId, startedAt, endedAt });

describe("insightDays", () => {
  const monday = new Date(2026, 7, 17).getTime() / 1000;
  const tuesday = new Date(2026, 7, 18).getTime() / 1000;
  const wednesday = new Date(2026, 7, 19).getTime() / 1000;
  const columns = [
    { from: monday, to: tuesday, label: "Mon 17" },
    { from: tuesday, to: wednesday, label: "Tue 18" },
  ];

  it("groups Worked time by status, live work first", () => {
    const tasks = [
      task(1, "Write", "active"),
      task(2, "Review", "completed"),
      task(3, "Drop", "cancelled"),
    ];
    const blocks = layoutWorkBlocks(
      [
        stretch(1, 1, monday + 3600, monday + 7200),
        stretch(2, 3, monday + 8000, monday + 8600),
        stretch(3, 2, tuesday + 1800, tuesday + 3600),
      ],
      tasks,
      monday,
      wednesday,
      wednesday * 1000,
    );
    const days = insightDays(columns, blocks, tasks, [], wednesday);
    expect(
      days[0].groups.map((group) => [
        group.status,
        group.rows.map((row) => [row.task.title, row.seconds]),
      ]),
    ).toEqual([
      ["active", [["Write", 3600]]],
      ["cancelled", [["Drop", 600]]],
    ]);
    expect(
      days[1].groups.map((group) => [
        group.status,
        group.rows.map((row) => [row.task.title, row.seconds]),
      ]),
    ).toEqual([["completed", [["Review", 1800]]]]);
  });

  it("keeps Monday under Active when the Task is completed later in the week", () => {
    const events: TaskStatusEvent[] = [
      {
        id: 1,
        taskId: 1,
        fromStatus: "active",
        toStatus: "completed",
        createdAt: tuesday + 100,
      },
    ];
    const days = insightDays(
      columns,
      layoutWorkBlocks(
        [stretch(1, 1, monday + 3600, monday + 7200)],
        [task(1, "Write", "completed")],
        monday,
        wednesday,
        wednesday * 1000,
      ),
      [task(1, "Write", "completed")],
      events,
      wednesday,
    );
    expect(days[0].groups.map((group) => group.status)).toEqual(["active"]);
    expect(
      days[1].groups.map((group) => [
        group.status,
        group.rows.map((row) => [row.task.title, row.seconds]),
      ]),
    ).toEqual([["completed", [["Write", 0]]]]);
  });

  it("puts a same-day completion under Completed", () => {
    const events: TaskStatusEvent[] = [
      {
        id: 1,
        taskId: 1,
        fromStatus: "active",
        toStatus: "completed",
        createdAt: monday + 8000,
      },
    ];
    const days = insightDays(
      columns,
      layoutWorkBlocks(
        [stretch(1, 1, monday + 3600, monday + 7200)],
        [task(1, "Write", "completed")],
        monday,
        wednesday,
        wednesday * 1000,
      ),
      [task(1, "Write", "completed")],
      events,
      wednesday,
    );
    expect(days[0].groups.map((group) => group.status)).toEqual(["completed"]);
  });

  it("uses the last same-day closed status when events arrive out of order", () => {
    const tasks = [task(1, "Write", "cancelled")];
    const events: TaskStatusEvent[] = [
      {
        id: 2,
        taskId: 1,
        fromStatus: "completed",
        toStatus: "cancelled",
        createdAt: monday + 2000,
      },
      {
        id: 1,
        taskId: 1,
        fromStatus: "active",
        toStatus: "completed",
        createdAt: monday + 1000,
      },
    ];
    const days = insightDays(
      columns,
      layoutWorkBlocks([], tasks, monday, wednesday, wednesday * 1000),
      tasks,
      events,
      wednesday,
    );

    expect(days[0].groups.map((group) => group.status)).toEqual(["cancelled"]);
  });

  it("lists Completions and Cancellations with no Worked time that day", () => {
    const tasks = [
      task(1, "Ship", "completed"),
      task(2, "Drop", "cancelled"),
    ];
    const events: TaskStatusEvent[] = [
      {
        id: 1,
        taskId: 1,
        fromStatus: "active",
        toStatus: "completed",
        createdAt: monday + 1000,
      },
      {
        id: 2,
        taskId: 2,
        fromStatus: "active",
        toStatus: "cancelled",
        createdAt: monday + 2000,
      },
    ];
    const days = insightDays(
      columns,
      layoutWorkBlocks([], tasks, monday, wednesday, wednesday * 1000),
      tasks,
      events,
      wednesday,
    );
    expect(
      days[0].groups.map((group) => [
        group.status,
        group.rows.map((row) => [row.task.title, row.seconds]),
      ]),
    ).toEqual([
      ["completed", [["Ship", 0]]],
      ["cancelled", [["Drop", 0]]],
    ]);
  });

  it("leaves future days empty instead of calling them quiet", () => {
    const noonMonday = monday + 12 * 3600;
    const days = insightDays(
      columns,
      layoutWorkBlocks(
        [stretch(1, 1, monday + 3600, monday + 7200)],
        [task(1)],
        monday,
        wednesday,
        noonMonday * 1000,
      ),
      [task(1)],
      [],
      noonMonday,
    );
    expect(days[0].isToday).toBe(true);
    expect(days[1].isFuture).toBe(true);
    expect(days[1].groups).toEqual([]);
  });
});

describe("insightCheckIns", () => {
  const metric = (id: number, name: string): Metric => ({
    id,
    name,
    icon: "heart",
    createdAt: 0,
    color: null,
  });
  const pulse = (id: number, name: string, metricIds: number[]): Pulse => ({
    id,
    name,
    icon: "activity",
    createdAt: 0,
    metricIds,
  });
  const checkIn = (
    id: number,
    createdAt: number,
    pulseId: number,
    ratings: { metricId: number; value: number }[],
  ): MetricCheckInWithRatings => ({
    id,
    createdAt,
    pulseId,
    pulseName: "Daily",
    ratings: ratings.map((rating) => ({ checkInId: id, ...rating })),
  });

  it("groups ratings by Pulse in Pulse order, with averages", () => {
    const groups = insightCheckIns(
      [
        checkIn(1, 20, 2, [{ metricId: 3, value: 2 }]),
        checkIn(2, 10, 1, [
          { metricId: 1, value: 4 },
          { metricId: 2, value: 5 },
        ]),
        checkIn(3, 30, 1, [{ metricId: 1, value: 2 }]),
      ],
      [metric(1, "Energy"), metric(2, "Focus"), metric(3, "Mood")],
      [pulse(1, "Body", [1, 2]), pulse(2, "Mind", [3])],
      { from: 0, to: 100 },
    );
    expect(groups.map((group) => group.name)).toEqual(["Body", "Mind"]);
    expect(groups[0].checkInCount).toBe(2);
    expect(groups[0].metrics.map((row) => [row.name, row.values, row.average])).toEqual([
      ["Energy", [4, 2], 3],
      ["Focus", [5], 5],
    ]);
  });

  it("omits check-ins outside the range", () => {
    expect(
      insightCheckIns(
        [checkIn(1, 5, 1, [{ metricId: 1, value: 4 }])],
        [metric(1, "Energy")],
        [pulse(1, "Body", [1])],
        { from: 10, to: 20 },
      ),
    ).toEqual([]);
  });
});
