// Behavior and invariants: docs/interface/phases.md#phases-section
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { listPhaseCheckIns } from "../../lib/commands";
import { DateNavigation } from "../components/DateNavigation";
import { DayAxis, DayTrack } from "../components/DayStrip";
import { NestIcon } from "../components/PulseIcon";
import { xIcon } from "../components/icons";
import { useDismiss } from "../hooks/useDismiss";
import { useDashboardData } from "../context/DashboardDataContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useDayRecords } from "../hooks/useDayRecords";
import { selectedDayMs, singleDayPicker, stepSelectedDay } from "../lib/dateNavigation";
import { dayOffset, metricDayTicks, type MetricDayTick } from "../lib/metricDay";
import { phaseIconName } from "../lib/period";
import {
  buildPhaseDay,
  type PhaseDayRow,
} from "../lib/phaseDay";
import { phaseMeaning, phasesInGuideOrder } from "../lib/phaseGuide";
import {
  dayLabel,
  formatCompactDuration,
  formatTime,
  shiftDayMs,
  startOfDayMs,
} from "../lib/time";

const phaseColorStyle = (color: string | null | undefined) =>
  color ? ({ "--phase-color": color } as CSSProperties) : undefined;

function PhaseDayRowView({
  row,
  ticks,
  nowOffset,
  current,
}: {
  row: PhaseDayRow;
  ticks: MetricDayTick[];
  nowOffset: number;
  current: boolean;
}) {
  const sessionSpan = (session: PhaseDayRow["sessions"][number]) =>
    `${formatTime(session.from)} – ${formatTime(session.to)}`;
  const label = row.sessions.length
    ? `${row.name}: ${row.sessions.map(sessionSpan).join(", ")}`
    : `${row.name}: no time`;
  return (
    <li
      className="phase-day-row"
      data-current={current ? "true" : undefined}
      style={phaseColorStyle(row.phase?.color)}
    >
      <div className="phase-day-row__identity">
        <span className="phase-row__icon">
          <NestIcon name={row.phase?.icon || phaseIconName(row.name)} />
        </span>
        <span className="phase-row__name">{row.name}</span>
      </div>
      <div className="metric-day phase-day-row__strip" role="img" aria-label={label}>
        <DayTrack ticks={ticks} nowOffset={nowOffset}>
          {row.sessions.map((session) => (
            <span
              key={session.from}
              className="phase-day-row__session"
              style={{
                left: `${session.startOffset * 100}%`,
                width: `${(session.endOffset - session.startOffset) * 100}%`,
              }}
              title={`${sessionSpan(session)} · ${formatCompactDuration(session.to - session.from)}`}
            />
          ))}
        </DayTrack>
      </div>
      <span className="phase-day-row__total" data-empty={row.seconds > 0 ? undefined : true}>
        {formatCompactDuration(row.seconds)}
      </span>
    </li>
  );
}

function PhaseDay({ dayStartMs, nowMs }: { dayStartMs: number; nowMs: number }) {
  const { phases, phaseCheckIns, latestPhase } = useDashboardData();
  const dayEndMs = shiftDayMs(dayStartMs, 1);
  const { records, loaded } = useDayRecords(
    dayStartMs,
    nowMs,
    phaseCheckIns,
    listPhaseCheckIns,
  );
  const ticks = useMemo(() => metricDayTicks(dayStartMs, dayEndMs), [dayStartMs, dayEndMs]);
  const rows = useMemo(
    () => buildPhaseDay(records, phases, dayStartMs / 1000, dayEndMs / 1000, nowMs / 1000),
    [records, phases, dayStartMs, dayEndMs, nowMs],
  );
  const nowOffset = dayOffset(nowMs / 1000, dayStartMs / 1000, dayEndMs / 1000);
  const isToday = dayStartMs === startOfDayMs(nowMs / 1000);
  const currentPhaseId = isToday ? (latestPhase?.phaseId ?? null) : null;

  if (!loaded) {
    return (
      <div className="dash-empty" role="status">
        <span>Loading Phases…</span>
      </div>
    );
  }
  return (
    <div className="phase-day">
      <DayAxis ticks={ticks} />
      <ol className="phase-list">
        {rows.map((row) => (
          <PhaseDayRowView
            key={row.name}
            row={row}
            ticks={ticks}
            nowOffset={nowOffset}
            current={row.phase !== null && row.phase.id === currentPhaseId}
          />
        ))}
      </ol>
    </div>
  );
}

