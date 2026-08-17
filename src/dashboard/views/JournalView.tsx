import { useMemo, useState } from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import type { Metric, Phase, PhaseCheckIn, Pulse } from "../../lib/types";
import {
  collapsePhaseCheckIns,
  buildTimeline,
  groupByDay,
  type DayGroup,
  type TimelineEvent,
} from "../lib/timeline";
import { useDashboardData } from "../context/DashboardDataContext";
import { ViewToggle } from "../components/ViewToggle";
import { JournalEvents } from "./JournalEvents";

const JOURNAL_VIEWS = [
  { key: "raw", label: "Raw" },
  { key: "dumps", label: "Brain dumps" },
  { key: "phases", label: "Phases" },
  { key: "metrics", label: "Metrics" },
] as const;
type JournalViewKey = (typeof JOURNAL_VIEWS)[number]["key"];

const PHASE_MODES = [
  { key: "raw", label: "Raw" },
  { key: "aggregated", label: "Aggregated" },
] as const;
type PhaseModeKey = (typeof PHASE_MODES)[number]["key"];

const EMPTY_COPY: Record<
  JournalViewKey,
  { title: string; body: string }
> = {
  raw: {
    title: "Nothing here yet",
    body: "Metric check-ins, brain dumps, and Phase changes will land here.",
  },
  dumps: {
    title: "No brain dumps yet",
    body: "Capture a thought from Overview or the check-in popup.",
  },
  phases: {
    title: "No Phase changes yet",
    body: "Phase checkpoints appear here as attention shifts.",
  },
  metrics: {
    title: "No Metric check-ins yet",
    body: "Press ⌘⇧E anywhere to log your first Metric check-in.",
  },
};

function DayArticle({
  day,
  phases,
  metrics,
  pulses,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  day: DayGroup;
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
}) {
  return (
    <article className="day-group">
      <header className="day-group__head">
        <h3 className="day-group__label">{day.label}</h3>
      </header>
      <JournalEvents
        events={day.events}
        phases={phases}
        metrics={metrics}
        pulses={pulses}
        expandedDumpIds={expandedDumpIds}
        onDeleteCheckIn={onDeleteCheckIn}
        onToggleDump={onToggleDump}
      />
    </article>
  );
}

function phaseEvents(checkIns: PhaseCheckIn[]): TimelineEvent[] {
  return buildTimeline([], checkIns, []);
}

function journalEvents(
  view: JournalViewKey,
  phaseMode: PhaseModeKey,
  checkIns: Parameters<typeof buildTimeline>[0],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: Parameters<typeof buildTimeline>[2],
): TimelineEvent[] {
  switch (view) {
    case "raw":
      return buildTimeline(checkIns, phaseCheckIns, brainDumps);
    case "dumps":
      return buildTimeline([], [], brainDumps);
    case "metrics":
      return buildTimeline(checkIns, [], []);
    case "phases":
      return phaseEvents(
        phaseMode === "aggregated"
          ? collapsePhaseCheckIns(phaseCheckIns)
          : phaseCheckIns,
      );
  }
}

export function JournalView() {
  const {
    metrics,
    pulses,
    phases,
    checkIns,
    phaseCheckIns,
    brainDumps,
    loaded,
    mutate,
  } = useDashboardData();
  const [journalView, setJournalView] = useState<JournalViewKey>("raw");
  const [phaseMode, setPhaseMode] = useState<PhaseModeKey>("aggregated");
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(
    () => new Set(),
  );

  const days = useMemo(
    () =>
      groupByDay(
        journalEvents(
          journalView,
          phaseMode,
          checkIns,
          phaseCheckIns,
          brainDumps,
        ),
      ),
    [journalView, phaseMode, checkIns, phaseCheckIns, brainDumps],
  );

  const onDeleteCheckIn = (id: number) =>
    void mutate(() => deleteMetricCheckIn(id));

  const toggleDumpExpanded = (id: number) => {
    setExpandedDumpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const empty = EMPTY_COPY[journalView];

  return (
    <section className="dash-section dash-section--journal">
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Journal</h2>
        </div>
      </header>
      <div className="journal-toolbar">
        <ViewToggle
          value={journalView}
          options={JOURNAL_VIEWS}
          label="Journal view"
          onChange={setJournalView}
        />
        {journalView === "phases" ? (
          <ViewToggle
            value={phaseMode}
            options={PHASE_MODES}
            label="Phase history mode"
            onChange={setPhaseMode}
          />
        ) : null}
      </div>
      <div className="dash-section__body">
        {!loaded ? null : days.length === 0 ? (
          <div className="dash-empty">
            <strong>{empty.title}</strong>
            <span>{empty.body}</span>
          </div>
        ) : (
          days.map((day) => (
            <DayArticle
              key={day.key}
              day={day}
              phases={phases}
              metrics={metrics}
              pulses={pulses}
              expandedDumpIds={expandedDumpIds}
              onDeleteCheckIn={onDeleteCheckIn}
              onToggleDump={toggleDumpExpanded}
            />
          ))
        )}
      </div>
    </section>
  );
}
