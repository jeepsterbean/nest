import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  deleteMetricCheckIn,
  submitBrainDump,
} from "../../lib/commands";
import {
  isBrainDumpPeelShortcut,
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
  useBrainDumpDraft,
  useRecentBrainDumpHistory,
} from "../../lib/brainDumpDraft";
import {
  createFloatingFromDraft,
  useFloatingBrainDumps,
  type FloatingBrainDump,
} from "../../lib/floatingBrainDumps";
import {
  DayStats,
  PhaseTotals,
} from "../components/DayReflection";
import { BrainDumpHistoryControls } from "../components/BrainDumpHistoryControls";
import { BrainDumpSurface } from "../components/BrainDumpSurface";
import { FloatingBrainDumpsBoard } from "../components/FloatingBrainDumpsBoard";
import { OverviewTasksPanel } from "../components/OverviewTasksPanel";
import { ViewToggle } from "../components/ViewToggle";
import { useComposerTagProps } from "../components/BrainDumpTags";
import { useDashboardData } from "../context/DashboardDataContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { windowInsight } from "../lib/insights";
import { LOG_EVENT_BATCH_SIZE } from "../lib/logs";
import {
  buildRawLog,
  phaseCheckInsInRange,
  type TimelineLogEvent,
} from "../lib/timeline";
import { startOfDayMs } from "../lib/time";
import { LogsTimeline } from "./LogsTimeline";

const OVERVIEW_WINDOW_SECONDS = 60 * 60;

const OVERVIEW_TIMELINE_FILTERS = [
  { key: "timeline", label: "Timeline" },
  { key: "dumps", label: "Brain dumps" },
  { key: "metrics", label: "Metrics" },
] as const;

type OverviewTimelineFilter =
  (typeof OVERVIEW_TIMELINE_FILTERS)[number]["key"];

const EMPTY_COPY: Record<
  OverviewTimelineFilter,
  { title: string; body: string }
> = {
  timeline: {
    title: "Nothing on the timeline yet",
    body: "Metric check-ins, brain dumps, and Working now starts and stops will land here.",
  },
  dumps: {
    title: "No brain dumps yet",
    body: "Capture a thought from this panel or the popup.",
  },
  metrics: {
    title: "No Metric check-ins yet",
    body: "Press ⌘⇧E anywhere to log your first Metric check-in.",
  },
};

const matchesTimelineFilter = (
  event: TimelineLogEvent,
  filter: OverviewTimelineFilter,
) => {
  if (filter === "timeline") return true;
  if (filter === "dumps") return event.kind === "dump";
  return event.kind === "metrics";
};

