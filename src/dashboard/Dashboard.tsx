import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { DashboardDataProvider, useDashboardData } from "./context/DashboardDataContext";
import { FloatingBrainDumpsProvider } from "./context/FloatingBrainDumpsContext";
import { TaskMenuProvider } from "./context/TaskMenuContext";
import { AmbientVisualizer } from "./components/AmbientVisualizer";
import {
  DashboardHeader,
  DashboardSidebar,
  type DashboardView,
} from "./components/DashboardHeader";
import { CorePaneSidebar } from "./components/CorePaneSidebar";
import { OverviewLayoutSidebar } from "./components/OverviewLayoutSidebar";
import { ErrorBanner } from "./components/ErrorBanner";
import { useBackgroundStyle } from "./hooks/useBackgroundStyle";
import { useBackgroundTuning } from "./hooks/useBackgroundTuning";
import { ScopeMenu } from "./task/ScopeMenu";
import { StatusMenu } from "./task/StatusMenu";
import { OverviewView } from "./views/OverviewView";
import { CalendarView } from "./views/CalendarView";
import { LogsView } from "./views/LogsView";
import { CoreView } from "./views/CoreView";
import { SettingsView } from "./views/SettingsView";
import { AssistantView } from "./views/AssistantView";
import { readCorePane, writeCorePane, type CorePane } from "./lib/corePane";
import {
  openLastHourOnCalendar,
  readCalendarPresentation,
  writeCalendarFigure,
  writeCalendarPresentation,
  type CalendarPresentation,
} from "./lib/insights";
import { useCalendarRange } from "./hooks/useCalendarRange";
import { LOGS_CALENDAR_RANGE_STORE } from "./lib/logs";
import { phaseName, phaseTone } from "./lib/period";
import { useOverviewLayout } from "./lib/overviewGrid";
import { nextDashboardSize } from "./lib/windowSize";
import "./Dashboard.css";

function DashboardInner() {
  const [view, setView] = useState<DashboardView>("overview");
  const [calendarPresentation, setCalendarPresentation] =
    useState<CalendarPresentation>(readCalendarPresentation);
  const calendarRange = useCalendarRange();
  const timelineRange = useCalendarRange(LOGS_CALENDAR_RANGE_STORE);
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
  const overviewLayout = useOverviewLayout();
  const [overviewSettingsOpen, setOverviewSettingsOpen] = useState(false);
  const closeOverviewSettings = useCallback(
    () => setOverviewSettingsOpen(false),
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
  // During Doing, Overview drops the Greetings board so the ambient work
  // surface takes the top of the content area. Timer stays on the Popup.
  const showGreetings = view === "overview" && !isDoing;
  // Core panes reuse the layout rules written for their former Sections.
  const surface =
    view === "core"
      ? corePane
      : view === "calendar"
        ? calendarPresentation
        : view;
  const hasRangeSidebar = view === "calendar";
  const hasSectionSidebar = view === "core" || view === "overview" || hasRangeSidebar;
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
      className={`dashboard${hasSectionSidebar ? " dashboard--section-sidebar" : ""}${hasRangeSidebar ? " dashboard--range-sidebar" : ""}`}
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
        {view === "overview" && <OverviewLayoutSidebar {...overviewLayout} />}
        {hasRangeSidebar && <aside className="section-sidebar range-sidebar" ref={setRangeSidebarTarget} />}
        <div
          className={`dashboard__inner dashboard__inner--${surface}${
            view === "core" ? " dashboard__inner--core" : ""
          }${showGreetings ? "" : " dashboard__inner--no-greetings"}`}
        >
          {showGreetings && (
            <DashboardHeader
              overviewSettings={{
                open: overviewSettingsOpen,
                onToggle: () => setOverviewSettingsOpen((open) => !open),
              }}
            />
          )}

          <ErrorBanner />

          {view === "overview" && (
            <OverviewView
              onOpenTasks={() => {
                selectCorePane("tasks");
                setView("core");
              }}
              onOpenLastHour={() => {
                openLastHourOnCalendar();
                calendarRange.selectMode("lastHour");
                selectCalendarPresentation("calendar");
                setView("calendar");
              }}
              overviewLayout={overviewLayout}
              settingsOpen={overviewSettingsOpen}
              onCloseSettings={closeOverviewSettings}
            />
          )}
          {view === "calendar" && calendarPresentation === "calendar" && (
            <CalendarView
              sidebarTarget={rangeSidebarTarget}
              presentation={calendarPresentation}
              onPresentation={selectCalendarPresentation}
              range={calendarRange}
            />
          )}
          {view === "calendar" && calendarPresentation === "timeline" && (
            <LogsView
              range={timelineRange}
              sidebarTarget={rangeSidebarTarget}
              presentation={calendarPresentation}
              onPresentation={selectCalendarPresentation}
              onOpenLogsDay={(dayMs) => {
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
          {view === "assistant" && <AssistantView onOpenSettings={() => setView("settings")} />}
          {view === "settings" && <SettingsView />}
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
