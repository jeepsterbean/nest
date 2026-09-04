import { describe, expect, it } from "vitest";
import {
  buildMetricSeries,
  buildRawLog,
  buildTimeline,
  collapsePhaseCheckIns,
  groupByDay,
  mergePhaseCheckInsIntoEvents,
  phaseCheckInAt,
  phaseCheckInsInRange,
  phaseSessions,
  phaseSessionsInWindow,
  phaseSessionTotals,
  trimQuietPhaseSessions,
} from "../../../src/dashboard/lib/timeline";
import type {
  BrainDump,
  MetricCheckInWithRatings,
  PhaseCheckIn,
  TaskWorkStretch,
} from "../../../src/lib/types";

const metricCheckIn = (
  id: number,
  createdAt: number,
  ratings: { metricId: number; value: number }[],
): MetricCheckInWithRatings => ({
  id,
  createdAt,
  pulseId: 1,
  pulseName: "Daily pulse",
  ratings: ratings.map((r) => ({ checkInId: id, ...r })),
});

const phaseCheckIn = (
  id: number,
  createdAt: number,
  phaseId: number | null = id,
): PhaseCheckIn => ({
  id,
  createdAt,
  phaseId,
  phaseLabel: null,
});

const dump = (id: number, createdAt: number): BrainDump => ({
  id,
  createdAt,
  text: `dump ${id}`,
  tags: [],
});

const sec = (d: Date) => Math.floor(d.getTime() / 1000);

describe("buildTimeline", () => {
  it("orders newest-first", () => {
    const events = buildTimeline([metricCheckIn(1, 100, [])], [], [dump(1, 200)]);
    expect(events.map((e) => e.at)).toEqual([200, 100]);
  });

  it("breaks same-second ties as dump -> metrics -> phase", () => {
    const events = buildTimeline(
      [metricCheckIn(1, 1000, [])],
      [phaseCheckIn(1, 1000)],
      [dump(1, 1000)],
    );
    expect(events.map((e) => e.kind)).toEqual(["dump", "metrics", "phase"]);
  });
});

const stretch = (
  id: number,
  taskId: number,
  startedAt: number,
  endedAt: number | null,
): TaskWorkStretch => ({ id, taskId, startedAt, endedAt });

describe("buildRawLog", () => {
  it("merges work start/stop with other events, newest-first", () => {
    const events = buildRawLog(
      [metricCheckIn(1, 150, [])],
      [],
      [dump(1, 300)],
      [stretch(1, 9, 100, 200), stretch(2, 9, 250, null)],
    );
    expect(events.map((e) => e.kind)).toEqual([
      "dump",
      "work-start",
      "work-stop",
      "metrics",
      "work-start",
    ]);
    expect(events.map((e) => e.at)).toEqual([300, 250, 200, 150, 100]);
  });

  it("omits stop for an open stretch", () => {
    const events = buildRawLog([], [], [], [stretch(1, 1, 50, null)]);
    expect(events).toEqual([
      { kind: "work-start", at: 50, stretch: stretch(1, 1, 50, null) },
    ]);
  });
});

