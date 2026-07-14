import { describe, expect, it } from "vitest";
import type {
  Metric,
  MetricCheckInWithRatings,
} from "../../../src/lib/types";
import {
  latestPulseMessage,
  latestPulseState,
} from "../../../src/dashboard/lib/pulse";

const metrics: Metric[] = [
  { id: 1, name: "Energy", createdAt: 1, inactiveSince: null },
  { id: 2, name: "Mood", createdAt: 1, inactiveSince: null },
  { id: 3, name: "Focus", createdAt: 1, inactiveSince: null },
];

const checkIn = (
  id: number,
  createdAt: number,
  ratings: Array<[number, number]>,
): MetricCheckInWithRatings => ({
  id,
  createdAt,
  ratings: ratings.map(([metricId, value]) => ({
    checkInId: id,
    metricId,
    value,
  })),
});

describe("latestPulseMessage", () => {
  const nowMs = 7_200_000;

  it("handles a missing pulse and a steady pulse", () => {
    expect(latestPulseMessage([], metrics, nowMs)).toBe(
      "Time for a pulse check-in",
    );
    expect(
      latestPulseMessage(
        [checkIn(1, 7_100, [[1, 3], [2, 4]])],
        metrics,
        nowMs,
      ),
    ).toBe("All looking steady");
  });

  it("lists one low metric with singular grammar", () => {
    expect(
      latestPulseMessage(
        [checkIn(1, 7_100, [[1, 2], [2, 3]])],
        metrics,
        nowMs,
      ),
    ).toBe("Energy is low");
  });

  it("lists every low metric with natural conjunctions", () => {
    expect(
      latestPulseMessage(
        [checkIn(1, 7_100, [[1, 2], [2, 1], [3, 3]])],
        metrics,
        nowMs,
      ),
    ).toBe("Energy and Mood are low");

    expect(
      latestPulseMessage(
        [checkIn(1, 7_100, [[1, 2], [2, 1], [3, 2]])],
        metrics,
        nowMs,
      ),
    ).toBe("Energy, Mood, and Focus are low");
  });

  it("uses only the latest check-in and treats 3 as not low", () => {
    expect(
      latestPulseMessage(
        [
          checkIn(1, 7_000, [[1, 1]]),
          checkIn(2, 7_100, [[1, 3], [2, 2]]),
        ],
        metrics,
        nowMs,
      ),
    ).toBe("Mood is low");
  });

  it("falls back safely when a metric definition is unavailable", () => {
    expect(
      latestPulseMessage([checkIn(1, 7_100, [[9, 1]])], metrics, nowMs),
    ).toBe("Metric 9 is low");
  });

  it("prompts for a pulse at one hour old and reports overdue state", () => {
    const state = latestPulseState(
      [checkIn(1, 3_600, [[1, 2]])],
      metrics,
      nowMs,
    );
    expect(state).toEqual({
      message: "Time for a pulse check-in",
      overdue: true,
    });
  });
});