function PhaseGuide() {
  const { phases, latestPhase } = useDashboardData();
  const activePhases = phasesInGuideOrder(
    phases.filter((phase) => phase.inactiveSince === null),
  );
  const currentPhaseId = latestPhase?.phaseId ?? null;

  return (
    <div className="phase-guide">
      <p className="phase-guide__intro">
        Nest reads your Phase from what the Mac is doing, never from
        anything you enter, and saves a checkpoint each time it changes.
      </p>
      <ol className="phase-list">
        {activePhases.map((phase) => {
          const meaning = phaseMeaning(phase.name);
          return (
            <li
              key={phase.id}
              className="phase-row"
              data-current={phase.id === currentPhaseId ? "true" : undefined}
              style={phaseColorStyle(phase.color)}
            >
              <span className="phase-row__icon">
                <NestIcon name={phase.icon} />
              </span>
              <span className="phase-row__name">{phase.name}</span>
              {meaning ? (
                <p className="phase-row__meaning">{meaning}</p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PhasesView() {
  const [guideOpen, setGuideOpen] = useState(false);
  const guideButtonRef = useRef<HTMLButtonElement>(null);
  const guideDialogRef = useRef<HTMLDivElement>(null);
  const guideTitleId = useId();
  const guideId = useId();
  const closeGuide = () => {
    setGuideOpen(false);
    guideButtonRef.current?.focus();
  };
  useDismiss(guideDialogRef, guideOpen, () => {
    closeGuide();
    return true;
  });
  useEffect(() => {
    if (guideOpen) guideDialogRef.current?.focus();
  }, [guideOpen]);
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const nowMs = useCurrentTime();
  const dayStartMs = selectedDayMs(anchorMs, nowMs);

  return (
    <section className="dash-section dash-section--phases">
      <header className="dash-section__head">
        <DateNavigation
          label={dayLabel(dayStartMs / 1000, nowMs)}
          unit="day"
          canGoNext={dayStartMs < startOfDayMs(nowMs / 1000)}
          onPrevious={() => setAnchorMs((current) => stepSelectedDay(current, -1, nowMs))}
          onNext={() => setAnchorMs((current) => stepSelectedDay(current, 1, nowMs))}
          onToday={() => setAnchorMs(null)}
          picker={singleDayPicker(dayStartMs, nowMs, setAnchorMs)}
        />
        <button
          ref={guideButtonRef}
          type="button"
          className="phase-guide-button"
          aria-expanded={guideOpen}
          aria-controls={guideId}
          onClick={() => setGuideOpen((open) => !open)}
        >
          Guide
        </button>
      </header>
      <div className="dash-section__body">
        <div inert={guideOpen}>
          <PhaseDay dayStartMs={dayStartMs} nowMs={nowMs} />
        </div>
        {guideOpen && (
          <div className="phase-guide-overlay">
            <div
              ref={guideDialogRef}
              id={guideId}
              className="phase-guide-dialog"
              role="dialog"
              aria-labelledby={guideTitleId}
              tabIndex={-1}
            >
              <header className="phase-guide-dialog__header">
                <h2 id={guideTitleId}>Phase guide</h2>
                <button
                  type="button"
                  className="phase-guide-dialog__close"
                  aria-label="Close Phase guide"
                  onClick={closeGuide}
                >
                  {xIcon}
                </button>
              </header>
              <PhaseGuide />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
