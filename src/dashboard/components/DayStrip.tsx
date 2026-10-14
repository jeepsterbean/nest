import type { ReactNode } from "react";
import type { MetricDayTick } from "../lib/metricDay";
import { formatHourTick } from "../lib/time";

/** Midnight-to-midnight track shared by the Metrics and Phases day boards:
 * hour ticks, the hours after now shaded, and the caller's marks on top. */
export function DayTrack({
  ticks,
  nowOffset,
  children,
}: {
  ticks: MetricDayTick[];
  nowOffset: number;
  children: ReactNode;
}) {
  return (
    <div className="metric-day__track">
      {ticks.map((tick) => (
        <span
          key={tick.offset}
          className="metric-day__tick"
          data-major={tick.labelAt !== null || undefined}
          style={{ left: `${tick.offset * 100}%` }}
        />
      ))}
      {nowOffset < 1 ? (
        <span className="metric-day__later" style={{ left: `${nowOffset * 100}%` }} />
      ) : null}
      {children}
    </div>
  );
}

export function DayAxis({ ticks }: { ticks: MetricDayTick[] }) {
  return (
    <div className="metric-axis" aria-hidden="true">
      <div className="metric-day__track">
        {ticks.flatMap((tick) =>
          tick.labelAt === null
            ? []
            : [
                <span key={tick.offset} style={{ left: `${tick.offset * 100}%` }}>
                  {formatHourTick(tick.labelAt)}
                </span>,
              ],
        )}
      </div>
    </div>
  );
}
