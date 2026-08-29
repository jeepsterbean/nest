import { resolveMetricColorFromList } from "../../../lib/metricColors";
import type { Metric, Pulse } from "../../../lib/types";
import { NestIcon } from "../PulseIcon";

type MetricCheckIn = {
  id: number;
  pulseId: number | null;
  pulseName: string | null;
  ratings: { metricId: number; value: number }[];
};

/** Pulse icon, per-metric ratings, and delete — shared by Logs timeline and table. */
export function MetricCheckInDetail({
  checkIn,
  metrics,
  pulses,
  onDelete,
}: {
  checkIn: MetricCheckIn;
  metrics: Metric[];
  pulses: Pulse[];
  onDelete: (id: number) => void;
}) {
  const pulse =
    checkIn.pulseId === null
      ? undefined
      : pulses.find((item) => item.id === checkIn.pulseId);
  const pulseLabel = pulse?.name ?? checkIn.pulseName ?? "Metric check-in";

  return (
    <>
      <span className="event__icon" title={pulseLabel} role="img" aria-label={pulseLabel}>
        <NestIcon name={pulse?.icon ?? "activity"} />
      </span>
      <ul className="event__ratings">
        {checkIn.ratings.map((rating) => {
          const metric = metrics.find((item) => item.id === rating.metricId);
          const metricLabel = metric?.name ?? `Metric ${rating.metricId}`;
          return (
            <li key={rating.metricId} className="event__rating">
              <span
                className="event__rating-icon"
                title={metricLabel}
                role="img"
                aria-label={metricLabel}
              >
                <NestIcon
                  name={metric?.icon ?? "activity"}
                  color={
                    metric ? resolveMetricColorFromList(metrics, metric.id) : undefined
                  }
                />
              </span>
              <span className={`rating-pill rating-pill--v${rating.value}`}>
                {rating.value}
              </span>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="event__delete"
        onClick={() => onDelete(checkIn.id)}
        aria-label="Delete metric check-in"
        title="Delete metric check-in"
      >
        ×
      </button>
    </>
  );
}
