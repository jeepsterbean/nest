import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEventHandler,
  type ReactNode,
} from "react";
import {
  deleteMetricCheckIn,
  submitBrainDump,
  submitMetricCheckIn,
} from "../../lib/commands";
import { readHiddenPulseIds } from "../../lib/pulseVisibility";
import {
  isBrainDumpPeelShortcut,
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
  useBrainDumpDraft,
  useRecentBrainDumpHistory,
} from "../../lib/brainDumpDraft";
import { useFloatingBrainDumpsContext } from "../context/FloatingBrainDumpsContext";
import {
  DayStats,
  PhaseTotals,
} from "../components/DayReflection";
import { BrainDumpHistoryControls } from "../components/BrainDumpHistoryControls";
import { BrainDumpSurface } from "../components/BrainDumpSurface";
import { ControlPanelTile } from "../components/ControlPanelTile";
import { OverviewTasksPanel } from "../components/OverviewTasksPanel";
import { gridArea, OverviewTile } from "../components/OverviewTile";
import { MetricCheckIn } from "../components/MetricCheckIn";
import { ViewToggle } from "../components/ViewToggle";
import { useComposerTagProps } from "../components/BrainDumpTags";
import { useDashboardData } from "../context/DashboardDataContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useTileIcons } from "../hooks/useTileIcons";
import { windowInsight } from "../lib/insights";
import { buildLogExportEvents, LOG_EVENT_BATCH_SIZE } from "../lib/logs";
import { type TimelineLogEvent } from "../lib/timeline";
import { startOfDayMs } from "../lib/time";
import {
  canHideTile,
  hiddenTileIds,
  type OverviewLayoutController,
  stackOrder,
  TILE_LABELS,
  TILE_RULES,
  type TileLayout,
} from "../lib/overviewGrid";
import { LogsTimeline } from "./LogsTimeline";

const OVERVIEW_WINDOW_SECONDS = 60 * 60;

const OVERVIEW_TIMELINE_FILTERS = [
  { key: "timeline", label: "Timeline" },
  { key: "dumps", label: "Brain dumps" },
  { key: "metrics", label: "Metrics" },
] as const;

type OverviewTimelineFilter =
  (typeof OVERVIEW_TIMELINE_FILTERS)[number]["key"];

type TileChrome = {
  icon: ReactNode;
  action: ReactNode;
  onHeaderPointerDown: PointerEventHandler<HTMLElement>;
  dragTitle: string;
};

const EMPTY_COPY: Record<
  OverviewTimelineFilter,
  { title: string; body: string }
