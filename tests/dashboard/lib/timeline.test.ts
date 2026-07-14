import { describe, expect, it } from "vitest";
import {
  buildMetricSeries,
  buildTimeline,
  groupByDay,
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
  ratings: ratings.map((r) => ({ checkInId: id, ...r })),
});

const phaseCheckIn = (id: number, createdAt: number): PhaseCheckIn => ({
  id,
  createdAt,
  phaseId: id,
  phaseLabel: null,
});

const dump = (id: number, createdAt: number): BrainDump => ({
  id,
  createdAt,
  title: null,
  text: `dump ${id}`,
});

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
