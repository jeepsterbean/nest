import { resolveMetricColorFromList } from "../../../lib/metricColors";
import type { Metric } from "../../../lib/types";
import { NestIcon } from "../PulseIcon";

type MetricCheckIn = {
  id: number;
  ratings: { metricId: number; value: number }[];
};

/** Per-metric ratings and delete; the timeline mark carries the Pulse icon. */
export function MetricCheckInDetail({
  checkIn,
  metrics,
  onDelete,
}: {
  checkIn: MetricCheckIn;
  metrics: Metric[];
  onDelete: (id: number) => void;
}) {
  return (
    <>
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
