import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { DashboardDataProvider, useDashboardData } from "./context/DashboardDataContext";
import { FloatingBrainDumpsProvider } from "./context/FloatingBrainDumpsContext";
import { TaskMenuProvider } from "./context/TaskMenuContext";
import { AmbientVisualizer } from "./components/AmbientVisualizer";
import {
  DashboardSidebar,
  type DashboardView,
} from "./components/DashboardSidebar";
import { CorePaneSidebar } from "./components/CorePaneSidebar";
import { ErrorBanner } from "./components/ErrorBanner";
import { useBackgroundStyle } from "./hooks/useBackgroundStyle";
import { useBackgroundTuning } from "./hooks/useBackgroundTuning";
import { ScopeMenu } from "./task/ScopeMenu";
import { StatusMenu } from "./task/StatusMenu";
import { CalendarView } from "./views/CalendarView";
import { TimelineView } from "./views/TimelineView";
import { CoreView } from "./views/CoreView";
import { readCorePane, writeCorePane, type CorePane } from "./lib/corePane";
import {
  readCalendarPresentation,
  writeCalendarFigure,
  writeCalendarPresentation,
  type CalendarPresentation,
} from "./lib/insights";
import { useCalendarRange } from "./hooks/useCalendarRange";
import { phaseName, phaseTone } from "./lib/period";
import { nextDashboardSize } from "./lib/windowSize";
import "./Dashboard.css";

function DashboardInner() {
  const [view, setView] = useState<DashboardView>("calendar");
  const [calendarPresentation, setCalendarPresentation] =
    useState<CalendarPresentation>(readCalendarPresentation);
  const calendarRange = useCalendarRange();
  const [corePane, setCorePane] = useState<CorePane>(readCorePane);
  const selectCorePane = useCallback((pane: CorePane) => {
    writeCorePane(pane);
    setCorePane(pane);
  }, []);
  const selectCalendarPresentation = useCallback(
    (presentation: CalendarPresentation) => {
      writeCalendarPresentation(presentation);
      setCalendarPresentation(presentation);
    },
    [],
  );
  const { phases, latestPhase } = useDashboardData();
  const backgroundStyle = useBackgroundStyle();
  const backgroundTuning = useBackgroundTuning();
  const currentPhaseName = latestPhase
    ? phaseName(latestPhase.phaseId, phases, latestPhase.phaseLabel)
    : null;
  const isDoing = currentPhaseName
    ? phaseTone(currentPhaseName) === "doing"
    : false;
  // Core panes reuse the layout rules written for their former Sections.
  // Week has no Timeline, so a remembered Timeline presentation shows Calendar
  // until Day is chosen again.
  const showTimeline =
    view === "calendar" &&
    calendarPresentation === "timeline" &&
    calendarRange.mode === "day";
  const surface = view === "core" ? corePane : showTimeline ? "timeline" : "calendar";
  const hasRangeSidebar = view === "calendar";
  const hasSectionSidebar = view === "core" || hasRangeSidebar;
  const [rangeSidebarTarget, setRangeSidebarTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const resize = (event: KeyboardEvent) => {
      const direction =
        event.key === "-" ? -1 : ["+", "="].includes(event.key) ? 1 : 0;
      if (!event.metaKey || event.ctrlKey || event.altKey || !direction) return;

      event.preventDefault();
      const size = nextDashboardSize(
        window.innerWidth,
        window.innerHeight,
        window.screen.availWidth,
        window.screen.availHeight,
        direction,
      );
      void getCurrentWindow()
        .setSize(new LogicalSize(size.width, size.height))
        .catch(console.error);
    };

    window.addEventListener("keydown", resize);
    return () => window.removeEventListener("keydown", resize);
  }, []);

  return (
    <main
      className={`dashboard${hasSectionSidebar ? " dashboard--section-sidebar" : ""}${hasRangeSidebar ? " dashboard--range-sidebar" : ""}${view === "core" && corePane === "tasks" ? " dashboard--tasks" : ""}`}
    >
      {/* Provider (and sticky board) must live under .dashboard so theme
          tokens like --surface / --dump resolve on the notes. */}
      <FloatingBrainDumpsProvider>
        <AmbientVisualizer
          active={isDoing}
          style={backgroundStyle}
          tuning={backgroundTuning}
        />
        <DashboardSidebar view={view} onSelectView={setView} />
        {view === "core" && (
          <CorePaneSidebar pane={corePane} onSelectPane={selectCorePane} />
        )}
        {hasRangeSidebar && <aside className="section-sidebar range-sidebar" ref={setRangeSidebarTarget} />}
        <div
          className={`dashboard__inner dashboard__inner--${surface}${
            view === "core" ? " dashboard__inner--core" : ""
          }`}
        >
          <ErrorBanner />

          {view === "calendar" && !showTimeline && (
            <CalendarView
              sidebarTarget={rangeSidebarTarget}
              presentation={calendarPresentation}
              onPresentation={selectCalendarPresentation}
              range={calendarRange}
            />
          )}
          {showTimeline && (
            <TimelineView
              range={calendarRange}
              sidebarTarget={rangeSidebarTarget}
              presentation={calendarPresentation}
              onPresentation={selectCalendarPresentation}
              onOpenDayInCalendarLogs={(dayMs) => {
                calendarRange.selectMode("day");
                writeCalendarFigure("logs");
                calendarRange.goToDay(dayMs);
                selectCalendarPresentation("calendar");
              }}
            />
          )}
          {view === "core" && (
            <CoreView pane={corePane} />
          )}
        </div>
        <ScopeMenu />
        <StatusMenu />
      </FloatingBrainDumpsProvider>
    </main>
  );
}

function Dashboard() {
  return (
    <DashboardDataProvider>
      <TaskMenuProvider>
        <DashboardInner />
      </TaskMenuProvider>
    </DashboardDataProvider>
  );
}

export default Dashboard;
