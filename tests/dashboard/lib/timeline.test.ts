import { describe, expect, it } from "vitest";
import {
  buildJournalDay,
  buildMetricSeries,
  buildTimeline,
  collapsePhaseCheckIns,
  groupByDay,
  hourTicks,
  phaseSessions,
  phaseSessionTotals,
  trimQuietPhaseSessions,
} from "../../../src/dashboard/lib/timeline";
import type {
  BrainDump,
  MetricCheckInWithRatings,
  PhaseCheckIn,
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
  title: null,
  text: `dump ${id}`,
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

describe("phaseSessions", () => {
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

describe("hourTicks", () => {
  it("marks local hours strictly inside the span", () => {
    const from = sec(new Date(2026, 5, 17, 9, 31));
    const to = sec(new Date(2026, 5, 17, 14, 8));
    expect(hourTicks(from, to)).toEqual([
      sec(new Date(2026, 5, 17, 10)),
      sec(new Date(2026, 5, 17, 11)),
      sec(new Date(2026, 5, 17, 12)),
      sec(new Date(2026, 5, 17, 13)),
      sec(new Date(2026, 5, 17, 14)),
    ]);
  });
});

describe("buildJournalDay", () => {
  const now = new Date(2026, 5, 17, 16, 0).getTime();
  const at = (day: number, hour: number, minute = 0) =>
    sec(new Date(2026, 5, day, hour, minute));
  const todayMs = new Date(2026, 5, 17).getTime();
  const dayMs = new Date(2026, 5, 16).getTime();

  it("returns an empty day so Daily can show a quiet date", () => {
    const day = buildJournalDay([], [], [], dayMs, isQuiet, now);
    expect(day.label).toBe("Yesterday");
    expect(day.sessions).toEqual([]);
    expect(day.events).toEqual([]);
  });

  it("keeps that day's Pulse check-ins and brain dumps", () => {
    const day = buildJournalDay(
      [metricCheckIn(1, at(16, 12), [{ metricId: 1, value: 3 }])],
      [dump(1, at(17, 9))],
      [phaseCheckIn(1, at(16, 10), DOING)],
      dayMs,
      isQuiet,
      now,
    );
    expect(day.events.map((event) => event.kind)).toEqual(["metrics"]);
    expect(day.sessions.map((session) => session.phaseId)).toEqual([DOING]);
  });

  it("does not list a same-phase flicker as its own session", () => {
    const day = buildJournalDay(
      [],
      [],
      [
        phaseCheckIn(1, at(17, 9, 31), SCOPING),
        phaseCheckIn(2, at(17, 9, 37), RESTING),
        phaseCheckIn(3, at(17, 9, 37), SCOPING),
      ],
      todayMs,
      isQuiet,
      now,
    );
    expect(day.sessions).toEqual([
      {
        phaseId: SCOPING,
        from: at(17, 9, 31),
        to: at(17, 16),
      },
    ]);
  });
});
