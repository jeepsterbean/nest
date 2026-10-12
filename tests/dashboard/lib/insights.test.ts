import { describe, expect, it } from "vitest";
import {
  insightBrainDumps,
  insightCheckInClosedTo,
  insightCheckIns,
  insightColumns,
  insightTaskGroups,
  openAtPct,
  stepColumns,
  rangeInsight,
  readCalendarFigure,
  readCalendarInsightsShown,
  readCalendarPresentation,
  readCalendarRangeMode,
  readInsightLastHour,
  lastHourPeriod,
  lastHourSpanLabel,
  LAST_HOUR_WINDOW_SECONDS,
  writeCalendarFigure,
  writeCalendarPresentation,
  type InsightData,
  writeCalendarInsightsShown,
  writeCalendarRangeMode,
  writeInsightLastHour,
} from "../../../src/dashboard/lib/insights";

describe("insightBrainDumps", () => {
  it("counts dumps within the range and groups overlapping Tags by frequency", () => {
    const work = { id: 1, name: "Work" };
    const ideas = { id: 2, name: "Ideas" };
    expect(insightBrainDumps([
      { id: 1, createdAt: 9, text: "Before", tags: [work] },
      { id: 2, createdAt: 10, text: "Start", tags: [work, ideas] },
      { id: 3, createdAt: 15, text: "Middle", tags: [work] },
      { id: 4, createdAt: 19, text: "Untagged", tags: [] },
      { id: 5, createdAt: 20, text: "End", tags: [ideas] },
    ], { from: 10, to: 20 })).toEqual({
      count: 3,
      tags: [{ ...work, count: 2 }, { ...ideas, count: 1 }],
      untaggedCount: 1,
    });
  });

  it("returns an empty summary for a quiet range", () => {
    expect(insightBrainDumps([], { from: 10, to: 20 })).toEqual({
      count: 0, tags: [], untaggedCount: 0,
    });
  });
});
import { layoutWorkBlocks } from "../../../src/dashboard/lib/workTimeline";
import { formatTime } from "../../../src/dashboard/lib/time";
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

