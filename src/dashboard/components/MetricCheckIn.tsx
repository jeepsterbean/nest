import { useEffect, useState, type RefObject } from "react";
import type {
  Metric,
  MetricRatingInput,
  Pulse,
  RatingValue,
} from "../../lib/types";
import { resolveMetricColorFromList } from "../../lib/metricColors";
import { RATING_VALUES } from "../lib/tasks";
import { NestIcon } from "./PulseIcon";
import "./MetricCheckIn.css";

export function nextMetricIndex(index: number, metricCount: number) {
  return index + 1 < metricCount ? index + 1 : null;
}

export function firstScorablePulse(pulses: Pulse[]): Pulse | null {
  return pulses.find((pulse) => pulse.metricIds.length > 0) ?? null;
}

export function MetricCheckIn({
  metrics,
  pulses,
  submitting,
  emptyCopy,
  onComplete,
  selectedPulseButtonRef,
}: {
  metrics: Metric[];
  pulses: Pulse[];
  submitting: boolean;
  emptyCopy: string;
  onComplete: (pulse: Pulse, ratings: MetricRatingInput[]) => Promise<void>;
  selectedPulseButtonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const [selectedPulseId, setSelectedPulseId] = useState<number | null>(
    () => firstScorablePulse(pulses)?.id ?? null,
  );
  const [metricIndex, setMetricIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<string, RatingValue>>({});
  const selectedPulse =
    pulses.find((pulse) => pulse.id === selectedPulseId) ?? null;
  const pulseMetrics = selectedPulse
    ? selectedPulse.metricIds.flatMap((id) => {
        const metric = metrics.find((candidate) => candidate.id === id);
        return metric ? [metric] : [];
      })
    : [];
  const activeMetric = pulseMetrics[metricIndex] ?? null;
  const ratingKey = (metricId: number) => `${selectedPulseId}:${metricId}`;

  useEffect(() => {
    if (pulseMetrics.length) return;
    const fallbackId = firstScorablePulse(pulses)?.id ?? null;
    if (fallbackId === selectedPulseId) return;
    // Reset only when the fallback Pulse actually changes, so empty states do
    // not loop on fresh array identities from callers.
    setSelectedPulseId(fallbackId);
    setMetricIndex(0);
    setRatings({});
  }, [pulses, pulseMetrics.length, selectedPulseId]);

  const ratingsInputFor = (
    pulse: Pulse,
    nextRatings: Record<string, RatingValue>,
  ): MetricRatingInput[] =>
    pulse.metricIds.flatMap((metricId) => {
      const rating = nextRatings[`${pulse.id}:${metricId}`];
      return rating === undefined ? [] : [{ metricId, value: rating }];
    });

  const finishPulse = async (
    pulse: Pulse,
    nextRatings: Record<string, RatingValue>,
  ) => {
    const ratingsInput = ratingsInputFor(pulse, nextRatings);
    if (ratingsInput.length === 0) return;
    try {
      await onComplete(pulse, ratingsInput);
      setRatings({});
      setMetricIndex(0);
    } catch {
      // The caller owns error presentation; keep answers ready for a retry.
    }
  };

  const answerMetric = async (value: RatingValue) => {
    if (!activeMetric || !selectedPulse || submitting) return;
    const nextRatings = {
      ...ratings,
      [ratingKey(activeMetric.id)]: value,
    };
    setRatings(nextRatings);
    const nextIndex = nextMetricIndex(metricIndex, pulseMetrics.length);
    if (nextIndex !== null) {
      setMetricIndex(nextIndex);
      return;
    }
    await finishPulse(selectedPulse, nextRatings);
  };


  return (
    <section
      className="pulse-panel"
      aria-label="Metrics"
      onKeyDown={(event) => {
        if (event.key >= "1" && event.key <= "5") {
          event.preventDefault();
          void answerMetric(Number(event.key) as RatingValue);
        }
      }}
    >
      <div className="pulse-panel__header">
        <div className="pulse-panel__header-start">
          {activeMetric && (
            <div
              className="metric-step__title"
              key={`${selectedPulseId}:${activeMetric.id}`}
              aria-live="polite"
            >
              <NestIcon
                name={activeMetric.icon}
                color={resolveMetricColorFromList(metrics, activeMetric.id)}
              />
              <h2>{activeMetric.name}</h2>
            </div>
          )}
        </div>
        {pulses.length > 0 && (
          <div className="pulse-panel__header-end">
            <div
              className="popup-pulse-toggle"
              role="group"
              aria-label="Pulses"
            >
              {pulses.map((pulse) => (
                <button
                  key={pulse.id}
                  ref={
                    pulse.id === selectedPulseId
                      ? selectedPulseButtonRef
                      : undefined
                  }
                  type="button"
                  aria-label={pulse.name}
                  title={pulse.name}
                  aria-pressed={pulse.id === selectedPulseId}
                  disabled={submitting || pulse.metricIds.length === 0}
                  onFocus={() => {
                    if (pulse.id === selectedPulseId) return;
                    setSelectedPulseId(pulse.id);
                    setMetricIndex(0);
                  }}
                  onClick={() => {
                    setSelectedPulseId(pulse.id);
                    setMetricIndex(0);
                  }}
                >
                  <NestIcon name={pulse.icon} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="pulse-panel__body">
        {activeMetric ? (
          <div
            className="metric-step"
            key={`${selectedPulseId}:${activeMetric.id}:ratings`}
          >
            <div
              className="metric-row__buttons"
              role="group"
              aria-label={activeMetric.name}
            >
              {RATING_VALUES.map((value) => {
                const selected = ratings[ratingKey(activeMetric.id)] === value;
                return (
                  <button
                    key={value}
                    type="button"
                    tabIndex={-1}
                    aria-label={`${value} out of 5`}
                    aria-pressed={selected}
                    disabled={submitting}
                    className={`metric-rating metric-rating--v${value}${
                      selected ? " metric-rating--active" : ""
                    }`}
                    onClick={() => void answerMetric(value)}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="combined-empty">
            {pulses.length ? "This pulse has no metrics yet." : emptyCopy}
          </div>
        )}
      </div>
    </section>
  );
}
