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
import { ErrorBanner } from "./components/ErrorBanner";
import { useBackgroundStyle } from "./hooks/useBackgroundStyle";
import { useBackgroundTuning } from "./hooks/useBackgroundTuning";
import { ScopeMenu } from "./task/ScopeMenu";
import { StatusMenu } from "./task/StatusMenu";
import { OverviewView } from "./views/OverviewView";
import { CalendarView } from "./views/CalendarView";
import { InsightsView } from "./views/InsightsView";
import { LogsView } from "./views/LogsView";
import { CoreView } from "./views/CoreView";
import { SettingsView } from "./views/SettingsView";
import { AssistantView } from "./views/AssistantView";
import { readCorePane, writeCorePane, type CorePane } from "./lib/corePane";
import { writeInsightsRangeMode } from "./lib/insights";
import { phaseName, phaseTone } from "./lib/period";
import { useOverviewLayout } from "./lib/overviewGrid";
import { nextDashboardSize } from "./lib/windowSize";
import "./Dashboard.css";

function DashboardInner() {
  const [view, setView] = useState<DashboardView>("overview");
  const [corePane, setCorePane] = useState<CorePane>(readCorePane);
  const selectCorePane = useCallback((pane: CorePane) => {
    writeCorePane(pane);
    setCorePane(pane);
  }, []);
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
  const surface = view === "core" ? corePane : view;

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
    <main className="dashboard">
      {/* Provider (and sticky board) must live under .dashboard so theme
          tokens like --surface / --dump resolve on the notes. */}
      <FloatingBrainDumpsProvider>
        <AmbientVisualizer
          active={isDoing}
          style={backgroundStyle}
          tuning={backgroundTuning}
        />
        <DashboardSidebar view={view} onSelectView={setView} />
        <div
          className={`dashboard__inner dashboard__inner--${surface}${
            view === "core" ? " dashboard__inner--core" : ""
          }${showGreetings ? "" : " dashboard__inner--no-greetings"}`}
        >
          {showGreetings && (
            <DashboardHeader
              overviewLayout={overviewLayout}
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
              onOpenLastHourInsights={() => {
                writeInsightsRangeMode("lastHour");
                setView("insights");
              }}
              overviewLayout={overviewLayout}
              settingsOpen={overviewSettingsOpen}
              onCloseSettings={closeOverviewSettings}
            />
          )}
          {view === "calendar" && <CalendarView />}
          {view === "insights" && <InsightsView />}
          {view === "logs" && <LogsView />}
          {view === "core" && (
            <CoreView pane={corePane} onSelectPane={selectCorePane} />
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
