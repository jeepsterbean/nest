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
  submitMetricCheckIn,
} from "../../lib/commands";
import { readHiddenPulseIds } from "../../lib/pulseVisibility";
import { useRecentBrainDumpHistory } from "../../lib/brainDumpDraft";
import { useFloatingBrainDumpsContext } from "../context/FloatingBrainDumpsContext";
import { BrainDumpHistoryControls } from "../components/BrainDumpHistoryControls";
import { BrainDumpSurface } from "../components/BrainDumpSurface";
import { ControlPanelTile } from "../components/ControlPanelTile";
import { OverviewTasksPanel } from "../components/OverviewTasksPanel";
import { gridArea, OverviewTile } from "../components/OverviewTile";
import { MetricCheckIn } from "../components/MetricCheckIn";
import { useComposerTagProps } from "../components/BrainDumpTags";
import { LogKindToggle, LogsRawToggle } from "../components/logs/LogKindToggle";
import {
  HISTORY_WINDOW_DAYS,
  useDashboardData,
} from "../context/DashboardDataContext";
import { useBrainDumpComposer } from "../hooks/useBrainDumpComposer";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useTileIcons } from "../hooks/useTileIcons";
import { lastHourPeriod } from "../lib/insights";
import {
  ALL_LOG_KINDS,
  buildLogsEvents,
  LOG_EMPTY_COPY,
  LOG_EVENT_BATCH_SIZE,
  MIXED_LOG_EMPTY_COPY,
  type LogKindKey,
} from "../lib/logs";
import { historyStartSec } from "../lib/time";
import {
  canHideTile,
  hiddenTileIds,
  type OverviewLayoutController,
  stackOrder,
  TILE_LABELS,
  TILE_RULES,
  type TileLayout,
} from "../lib/overviewGrid";
import { InsightsPanel } from "./InsightsPanel";
import { TimelineList } from "./TimelineList";
import { OverviewSettings } from "./OverviewSettings";

type TileChrome = {
  icon: ReactNode;
  action: ReactNode;
  onHeaderPointerDown: PointerEventHandler<HTMLElement>;
  dragTitle: string;
};

export function OverviewView({
  onOpenTasks,
  onOpenLastHour,
  overviewLayout,
  settingsOpen,
  onCloseSettings,
}: {
  onOpenTasks: () => void;
  onOpenLastHour: () => void;
  overviewLayout: Pick<
    OverviewLayoutController,
    "layout" | "resize" | "minimise" | "expand" | "hide" | "show" | "applyLayout"
  >;
  settingsOpen: boolean;
  onCloseSettings: () => void;
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
  const brainDumpComposer = useBrainDumpComposer();
  const { text: brainDumpText, tagIds: brainDumpTagIds } = brainDumpComposer.draft;
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
  const [timelineKinds, setTimelineKinds] =
    useState<LogKindKey[]>(ALL_LOG_KINDS);
  const [everyPhaseCheckpoint, setEveryPhaseCheckpoint] = useState(false);
  const [visibleEventCount, setVisibleEventCount] = useState(
    LOG_EVENT_BATCH_SIZE,
  );
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(
    () => new Set(),
  );
  const phasesOnly = timelineKinds.length === 1 && timelineKinds[0] === "phases";
  const showsEveryPhaseCheckpoint = phasesOnly && everyPhaseCheckpoint;
  const historyFromSec = historyStartSec(nowMs, HISTORY_WINDOW_DAYS);

  // Same minute clock as Calendar Last hour, so the tile and Insights stay on
  // one window.
  const lastHourWindow = useMemo(() => {
    const nowSec = Math.floor(nowMs / 1000);
    return { ...lastHourPeriod(nowSec), nowMs, nowSec };
  }, [nowMs]);

  const historyEvents = useMemo(
    () =>
      buildLogsEvents(
        timelineKinds,
        showsEveryPhaseCheckpoint,
        checkIns,
        phaseCheckIns,
        brainDumps,
        taskWorkStretches,
        historyFromSec,
        taskStatusEvents,
      ),
    [
      brainDumps,
      checkIns,
      historyFromSec,
      phaseCheckIns,
      showsEveryPhaseCheckpoint,
      taskStatusEvents,
      taskWorkStretches,
      timelineKinds,
    ],
  );

  const visibleTimelineEvents = useMemo(
    () => historyEvents.slice(0, visibleEventCount),
    [historyEvents, visibleEventCount],
  );
  const remainingEventCount = Math.max(
    0,
    historyEvents.length - visibleEventCount,
  );
  const nextBatchSize = Math.min(LOG_EVENT_BATCH_SIZE, remainingEventCount);
  const empty =
    timelineKinds.length === 1
      ? LOG_EMPTY_COPY[timelineKinds[0]]
      : MIXED_LOG_EMPTY_COPY;

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

  const updateTimelineKinds = useCallback((next: LogKindKey[]) => {
    setTimelineKinds(next);
    setEveryPhaseCheckpoint(false);
    setVisibleEventCount(LOG_EVENT_BATCH_SIZE);
  }, []);

  const toggleOverviewEveryPhaseCheckpoint = useCallback(() => {
    setEveryPhaseCheckpoint((on) => !on);
    setVisibleEventCount(LOG_EVENT_BATCH_SIZE);
  }, []);

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
      if (!event.shiftKey) void brainDumpComposer.submit(brainDumpHistory.refresh);
      return;
    }
    brainDumpComposer.handleShortcutKeyDown(event, brainDumpHistory.refresh);
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
        <InsightsPanel
          from={lastHourWindow.from}
          to={lastHourWindow.to}
          live
          nowMs={lastHourWindow.nowMs}
          nowSec={lastHourWindow.nowSec}
          variant="tile"
        />
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
        ? historyEvents.slice(0, 3)
        : visibleTimelineEvents;
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
              className={`overview-panel__head overview-panel__head--kinds${
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
              <LogKindToggle
                kinds={timelineKinds}
                label="Timeline filter"
                onChange={updateTimelineKinds}
              />
              {phasesOnly ? (
                <LogsRawToggle
                  active={everyPhaseCheckpoint}
                  onClick={toggleOverviewEveryPhaseCheckpoint}
                />
              ) : null}
              {chrome?.action ? (
                <div className="overview-panel__head-end">{chrome.action}</div>
              ) : null}
            </header>
          )}
          <div className="overview-panel__scroll">
            {!loaded ? null : events.length === 0 ? (
              <div className="dash-empty">
                <strong>{empty.title}</strong>
                <span>{empty.body}</span>
              </div>
            ) : (
              <>
                <TimelineList
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
                  dayChrome={!tile.minimised}
                  colorsTimeColumn={timelineKinds.includes("phases")}
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
                      {Math.min(visibleEventCount, historyEvents.length)} of{" "}
                      {historyEvents.length}
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
          onTextChange={brainDumpComposer.setText}
          onTagsChange={brainDumpComposer.setTagIds}
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
    <div className="overview-workspace">
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
          onOpenSection={
            tile.id === "lastHour"
              ? {
                  label: "Open Last hour in Calendar",
                  open: onOpenLastHour,
                }
              : undefined
          }
          renderInlineHeader={
            tile.id === "lastHour" || tile.id === "controlPanel"
              ? undefined
              : (chrome) => renderTileContent(tile, chrome)
          }
        >
          {tile.id === "lastHour" || tile.id === "controlPanel"
            ? renderTileContent(tile)
            : null}
        </OverviewTile>
      ))}
      </div>
      <OverviewSettings open={settingsOpen} onClose={onCloseSettings} />
    </div>
  );
}
