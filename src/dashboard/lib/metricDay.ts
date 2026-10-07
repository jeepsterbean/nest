import type { MetricCheckInWithRatings } from "../../lib/types";

export type MetricDayPoint = {
  checkInId: number;
  createdAt: number;
  value: number;
  /** Position across the day, 0 at local midnight and 1 at the next. */
  offset: number;
  lane: number;
};

export type MetricDayTick = {
  offset: number;
  /** Set on the ticks that carry an hour label. */
  labelAt: number | null;
};

/** A rating pill is about 45 minutes wide on a typical strip, so closer check-ins stack. */
const LANE_GAP = 45 / (24 * 60);
const MAX_LANES = 2;
const TICK_HOURS = [3, 6, 9, 12, 15, 18, 21];
const LABELED_HOURS = new Set([6, 12, 18]);

export const dayOffset = (atSec: number, dayStartSec: number, dayEndSec: number) =>
  Math.min(1, Math.max(0, (atSec - dayStartSec) / (dayEndSec - dayStartSec)));

/** Per-Metric ratings placed on the day, chronological. A check-in too close to the
 * previous one moves up a lane so both numbers stay readable. */
export const buildMetricDay = (
  checkIns: MetricCheckInWithRatings[],
  dayStartSec: number,
  dayEndSec: number,
): Map<number, MetricDayPoint[]> => {
  const byMetric = new Map<number, MetricDayPoint[]>();
  const chronological = [...checkIns].sort((a, b) => a.createdAt - b.createdAt);
  for (const checkIn of chronological) {
    const offset = dayOffset(checkIn.createdAt, dayStartSec, dayEndSec);
    for (const rating of checkIn.ratings) {
      const points = byMetric.get(rating.metricId) ?? [];
      points.push({
        checkInId: checkIn.id,
        createdAt: checkIn.createdAt,
        value: rating.value,
        offset,
        lane: 0,
      });
      byMetric.set(rating.metricId, points);
    }
  }
  for (const points of byMetric.values()) {
    const laneEnds: number[] = [];
    for (const point of points) {
      const free = laneEnds.findIndex((end) => point.offset - end >= LANE_GAP);
      const lane = free >= 0 ? free : Math.min(laneEnds.length, MAX_LANES - 1);
      laneEnds[lane] = point.offset;
      point.lane = lane;
    }
  }
  return byMetric;
};

/** Hour ticks from local clock hours, so a DST day keeps its real 23 or 25 hours. */
export const metricDayTicks = (dayStartMs: number, dayEndMs: number): MetricDayTick[] =>
  TICK_HOURS.map((hour) => {
    const at = new Date(dayStartMs);
    at.setHours(hour, 0, 0, 0);
    const atSec = at.getTime() / 1000;
    return {
      offset: dayOffset(atSec, dayStartMs / 1000, dayEndMs / 1000),
      labelAt: LABELED_HOURS.has(hour) ? atSec : null,
    };
  });
