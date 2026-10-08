import { describe, expect, it } from "vitest";
import {
  buildMetricDay,
  metricDayTicks,
  metricIdsForPulseDay,
} from "../../../src/dashboard/lib/metricDay";
import type { MetricCheckInWithRatings } from "../../../src/lib/types";

const DAY = 24 * 60 * 60;

const metricCheckIn = (
  id: number,
  createdAt: number,
  ratings: { metricId: number; value: number }[],
): MetricCheckInWithRatings => ({
  id,
  createdAt,
  pulseId: 1,
  pulseName: "Morning",
  ratings: ratings.map((r) => ({ checkInId: id, ...r })),
});

describe("buildMetricDay", () => {
  it("places each Metric's ratings across the day in chronological order", () => {
    const day = buildMetricDay(
      [
        metricCheckIn(2, DAY / 2, [{ metricId: 1, value: 4 }]),
        metricCheckIn(1, DAY / 4, [
          { metricId: 1, value: 2 },
          { metricId: 2, value: 5 },
        ]),
      ],
      0,
      DAY,
    );
    expect(day.get(1)?.map(({ value, offset }) => [value, offset])).toEqual([
      [2, 0.25],
      [4, 0.5],
    ]);
    expect(day.get(2)?.map(({ value }) => value)).toEqual([5]);
  });

  it("lifts a check-in close to the previous one into the second lane", () => {
    const day = buildMetricDay(
      [
        metricCheckIn(1, 3600, [{ metricId: 1, value: 3 }]),
        metricCheckIn(2, 3600 + 600, [{ metricId: 1, value: 4 }]),
        metricCheckIn(3, 3600 + 1200, [{ metricId: 1, value: 5 }]),
        metricCheckIn(4, 4 * 3600, [{ metricId: 1, value: 2 }]),
      ],
      0,
      DAY,
    );
    expect(day.get(1)?.map(({ lane }) => lane)).toEqual([0, 1, 1, 0]);
  });
});

describe("metricDayTicks", () => {
  it("labels 6, 12 and 18 o'clock among the three-hour ticks", () => {
    const start = new Date(2026, 0, 15).getTime();
    const end = new Date(2026, 0, 16).getTime();
    const ticks = metricDayTicks(start, end);
    expect(ticks.map(({ offset }) => offset)).toEqual([
      0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875,
    ]);
    expect(ticks.filter(({ labelAt }) => labelAt !== null)).toHaveLength(3);
  });
});

describe("metricIdsForPulseDay", () => {
  it("keeps historical ratings under their recorded Pulse after a Metric moves", () => {
    const checkIns = [
      metricCheckIn(2, DAY / 2, [
        { metricId: 3, value: 4 },
        { metricId: 1, value: 5 },
      ]),
      metricCheckIn(1, DAY / 4, [{ metricId: 2, value: 3 }]),
    ];

    expect(metricIdsForPulseDay([1], checkIns)).toEqual([1, 2, 3]);
  });

  it("does not add duplicate rows for current Metrics with historical ratings", () => {
    expect(
      metricIdsForPulseDay(
        [1, 2],
        [metricCheckIn(1, DAY / 4, [{ metricId: 2, value: 3 }])],
      ),
    ).toEqual([1, 2]);
  });
});
