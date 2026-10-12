// Behavior and invariants: docs/interface/phases.md#phases-pane
import { useMemo, useState, type CSSProperties } from "react";
import { listPhaseCheckIns } from "../../lib/commands";
import { DateNavigation } from "../components/DateNavigation";
import { DayAxis, DayTrack } from "../components/DayStrip";
import { NestIcon } from "../components/PulseIcon";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useDayRecords } from "../hooks/useDayRecords";
import { selectedDayMs, stepSelectedDay } from "../lib/dateNavigation";
import { dayOffset, metricDayTicks, type MetricDayTick } from "../lib/metricDay";
import { phaseIconName } from "../lib/period";
import {
  buildPhaseDay,
  PHASE_VIEWS,
  readPhaseView,
  writePhaseView,
  type PhaseDayLane,
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

function PhaseDayLaneRow({
  lane,
  ticks,
  nowOffset,
  current,
}: {
  lane: PhaseDayLane;
  ticks: MetricDayTick[];
  nowOffset: number;
  current: boolean;
}) {
  const sessionSpan = (session: PhaseDayLane["sessions"][number]) =>
    `${formatTime(session.from)} – ${formatTime(session.to)}`;
  const label = lane.sessions.length
    ? `${lane.name}: ${lane.sessions.map(sessionSpan).join(", ")}`
    : `${lane.name}: no time`;
  return (
    <li
      className="phase-day-row"
      data-current={current ? "true" : undefined}
      style={phaseColorStyle(lane.phase?.color)}
    >
      <div className="phase-day-row__identity">
        <span className="phase-row__icon">
          <NestIcon name={lane.phase?.icon || phaseIconName(lane.name)} />
        </span>
        <span className="phase-row__name">{lane.name}</span>
      </div>
      <div className="metric-day phase-day-row__strip" role="img" aria-label={label}>
        <DayTrack ticks={ticks} nowOffset={nowOffset}>
          {lane.sessions.map((session) => (
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
      <span className="phase-day-row__total" data-empty={lane.seconds > 0 ? undefined : true}>
        {formatCompactDuration(lane.seconds)}
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
  const lanes = useMemo(
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
        {lanes.map((lane) => (
          <PhaseDayLaneRow
            key={lane.name}
            lane={lane}
            ticks={ticks}
            nowOffset={nowOffset}
            current={lane.phase !== null && lane.phase.id === currentPhaseId}
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
  const [view, setView] = useState(readPhaseView);
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const nowMs = useCurrentTime();
  const dayStartMs = selectedDayMs(anchorMs, nowMs);

  return (
    <section className="dash-section dash-section--phases">
      <header className="dash-section__head">
        {view === "day" ? (
          <DateNavigation
            label={dayLabel(dayStartMs / 1000, nowMs)}
            unit="day"
            canGoNext={dayStartMs < startOfDayMs(nowMs / 1000)}
            onPrevious={() => setAnchorMs((current) => stepSelectedDay(current, -1, nowMs))}
            onNext={() => setAnchorMs((current) => stepSelectedDay(current, 1, nowMs))}
            onToday={() => setAnchorMs(null)}
          />
        ) : null}
        <ViewToggle
          value={view}
          options={PHASE_VIEWS}
          label="Phase view"
          onChange={(key) => {
            writePhaseView(key);
            setView(key);
          }}
        />
      </header>
      <div className="dash-section__body">
        {view === "day" ? (
          <PhaseDay dayStartMs={dayStartMs} nowMs={nowMs} />
        ) : (
          <PhaseGuide />
        )}
      </div>
    </section>
  );
}