> = {
  timeline: {
    title: "Nothing on the timeline yet",
    body: "Metric check-ins, brain dumps, Phase changes, and Working now starts and stops will land here.",
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

export function OverviewView({
  onOpenTasks,
  overviewLayout,
}: {
  onOpenTasks: () => void;
  overviewLayout: Pick<
    OverviewLayoutController,
    "layout" | "resize" | "minimise" | "expand" | "hide" | "show" | "applyLayout"
  >;
}) {
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
  const gridRef = useRef<HTMLDivElement | null>(null);
  const {
    layout,
    resize,
    minimise,
    expand,
    hide,
    show,
    applyLayout,
  } = overviewLayout;
  const icons = useTileIcons();
  const [dragLayout, setDragLayout] = useState<TileLayout[] | null>(null);
  const [dropPreview, setDropPreview] = useState<{
    rect: Pick<TileLayout, "x" | "y" | "w" | "h">;
    valid: boolean;
  } | null>(null);
  const [stacked, setStacked] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 860px)").matches,
  );
  const mainDumpRef = useRef<HTMLElement | null>(null);
  const [brainDumpDraft, setBrainDumpDraft] = useBrainDumpDraft();
  const { text: brainDumpText, tagIds: brainDumpTagIds } = brainDumpDraft;
  const [brainDumpSubmitting, setBrainDumpSubmitting] = useState(false);
  const [metricSubmitting, setMetricSubmitting] = useState(false);
  const brainDumpDraftRevision = `${brainDumpText}\n${brainDumpTagIds.join(",")}`;
  const brainDumpHistory = useRecentBrainDumpHistory(
    brainDumpText,
    setError,
    brainDumpDraftRevision,
  );
  const composerTagProps = useComposerTagProps(
    tags,
    brainDumpTagIds,
    brainDumpHistory.viewingDump,
  );
  const { forkToFloating } = useFloatingBrainDumpsContext();

  useEffect(() => {
    const query = window.matchMedia("(max-width: 860px)");
    const update = () => setStacked(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

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

  const dayTimelineEvents = useMemo(
    () =>
      buildLogExportEvents(
        checkIns,
        phaseCheckIns,
        brainDumps,
        taskWorkStretches,
        dayFromSec,
      ).filter((event) => event.at >= dayFromSec),
    [
      brainDumps,
      checkIns,
      dayFromSec,
      phaseCheckIns,
      taskWorkStretches,
    ],
  );

  const timelineEvents = useMemo(
    () =>
      dayTimelineEvents.filter((event) =>
        matchesTimelineFilter(event, timelineFilter),
      ),
    [dayTimelineEvents, timelineFilter],
  );

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

  // Stable identities so the memoized timeline can skip re-rendering while
  // the brain dump composer above it updates on every keystroke.
  const onDeleteCheckIn = useCallback(
    (id: number) => void mutate(() => deleteMetricCheckIn(id)),
    [mutate],
  );

  const toggleDumpExpanded = useCallback((id: number) => {
    setExpandedDumpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const submitOverviewDump = async () => {
    if (!trimBrainDumpDraft(brainDumpDraft) || brainDumpSubmitting) return;
    setBrainDumpSubmitting(true);
    const ok = await mutate(() =>
      submitBrainDump(brainDumpDraft.text, brainDumpTagIds),
    );
    if (ok) {
      setBrainDumpDraft({ text: "", tagIds: [] });
      await brainDumpHistory.refresh();
    }
    setBrainDumpSubmitting(false);
  };

  const peelToFloating = useCallback(() => {
    if (brainDumpHistory.viewingHistory) return;
    if (forkToFloating(brainDumpDraft)) {
      setBrainDumpDraft({ text: "", tagIds: [] });
    }
  }, [
    brainDumpDraft,
    brainDumpHistory.viewingHistory,
    forkToFloating,
    setBrainDumpDraft,
  ]);

  const peelViewedDumpToFloating = useCallback(() => {
    const viewedDump = brainDumpHistory.viewingDump;
    if (!viewedDump) return;
    forkToFloating({
      text: viewedDump.text,
      tagIds: viewedDump.tags.map((tag) => tag.id),
    });
  }, [brainDumpHistory.viewingDump, forkToFloating]);

  const onMainDumpKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    minimised = false,
  ) => {
    if (brainDumpHistory.viewingHistory) return;
    if (
      minimised &&
      event.key === "Enter" &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      if (!event.shiftKey) void submitOverviewDump();
      return;
    }
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

  const visiblePulses = useMemo(
    () => {
      const hiddenPulseIds = readHiddenPulseIds();
      return pulses.filter((pulse) => !hiddenPulseIds.has(pulse.id));
    },
    [pulses],
  );
  const activeLayout = dragLayout ?? layout;
  const hiddenIds = useMemo(() => hiddenTileIds(activeLayout), [activeLayout]);

  const renderTileContent = (tile: TileLayout, chrome?: TileChrome) => {
    if (tile.id === "controlPanel") {
      return (
        <ControlPanelTile
          hiddenIds={hiddenIds}
          icons={icons}
          layout={activeLayout}
          gridRef={gridRef}
          stacked={stacked}
          onShow={(id, at) => {
            show(id, at);
            setDropPreview(null);
          }}
          onDropPreview={setDropPreview}
        />
      );
    }

    if (tile.id === "lastHour") {
      return (
        <div className="overview-day">
          <DayStats stats={dayReflection.stats} />
          <PhaseTotals sessions={dayReflection.sessions} phases={phases} />
        </div>
      );
    }

    if (tile.id === "tasks") {
      return (
        <OverviewTasksPanel
          onOpenTasks={onOpenTasks}
          minimised={tile.minimised}
          headerStart={chrome?.icon}
          headerEnd={chrome?.action}
          onHeaderPointerDown={chrome?.onHeaderPointerDown}
          dragTitle={chrome?.dragTitle}
        />
      );
    }

    if (tile.id === "timeline") {
      const events = tile.minimised
        ? dayTimelineEvents.slice(0, 3)
        : visibleTimelineEvents;
      const timelineEmpty = tile.minimised ? EMPTY_COPY.timeline : empty;
      return (
        <>
          {tile.minimised ? (
            chrome ? (
              <header
                className="overview-panel__head overview-panel__head--draggable"
                title={chrome.dragTitle}
                onPointerDown={chrome.onHeaderPointerDown}
              >
                <div className="overview-panel__head-start">{chrome.icon}</div>
                <div className="overview-panel__head-end">{chrome.action}</div>
              </header>
            ) : null
          ) : (
            <header
              className={`overview-panel__head${
                chrome?.onHeaderPointerDown
                  ? " overview-panel__head--draggable"
                  : ""
              }`}
              title={chrome?.dragTitle}
              onPointerDown={chrome?.onHeaderPointerDown}
            >
              {chrome?.icon ? (
                <div className="overview-panel__head-start">{chrome.icon}</div>
              ) : null}
              <ViewToggle
                value={timelineFilter}
                options={OVERVIEW_TIMELINE_FILTERS}
                label="Timeline filter"
                onChange={(next) => {
                  setTimelineFilter(next);
                  setVisibleEventCount(LOG_EVENT_BATCH_SIZE);
                }}
              />
              {chrome?.action ? (
                <div className="overview-panel__head-end">{chrome.action}</div>
              ) : null}
            </header>
          )}
          <div className="overview-panel__scroll">
            {!loaded ? null : events.length === 0 ? (
              <div className="dash-empty">
                <strong>{timelineEmpty.title}</strong>
                <span>{timelineEmpty.body}</span>
              </div>
            ) : (
              <>
                <LogsTimeline
                  events={events}
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
                {!tile.minimised && remainingEventCount > 0 ? (
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
        </>
      );
    }

    if (tile.id === "brainDump") {
      return loaded ? (
        <BrainDumpSurface
          layout="overview"
          className={
            tile.minimised
              ? "brain-dump-surface--compact"
              : "brain-dump-surface--anchored"
          }
          text={brainDumpHistory.text}
          tagIds={composerTagProps.selectedIds}
          tags={composerTagProps.tags}
          readOnly={brainDumpHistory.viewingHistory}
          tagsDisabled={brainDumpHistory.viewingHistory}
          showTags={!tile.minimised}
          textareaLabel={
            brainDumpHistory.viewingHistory
              ? "Saved brain dump, read only"
              : "Brain dump"
          }
          headerStart={chrome?.icon}
          headerEnd={
            <>
              {tile.minimised ? null : (
                <BrainDumpHistoryControls
                  canViewPrevious={brainDumpHistory.canViewPrevious}
                  canViewNext={brainDumpHistory.canViewNext}
                  onPrevious={brainDumpHistory.showPrevious}
                  onNext={brainDumpHistory.showNext}
                  onPeel={peelViewedDumpToFloating}
                  submittedAt={brainDumpHistory.viewingDump?.createdAt}
                />
              )}
              {chrome?.action}
            </>
          }
          onTextChange={(text) =>
            setBrainDumpDraft((draft) => ({ ...draft, text }))
          }
          onTagsChange={handleTagsChange}
          onKeyDown={(event) => onMainDumpKeyDown(event, tile.minimised)}
          onHeaderPointerDown={chrome?.onHeaderPointerDown}
          dismissPopupsOnOutsideInteraction
          editorRef={mainDumpRef}
        />
      ) : null;
    }

    return (
      <MetricCheckIn
        layout="overview"
        metrics={metrics}
        pulses={visiblePulses}
        submitting={metricSubmitting}
        emptyCopy={
          pulses.length
            ? "No Pulses are shown. Turn one on in Settings."
            : "Create a Pulse in Settings."
        }
        onComplete={async (pulse, ratings) => {
          setMetricSubmitting(true);
          const saved = await mutate(() =>
            submitMetricCheckIn(pulse.id, ratings),
          );
          setMetricSubmitting(false);
          if (!saved) throw new Error("Metric check-in could not be saved.");
        }}
        headerStart={chrome?.icon}
        headerEnd={chrome?.action}
        onHeaderPointerDown={chrome?.onHeaderPointerDown}
        dragTitle={chrome?.dragTitle}
      />
    );
  };

  return (
    <div className="overview-grid" ref={gridRef} aria-label="Overview">
      {dropPreview ? (
        <div
          className={`overview-tile__ghost${dropPreview.valid ? "" : " is-invalid"}`}
          style={{ gridArea: gridArea(dropPreview.rect) }}
          aria-hidden="true"
        />
      ) : null}
      {stackOrder(activeLayout).map((tile) => (
        <OverviewTile
          key={tile.id}
          tile={tile}
          layout={activeLayout}
          rules={TILE_RULES[tile.id]}
          gridRef={gridRef}
          stacked={stacked}
          onPreviewLayoutChange={setDragLayout}
          onCommitLayout={(next) => {
            applyLayout(next);
            setDragLayout(null);
          }}
          onCancelPreview={() => setDragLayout(null)}
          onResize={(dw, dh) => resize(tile.id, dw, dh)}
          onMinimise={() => minimise(tile.id)}
          onExpand={() => expand(tile.id)}
          onHide={canHideTile(tile.id) ? () => hide(tile.id) : undefined}
          bodyDraggable={tile.id === "controlPanel"}
          label={TILE_LABELS[tile.id]}
          icon={icons[tile.id]}
          renderInlineHeader={
            tile.id === "lastHour"
              ? undefined
              : (chrome) => renderTileContent(tile, chrome)
          }
        >
          {tile.id === "lastHour" ? renderTileContent(tile) : null}
        </OverviewTile>
      ))}
    </div>
  );
}
