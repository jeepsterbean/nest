import {
  useEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
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
  due = false,
  emptyCopy,
  onComplete,
  pulseButtonsRef,
  selectedPulseButtonRef,
  onTabBack,
  onTabForward,
  headerStart,
  headerEnd,
  onHeaderPointerDown,
  dragTitle,
}: {
  metrics: Metric[];
  pulses: Pulse[];
  submitting: boolean;
  due?: boolean;
  emptyCopy: string;
  onComplete: (pulse: Pulse, ratings: MetricRatingInput[]) => Promise<void>;
  pulseButtonsRef?: RefObject<HTMLDivElement | null>;
  selectedPulseButtonRef?: RefObject<HTMLButtonElement | null>;
  onTabBack?: () => void;
  onTabForward?: () => void;
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  dragTitle?: string;
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
    if (selectedPulse?.metricIds.length) return;
    setSelectedPulseId(firstScorablePulse(pulses)?.id ?? null);
    setMetricIndex(0);
    setRatings({});
  }, [pulses, selectedPulse]);

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

    const ratingsInput = selectedPulse.metricIds.flatMap((metricId) => {
      const rating = nextRatings[`${selectedPulse.id}:${metricId}`];
      return rating === undefined ? [] : [{ metricId, value: rating }];
    });
    try {
      await onComplete(selectedPulse, ratingsInput);
      setRatings({});
      setMetricIndex(0);
    } catch {
      // The caller owns error presentation; keep answers ready for a retry.
    }
  };

  return (
    <section
      className={`pulse-panel${due ? " pulse-panel--due" : ""}`}
      aria-label="Metrics"
      onKeyDown={(event) => {
        if (event.key >= "1" && event.key <= "5") {
          event.preventDefault();
          void answerMetric(Number(event.key) as RatingValue);
        }
      }}
    >
      <div
        className={`pulse-panel__header${
          onHeaderPointerDown ? " pulse-panel__header--draggable" : ""
        }`}
        title={dragTitle}
        onPointerDown={onHeaderPointerDown}
      >
        <div className="pulse-panel__header-start">
          {headerStart}
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
        {(pulses.length > 0 || headerEnd) && (
          <div className="pulse-panel__header-end">
            {pulses.length > 0 && (
              <div
                ref={pulseButtonsRef}
                className="popup-pulse-toggle"
                role="group"
                aria-label="Pulses"
                onKeyDown={(event) => {
                  if (event.key !== "Tab") return;
                  const buttons = event.currentTarget.querySelectorAll(
                    "button:not(:disabled)",
                  );
                  const boundary = buttons.item(
                    event.shiftKey ? 0 : buttons.length - 1,
                  );
                  if (boundary !== event.target) return;
                  const moveFocus = event.shiftKey ? onTabBack : onTabForward;
                  if (!moveFocus) return;
                  event.preventDefault();
                  moveFocus();
                }}
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
            )}
            {headerEnd}
          </div>
        )}
      </div>
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
    </section>
  );
}