describe("last hour window", () => {
  it("is the rolling hour ending at now", () => {
    expect(lastHourPeriod(10_000)).toEqual({
      from: 10_000 - LAST_HOUR_WINDOW_SECONDS,
      to: 10_000,
    });
  });
});
describe("rangeInsight", () => {
  const empty: InsightData = {
    tasks: [],
    taskStatusEvents: [],
    taskWorkStretches: [],
    metrics: [],
    pulses: [],
    checkIns: [],
    phaseCheckIns: [],
    phases,
    brainDumps: [],
  };
  const clockAt = (nowSec: number, checkInNowSec = nowSec) => ({
    nowMs: nowSec * 1000,
    nowSec,
    checkInNowMs: checkInNowSec * 1000,
  });

  it("keeps quiet time in the Phase mix, so it reads as a linear clock", () => {
    const insight = rangeInsight(
      { ...empty, phaseCheckIns: [phaseCheckIn(1, 0, 1), phaseCheckIn(2, 80, 2)] },
      { from: 0, to: 200, live: false },
      clockAt(500),
    );
    expect(insight.sessions).toEqual([
      { phaseId: 1, from: 0, to: 80 },
      { phaseId: 2, from: 80, to: 200 },
    ]);
  });

  it("stops the Phase mix at now inside a range still running", () => {
    const insight = rangeInsight(
      { ...empty, phaseCheckIns: [phaseCheckIn(1, 0, 1)] },
      { from: 0, to: 200, live: false },
      clockAt(120),
    );
    expect(insight.sessions).toEqual([{ phaseId: 1, from: 0, to: 120 }]);
  });

  it("returns every section for a quiet range", () => {
    const insight = rangeInsight(
      empty,
      { ...lastHourPeriod(10_000), live: true },
      clockAt(10_000),
    );
    expect(insight.brainDumps).toEqual({ count: 0, tags: [], untaggedCount: 0 });
    expect(insight.taskGroups.map((group) => group.rows.length)).toEqual([0, 0, 0]);
    expect(insight.checkIns).toEqual([]);
  });

  it("lets a live range show a check-in and dump saved after its clock end", () => {
    const savedAt = 10_030;
    const data: InsightData = {
      ...empty,
      checkIns: [
        { id: 1, createdAt: savedAt, pulseId: null, pulseName: "Daily", ratings: [] },
      ],
      brainDumps: [{ id: 1, createdAt: savedAt, text: "Thought", tags: [] }],
    };
    const range = lastHourPeriod(10_000);
    const live = rangeInsight(data, { ...range, live: true }, clockAt(10_000, savedAt));
    expect(live.checkIns.map((group) => group.checkInCount)).toEqual([1]);
    expect(live.brainDumps.count).toBe(1);

    const closed = rangeInsight(data, { ...range, live: false }, clockAt(10_000, savedAt));
    expect(closed.checkIns).toEqual([]);
    expect(closed.brainDumps.count).toBe(0);
  });

  it("ledgers Worked time from the range's Work stretches", () => {
    const insight = rangeInsight(
      {
        ...empty,
        tasks: [task(1, "Write")],
        taskWorkStretches: [stretch(1, 1, 100, 400)],
      },
      { from: 0, to: 1_000, live: false },
      clockAt(2_000),
    );
    expect(
      insight.taskGroups.map((group) => [
        group.outcome,
        group.rows.map((row) => [row.task.title, row.seconds]),
      ]),
    ).toEqual([
      ["completed", []],
      ["cancelled", []],
      ["incomplete", [["Write", 300]]],
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
    expect(readCalendarRangeMode(storage)).toBe("day");
    writeCalendarRangeMode("week", storage);
    expect(readCalendarRangeMode(storage)).toBe("week");
  });

  it("reads a stored Last hour range as Day", () => {
    const storage = memory();
    storage.setItem("nest:date-range", "lastHour");
    expect(readCalendarRangeMode(storage)).toBe("day");
  });

  it("remembers Last hour on Insights until it is turned off", () => {
    const storage = memory();
    expect(readInsightLastHour(storage)).toBe(false);
    writeInsightLastHour(true, storage);
    expect(readInsightLastHour(storage)).toBe(true);
    writeInsightLastHour(false, storage);
    expect(readInsightLastHour(storage)).toBe(false);
  });

  it("falls back to Day for a mode it no longer has, so a stored 24h migrates", () => {
    const storage = memory();
    storage.setItem("nest:insights-range", "24h");
    expect(readCalendarRangeMode(storage)).toBe("day");
  });

  it("reads the legacy storage key until the new key is set", () => {
    const storage = memory();
    storage.setItem("nest:insights-range", "week");
    expect(readCalendarRangeMode(storage)).toBe("week");
    writeCalendarRangeMode("day", storage);
    expect(storage.getItem("nest:date-range")).toBe("day");
    expect(readCalendarRangeMode(storage)).toBe("day");
  });

  it("draws Work stretch until Logs is chosen", () => {
    const storage = memory();
    expect(readCalendarFigure(storage)).toBe("stretch");
    writeCalendarFigure("logs", storage);
    expect(readCalendarFigure(storage)).toBe("logs");
    writeCalendarFigure("stretch", storage);
    expect(readCalendarFigure(storage)).toBe("stretch");
  });

  it("defaults to Calendar and restores the last presentation", () => {
    const storage = memory();
    expect(readCalendarPresentation(storage)).toBe("calendar");
    writeCalendarPresentation("timeline", storage);
    expect(readCalendarPresentation(storage)).toBe("timeline");
    writeCalendarPresentation("calendar", storage);
    expect(readCalendarPresentation(storage)).toBe("calendar");
  });

  it("falls back to Calendar for an unknown presentation", () => {
    const storage = memory();
    storage.setItem("nest:calendar-presentation", "agenda");
    expect(readCalendarPresentation(storage)).toBe("calendar");
  });

  it("shows Insights beside the grid until it is hidden", () => {
    const storage = memory();
    expect(readCalendarInsightsShown(storage)).toBe(true);
    writeCalendarInsightsShown(false, storage);
    expect(readCalendarInsightsShown(storage)).toBe(false);
    writeCalendarInsightsShown(true, storage);
    expect(readCalendarInsightsShown(storage)).toBe(true);
  });

  it("reads the retired Insights-only display as Insights shown", () => {
    const storage = memory();
    storage.setItem("nest:calendar-display", "insights");
    expect(readCalendarInsightsShown(storage)).toBe(true);
  });

  it("labels Last hour with the clock span it covers", () => {
    const now = new Date(2026, 8, 29, 15, 4).getTime() / 1000;
    expect(lastHourSpanLabel(now)).toBe(
      `${formatTime(now - 3600)} – ${formatTime(now)}`,
    );
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

describe("insightTaskGroups", () => {
  const monday = new Date(2026, 7, 17).getTime() / 1000;
  const tuesday = new Date(2026, 7, 18).getTime() / 1000;
  const wednesday = new Date(2026, 7, 19).getTime() / 1000;
  const mondayOnly = { from: monday, to: tuesday };
  const twoDays = { from: monday, to: wednesday };
  const summarize = (groups: ReturnType<typeof insightTaskGroups>) =>
    nonEmpty(groups).map((group) => [
      group.outcome,
      group.rows.map((row) => [row.task.title, row.seconds]),
    ]);
  const nonEmpty = (groups: ReturnType<typeof insightTaskGroups>) =>
    groups.filter((group) => group.rows.length > 0);
  const statusEvent = (
    id: number,
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
    createdAt: number,
  ): TaskStatusEvent => ({ id, taskId: 1, fromStatus, toStatus, createdAt });

  it("groups Worked time by outcome: Completed, Cancelled, then Incomplete", () => {
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
    expect(
      summarize(insightTaskGroups(mondayOnly, blocks, tasks, [], wednesday)),
    ).toEqual([
      ["cancelled", [["Drop", 600]]],
      ["incomplete", [["Write", 3600]]],
    ]);
  });

  it("totals each group's Worked time, 0 for an empty group", () => {
    const tasks = [
      task(1, "Write", "active"),
      task(2, "Edit", "active"),
    ];
    const blocks = layoutWorkBlocks(
      [
        stretch(1, 1, monday + 3600, monday + 7200),
        stretch(2, 2, monday + 8000, monday + 8600),
      ],
      tasks,
      monday,
      wednesday,
      wednesday * 1000,
    );
    expect(
      insightTaskGroups(mondayOnly, blocks, tasks, [], wednesday).map(
        (group) => [group.outcome, group.seconds],
      ),
    ).toEqual([
      ["completed", 0],
      ["cancelled", 0],
      ["incomplete", 4200],
    ]);
  });

  it("sums a Task's Worked time across every day of a longer range", () => {
    const tasks = [task(1, "Write", "active")];
    const blocks = layoutWorkBlocks(
      [
        stretch(1, 1, monday + 3600, monday + 7200),
        stretch(2, 1, tuesday + 1800, tuesday + 3600),
      ],
      tasks,
      monday,
      wednesday,
      wednesday * 1000,
    );
    expect(
      summarize(insightTaskGroups(twoDays, blocks, tasks, [], wednesday)),
    ).toEqual([["incomplete", [["Write", 5400]]]]);
  });

  it("files a Task under its status at the range's end, once", () => {
    const tasks = [task(1, "Write", "completed")];
    const events: TaskStatusEvent[] = [
      {
        id: 1,
        taskId: 1,
        fromStatus: "active",
        toStatus: "completed",
        createdAt: tuesday + 100,
      },
    ];
    const blocks = layoutWorkBlocks(
      [stretch(1, 1, monday + 3600, monday + 7200)],
      tasks,
      monday,
      wednesday,
      wednesday * 1000,
    );
    expect(
      summarize(insightTaskGroups(twoDays, blocks, tasks, events, wednesday)),
    ).toEqual([["completed", [["Write", 3600]]]]);
    expect(
      nonEmpty(
        insightTaskGroups(mondayOnly, blocks, tasks, events, wednesday),
      ).map((group) => group.outcome),
    ).toEqual(["incomplete"]);
  });

  it("uses the last closed status when events arrive out of order", () => {
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
    const groups = insightTaskGroups(
      mondayOnly,
      layoutWorkBlocks([], tasks, monday, wednesday, wednesday * 1000),
      tasks,
      events,
      wednesday,
    );
    expect(nonEmpty(groups).map((group) => group.outcome)).toEqual([
      "cancelled",
    ]);
  });

  it("lists Completions and Cancellations with no Worked time in the range", () => {
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
        createdAt: tuesday + 2000,
      },
    ];
    const groups = insightTaskGroups(
      twoDays,
      layoutWorkBlocks([], tasks, monday, wednesday, wednesday * 1000),
      tasks,
      events,
      wednesday,
    );
    expect(summarize(groups)).toEqual([
      ["completed", [["Ship", 0]]],
      ["cancelled", [["Drop", 0]]],
    ]);
  });

  it("calls worked Tasks moved back to Up next or Backlog Incomplete", () => {
    const tasks = [task(1, "Write", "up_next"), task(2, "Plan", "backlog")];
    const blocks = layoutWorkBlocks(
      [
        stretch(1, 1, monday + 3600, monday + 7200),
        stretch(2, 2, monday + 8000, monday + 8600),
      ],
      tasks,
      monday,
      wednesday,
      wednesday * 1000,
    );
    expect(
      summarize(insightTaskGroups(mondayOnly, blocks, tasks, [], wednesday)),
    ).toEqual([["incomplete", [["Write", 3600], ["Plan", 600]]]]);
  });

  it("calls a worked completion reopened in the range Incomplete", () => {
    const tasks = [task(1, "Write", "active")];
    const events = [
      statusEvent(1, "active", "completed", monday + 7300),
      statusEvent(2, "completed", "active", monday + 8000),
    ];
    const blocks = layoutWorkBlocks(
      [stretch(1, 1, monday + 3600, monday + 7200)],
      tasks,
      monday,
      wednesday,
      wednesday * 1000,
    );
    expect(
      summarize(insightTaskGroups(mondayOnly, blocks, tasks, events, wednesday)),
    ).toEqual([["incomplete", [["Write", 3600]]]]);
  });

  it("leaves out a completion reopened in the range with no Worked time", () => {
    const tasks = [task(1, "Write", "active")];
    const events = [
      statusEvent(1, "active", "completed", monday + 1000),
      statusEvent(2, "completed", "active", monday + 2000),
    ];
    expect(
      summarize(
        insightTaskGroups(
          mondayOnly,
          layoutWorkBlocks([], tasks, monday, wednesday, wednesday * 1000),
          tasks,
          events,
          wednesday,
        ),
      ),
    ).toEqual([]);
  });

  it("files a completion later cancelled in the range under Cancelled", () => {
    const tasks = [task(1, "Write", "cancelled")];
    const events = [
      statusEvent(1, "active", "completed", monday + 1000),
      statusEvent(2, "completed", "cancelled", monday + 2000),
    ];
    expect(
      summarize(
        insightTaskGroups(
          mondayOnly,
          layoutWorkBlocks([], tasks, monday, wednesday, wednesday * 1000),
          tasks,
          events,
          wednesday,
        ),
      ),
    ).toEqual([["cancelled", [["Write", 0]]]]);
  });

  it("returns every outcome in order, even when the range is quiet", () => {
    const tasks = [task(1, "Write", "active")];
    const blocks = layoutWorkBlocks(
      [stretch(1, 1, monday + 3600, monday + 7200)],
      tasks,
      monday,
      wednesday,
      wednesday * 1000,
    );
    expect(
      insightTaskGroups(mondayOnly, blocks, tasks, [], wednesday).map(
        (group) => [group.outcome, group.rows.length],
      ),
    ).toEqual([
      ["completed", 0],
      ["cancelled", 0],
      ["incomplete", 1],
    ]);
  });

  it("returns three empty groups for a range that has not started", () => {
    const noonMonday = monday + 12 * 3600;
    expect(
      insightTaskGroups(
        { from: tuesday, to: wednesday },
        layoutWorkBlocks([], [task(1)], monday, wednesday, noonMonday * 1000),
        [task(1)],
        [],
        noonMonday,
      ),
    ).toEqual([
      { outcome: "completed", rows: [], seconds: 0 },
      { outcome: "cancelled", rows: [], seconds: 0 },
      { outcome: "incomplete", rows: [], seconds: 0 },
    ]);
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
    expect(groups[0].average).toBeCloseTo(11 / 3);
    expect(groups[0].metrics.map((row) => [row.name, row.values, row.average])).toEqual([
      ["Energy", [4, 2], 3],
      ["Focus", [5], 5],
    ]);
  });

  it("lists a Pulse with no check-ins in the range", () => {
    const groups = insightCheckIns(
      [checkIn(1, 20, 2, [{ metricId: 3, value: 2 }])],
      [metric(1, "Energy"), metric(3, "Mood")],
      [pulse(1, "Body", [1]), pulse(2, "Mind", [3])],
      { from: 0, to: 100 },
    );
    expect(groups.map((group) => [group.name, group.checkInCount, group.average])).toEqual([
      ["Body", 0, null],
      ["Mind", 1, 2],
    ]);
    expect(groups[0].metrics).toEqual([]);
  });

  it("omits check-ins outside the range and still lists the Pulse", () => {
    expect(
      insightCheckIns(
        [checkIn(1, 5, 1, [{ metricId: 1, value: 4 }])],
        [metric(1, "Energy")],
        [pulse(1, "Body", [1])],
        { from: 10, to: 20 },
      ),
    ).toEqual([
      {
        pulseId: 1,
        name: "Body",
        icon: "activity",
        checkInCount: 0,
        average: null,
        metrics: [],
      },
    ]);
  });

  it("keeps a just-saved check-in the minute clock would still treat as future", () => {
    const staleNowSec = 100;
    const createdAt = 130;
    const rangeTo = 10_000;
    const liveTo = insightCheckInClosedTo(rangeTo, createdAt * 1000);
    expect(createdAt < staleNowSec).toBe(false);
    expect(
      insightCheckIns(
        [checkIn(1, createdAt, 1, [{ metricId: 1, value: 4 }])],
        [metric(1, "Energy")],
        [pulse(1, "Body", [1])],
        { from: 0, to: liveTo },
      ),
    ).toHaveLength(1);
  });

  it("does not open a past range past its end", () => {
    expect(insightCheckInClosedTo(20, 50_000)).toBe(20);
  });

  it("does not clamp Last hour to the stale minute-clock end", () => {
    const staleNowSec = 100;
    const createdAt = 130;
    const liveTo = insightCheckInClosedTo(staleNowSec, createdAt * 1000, true);
    expect(liveTo).toBe(createdAt + 1);
    expect(insightCheckInClosedTo(staleNowSec, createdAt * 1000)).toBe(staleNowSec);
    expect(
      insightCheckIns(
        [checkIn(1, createdAt, 1, [{ metricId: 1, value: 4 }])],
        [metric(1, "Energy")],
        [pulse(1, "Body", [1])],
        { from: staleNowSec - 3600, to: liveTo },
      ),
    ).toHaveLength(1);
  });
});