describe("groupByDay", () => {
  const now = new Date(2026, 5, 17, 10, 0).getTime();
  const at = (day: number, hour: number) =>
    Math.floor(new Date(2026, 5, day, hour).getTime() / 1000);

  it("collapses same-day events and splits across days", () => {
    const events = buildTimeline(
      [],
      [],
      [dump(1, at(17, 12)), dump(2, at(17, 9)), dump(3, at(16, 12))],
    );
    const groups = groupByDay(events, now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
    expect(groups.map((g) => g.events.length)).toEqual([2, 1]);
  });

  it("keeps every Phase checkpoint for Raw", () => {
    const now = new Date(2026, 5, 17, 10, 0).getTime();
    const flicker = sec(new Date(2026, 5, 17, 9, 37));
    const groups = groupByDay(
      buildTimeline(
        [],
        [
          phaseCheckIn(1, sec(new Date(2026, 5, 17, 9, 31)), SCOPING),
          phaseCheckIn(2, flicker, RESTING),
          phaseCheckIn(3, flicker, SCOPING),
        ],
        [],
      ),
      now,
    );
    expect(groups[0].events.map((event) => event.kind)).toEqual([
      "phase",
      "phase",
      "phase",
    ]);
  });
});

describe("mergePhaseCheckInsIntoEvents", () => {
  it("pairs newest-first events with the Phase active at each event", () => {
    const events = buildTimeline(
      [],
      [],
      [dump(1, 210), dump(2, 100), dump(3, 40)],
    );
    const paired = mergePhaseCheckInsIntoEvents(events, [
      phaseCheckIn(2, 150, SCOPING),
      phaseCheckIn(1, 50, RESTING),
      phaseCheckIn(4, 200, DOING),
      phaseCheckIn(3, 200, SCOPING),
    ]);

    expect(paired.map(({ phaseCheckIn }) => phaseCheckIn?.id ?? null)).toEqual([
      4,
      1,
      null,
    ]);
  });
});

describe("buildMetricSeries", () => {
  it("groups values per metric in chronological order with multi-rating fan-out", () => {
    const series = buildMetricSeries([
      metricCheckIn(1, 100, [
        { metricId: 1, value: 3 },
        { metricId: 2, value: 5 },
      ]),
      metricCheckIn(2, 50, [{ metricId: 1, value: 2 }]),
    ]);
    expect(series.get(1)).toEqual([2, 3]);
    expect(series.get(2)).toEqual([5]);
  });
});

const DOING = 1;
const SCOPING = 2;
const RESTING = 3;
const isQuiet = (phaseId: number | null) =>
  phaseId === null || phaseId === RESTING;

describe("collapsePhaseCheckIns", () => {
  it("keeps a burst's landed phase and drops a same-phase flicker", () => {
    expect(
      collapsePhaseCheckIns([
        phaseCheckIn(1, 100, RESTING),
        phaseCheckIn(2, 130, SCOPING),
        phaseCheckIn(3, 150, DOING),
      ]).map((checkIn) => checkIn.phaseId),
    ).toEqual([DOING]);
  });

  it("omits a burst that lands back on the phase before it", () => {
    const scoping = sec(new Date(2026, 5, 17, 9, 31));
    const flicker = sec(new Date(2026, 5, 17, 9, 37));
    expect(
      collapsePhaseCheckIns([
        phaseCheckIn(1, scoping, SCOPING),
        phaseCheckIn(2, flicker, RESTING),
        phaseCheckIn(3, flicker, SCOPING),
      ]),
    ).toEqual([phaseCheckIn(1, scoping, SCOPING)]);
  });

  it("keeps settled changes more than a minute apart", () => {
    expect(
      collapsePhaseCheckIns([
        phaseCheckIn(1, 100, SCOPING),
        phaseCheckIn(2, 161, DOING),
      ]).map((checkIn) => ({ at: checkIn.createdAt, phaseId: checkIn.phaseId })),
    ).toEqual([
      { at: 100, phaseId: SCOPING },
      { at: 161, phaseId: DOING },
    ]);
  });
});

describe("phaseCheckInsInRange", () => {
  it("drops the pre-range carry-in from event feeds", () => {
    const carryIn = phaseCheckIn(1, 40, SCOPING);
    const inRange = phaseCheckIn(2, 100, DOING);
    expect(phaseCheckInsInRange([carryIn, inRange], 50)).toEqual([inRange]);
  });

  it("keeps aggregated omit of a same-phase return after filtering the carry-in", () => {
    const carryIn = phaseCheckIn(1, 40, DOING);
    const settle = phaseCheckIn(2, 120, DOING);
    const later = phaseCheckIn(3, 200, SCOPING);
    expect(
      phaseCheckInsInRange(
        collapsePhaseCheckIns([carryIn, settle, later]),
        50,
      ).map((checkIn) => checkIn.phaseId),
    ).toEqual([SCOPING]);
  });
});

describe("phaseSessions", () => {
  it("finds the latest checkpoint at an event time", () => {
    expect(
      phaseCheckInAt(
        [
          phaseCheckIn(1, 50, RESTING),
          phaseCheckIn(2, 100, SCOPING),
          phaseCheckIn(3, 100, DOING),
        ],
        100,
      )?.id,
    ).toBe(3);
  });

  it("clips stretches to the range and carries the phase already active", () => {
    expect(
      phaseSessions(
        [
          phaseCheckIn(1, 10, RESTING),
          phaseCheckIn(2, 60, SCOPING),
          phaseCheckIn(3, 120, DOING),
        ],
        40,
        100,
      ),
    ).toEqual([
      { phaseId: RESTING, from: 40, to: 60 },
      { phaseId: SCOPING, from: 60, to: 100 },
    ]);
  });

  it("starts at the first checkpoint when nothing precedes the range", () => {
    expect(
      phaseSessions([phaseCheckIn(1, 50, DOING)], 0, 80),
    ).toEqual([{ phaseId: DOING, from: 50, to: 80 }]);
  });
});

describe("trimQuietPhaseSessions", () => {
  it("drops leading and trailing Resting but keeps a pause in the middle", () => {
    expect(
      trimQuietPhaseSessions(
        [
          { phaseId: RESTING, from: 0, to: 10 },
          { phaseId: DOING, from: 10, to: 20 },
          { phaseId: RESTING, from: 20, to: 25 },
          { phaseId: SCOPING, from: 25, to: 40 },
          { phaseId: RESTING, from: 40, to: 80 },
        ],
        isQuiet,
      ),
    ).toEqual([
      { phaseId: DOING, from: 10, to: 20 },
      { phaseId: RESTING, from: 20, to: 25 },
      { phaseId: SCOPING, from: 25, to: 40 },
    ]);
  });
});

describe("phaseSessionTotals", () => {
  it("sums seconds per phase", () => {
    expect(
      phaseSessionTotals([
        { phaseId: DOING, from: 0, to: 10 },
        { phaseId: SCOPING, from: 10, to: 15 },
        { phaseId: DOING, from: 15, to: 25 },
      ]),
    ).toEqual([
      { phaseId: DOING, seconds: 20 },
      { phaseId: SCOPING, seconds: 5 },
    ]);
  });
});

describe("phaseSessionsInWindow", () => {
  it("builds settled sessions for a rolling window", () => {
    const sessions = phaseSessionsInWindow(
      [
        phaseCheckIn(1, 0, DOING),
        phaseCheckIn(2, 100, SCOPING),
        phaseCheckIn(3, 200, RESTING),
      ],
      50,
      250,
      (phaseId) => phaseId === RESTING,
    );
    expect(sessions).toEqual([
      { phaseId: DOING, from: 50, to: 100 },
      { phaseId: SCOPING, from: 100, to: 200 },
    ]);
  });

  it("can keep trailing quiet time when trim is off", () => {
    const sessions = phaseSessionsInWindow(
      [
        phaseCheckIn(1, 0, DOING),
        phaseCheckIn(2, 100, SCOPING),
        phaseCheckIn(3, 200, RESTING),
      ],
      50,
      250,
      (phaseId) => phaseId === RESTING,
      false,
    );
    expect(sessions[sessions.length - 1]).toEqual({
      phaseId: RESTING,
      from: 200,
      to: 250,
    });
  });
});