export function OverviewView({ onOpenTasks }: { onOpenTasks: () => void }) {
  const {
    tasks,
    taskStatusEvents,
    checkIns,
    phaseCheckIns,
    phases,
    metrics,
    pulses,
    brainDumps,
    taskWorkStretches,
    tags,
    loaded,
    mutate,
    setError,
  } = useDashboardData();
  const mainDumpRef = useRef<HTMLTextAreaElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const [brainDumpDraft, setBrainDumpDraft] = useBrainDumpDraft();
  const { text: brainDumpText, tagIds: brainDumpTagIds } = brainDumpDraft;
  const [brainDumpSubmitting, setBrainDumpSubmitting] = useState(false);
  const brainDumpHistory = useRecentBrainDumpHistory(brainDumpText, setError);
  const composerTagProps = useComposerTagProps(
    tags,
    brainDumpTagIds,
    brainDumpHistory.viewingDump,
  );
  const {
    dumps: floatingDumps,
    addDump,
    updateDump,
    removeDump,
    bringToFront,
    reclampToBoard,
  } = useFloatingBrainDumps();

  const nowMs = useCurrentTime();
  const dayFromSec = Math.floor(startOfDayMs(nowMs / 1000) / 1000);
  const [timelineFilter, setTimelineFilter] =
    useState<OverviewTimelineFilter>("timeline");
  const [visibleEventCount, setVisibleEventCount] = useState(
    LOG_EVENT_BATCH_SIZE,
  );
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(
    () => new Set(),
  );

  const handleTagsChange = useCallback(
    (tagIds: number[]) =>
      setBrainDumpDraft((draft) => ({ ...draft, tagIds })),
    [setBrainDumpDraft],
  );

  const handleViewportResize = useCallback(
    (width: number, height: number) => {
      reclampToBoard(width, height);
    },
    [reclampToBoard],
  );

  useEffect(() => {
    setPortalRoot(document.querySelector(".dashboard"));
  }, []);

  const dayReflection = useMemo(() => {
    const to = Math.floor(Date.now() / 1000);
    return windowInsight(
      tasks,
      taskStatusEvents,
      checkIns,
      phaseCheckIns,
      phases,
      to - OVERVIEW_WINDOW_SECONDS,
      to,
    );
  }, [phaseCheckIns, phases, tasks, taskStatusEvents, checkIns]);

  const timelineEvents = useMemo(() => {
    const eventPhaseCheckIns = phaseCheckInsInRange(
      phaseCheckIns,
      dayFromSec,
    );
    const raw = buildRawLog(
      checkIns,
      eventPhaseCheckIns,
      brainDumps,
      taskWorkStretches,
    );
    return raw.filter(
      (event): event is TimelineLogEvent =>
        event.kind !== "phase" &&
        event.at >= dayFromSec &&
        matchesTimelineFilter(event, timelineFilter),
    );
  }, [
    brainDumps,
    checkIns,
    dayFromSec,
    phaseCheckIns,
    taskWorkStretches,
    timelineFilter,
  ]);

  const visibleTimelineEvents = useMemo(
    () => timelineEvents.slice(0, visibleEventCount),
    [timelineEvents, visibleEventCount],
  );
  const remainingEventCount = Math.max(
    0,
    timelineEvents.length - visibleEventCount,
  );
  const nextBatchSize = Math.min(LOG_EVENT_BATCH_SIZE, remainingEventCount);
  const empty = EMPTY_COPY[timelineFilter];

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

  const submitOverviewDump = async () => {
    const text = trimBrainDumpDraft(brainDumpDraft);
    if (!text || brainDumpSubmitting) return;
    setBrainDumpSubmitting(true);
    const ok = await mutate(() => submitBrainDump(text, null, brainDumpTagIds));
    if (ok) {
      setBrainDumpDraft({ text: "", tagIds: [] });
      await brainDumpHistory.refresh();
    }
    setBrainDumpSubmitting(false);
  };

  const peelToFloating = useCallback(() => {
    if (brainDumpHistory.viewingHistory) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const next = createFloatingFromDraft(
      brainDumpDraft,
      floatingDumps,
      width,
      height,
    );
    if (!next) return;
    addDump(next);
    setBrainDumpDraft({ text: "", tagIds: [] });
  }, [
    addDump,
    brainDumpDraft,
    brainDumpHistory.viewingHistory,
    floatingDumps,
    setBrainDumpDraft,
  ]);

  const promoteFloatingDump = useCallback(
    (dump: FloatingBrainDump) => {
      const mainDraft = brainDumpDraft;
      const mainEmpty = !trimBrainDumpDraft(mainDraft);
      setBrainDumpDraft({ text: dump.text, tagIds: dump.tagIds });
      if (mainEmpty) removeDump(dump.id);
      else updateDump(dump.id, { text: mainDraft.text, tagIds: mainDraft.tagIds });
      mainDumpRef.current?.focus();
    },
    [brainDumpDraft, removeDump, setBrainDumpDraft, updateDump],
  );

  const submitFloatingDump = async (dump: FloatingBrainDump) => {
    const text = dump.text.trim();
    if (!text || brainDumpSubmitting) return;
    setBrainDumpSubmitting(true);
    const ok = await mutate(() => submitBrainDump(text, null, dump.tagIds));
    if (ok) {
      removeDump(dump.id);
      await brainDumpHistory.refresh();
    }
    setBrainDumpSubmitting(false);
  };

  const onMainDumpKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (brainDumpHistory.viewingHistory) return;
    if (
      isBrainDumpPeelShortcut({
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      event.preventDefault();
      peelToFloating();
      return;
    }
    if (
      isBrainDumpSubmitShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      event.preventDefault();
      void submitOverviewDump();
    }
  };

  return (
    <div className="overview-stack">
      <section className="overview-day" aria-label="Last hour">
        <DayStats stats={dayReflection.stats} />
        <PhaseTotals sessions={dayReflection.sessions} phases={phases} />
      </section>

      <section className="overview-panels" aria-label="Overview">
        <section
          className="overview-panel overview-panel--tasks"
          aria-label="Tasks"
        >
          <OverviewTasksPanel onOpenTasks={onOpenTasks} />
        </section>

        <section
          className="overview-panel overview-panel--timeline"
          aria-label="Timeline"
        >
          <header className="overview-panel__head">
            <ViewToggle
              value={timelineFilter}
              options={OVERVIEW_TIMELINE_FILTERS}
              label="Timeline filter"
              onChange={(next) => {
                setTimelineFilter(next);
                setVisibleEventCount(LOG_EVENT_BATCH_SIZE);
              }}
            />
          </header>
          <div className="overview-panel__scroll">
            {!loaded ? null : timelineEvents.length === 0 ? (
              <div className="dash-empty">
                <strong>{empty.title}</strong>
                <span>{empty.body}</span>
              </div>
            ) : (
              <>
                <LogsTimeline
                  events={visibleTimelineEvents}
                  phaseCheckIns={phaseCheckIns}
                  phases={phases}
                  metrics={metrics}
                  pulses={pulses}
                  tasks={tasks}
                  expandedDumpIds={expandedDumpIds}
                  onDeleteCheckIn={onDeleteCheckIn}
                  onToggleDump={toggleDumpExpanded}
                  nowMs={nowMs}
                  dayChrome={false}
                />
                {remainingEventCount > 0 ? (
                  <div className="logs-load-older">
                    <button
                      type="button"
                      className="btn-accent"
                      onClick={() =>
                        setVisibleEventCount(
                          (count) => count + LOG_EVENT_BATCH_SIZE,
                        )
                      }
                    >
                      Load {nextBatchSize} older
                    </button>
                    <span>
                      Showing{" "}
                      {Math.min(visibleEventCount, timelineEvents.length)} of{" "}
                      {timelineEvents.length}
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>

        <section
          className="overview-panel overview-panel--dumps"
          aria-label="Brain dump"
        >
          {loaded && (
            <BrainDumpSurface
              className="brain-dump-surface--anchored"
              text={brainDumpHistory.text}
              tagIds={composerTagProps.selectedIds}
              tags={composerTagProps.tags}
              readOnly={brainDumpHistory.viewingHistory}
              tagsDisabled={brainDumpHistory.viewingHistory}
              textareaLabel={
                brainDumpHistory.viewingHistory
                  ? "Saved brain dump, read only"
                  : "Brain dump"
              }
              headerEnd={
                <BrainDumpHistoryControls
                  canViewPrevious={brainDumpHistory.canViewPrevious}
                  canViewNext={brainDumpHistory.canViewNext}
                  onPrevious={brainDumpHistory.showPrevious}
                  onNext={brainDumpHistory.showNext}
                  submittedAt={brainDumpHistory.viewingDump?.createdAt}
                />
              }
              onTextChange={(text) =>
                setBrainDumpDraft((draft) => ({ ...draft, text }))
              }
              onTagsChange={handleTagsChange}
              onKeyDown={onMainDumpKeyDown}
              textareaRef={mainDumpRef}
            />
          )}
        </section>
      </section>

      {loaded &&
        portalRoot &&
        createPortal(
          <FloatingBrainDumpsBoard
            dumps={floatingDumps}
            tags={tags}
            onTextChange={(id, text) => updateDump(id, { text })}
            onTagsChange={(id, tagIds) => updateDump(id, { tagIds })}
            onPositionChange={(id, x, y) => updateDump(id, { x, y })}
            onPromote={promoteFloatingDump}
            onRemove={removeDump}
            onSubmit={(dump) => void submitFloatingDump(dump)}
            onBringToFront={bringToFront}
            onViewportResize={handleViewportResize}
          />,
          portalRoot,
        )}
    </div>
  );
}
