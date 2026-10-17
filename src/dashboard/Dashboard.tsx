import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useState } from "react";
import { DashboardDataProvider, useDashboardData } from "./context/DashboardDataContext";
import { FloatingNotesProvider } from "./context/FloatingNotesContext";
import { TaskMenuProvider } from "./context/TaskMenuContext";
import { AmbientVisualizer } from "./components/AmbientVisualizer";
import { DashboardSidebar } from "./components/DashboardSidebar";
import { ViewToggle } from "./components/ViewToggle";
import { ErrorBanner } from "./components/ErrorBanner";
import { useBackgroundStyle } from "./hooks/useBackgroundStyle";
import { useBackgroundTuning } from "./hooks/useBackgroundTuning";
import { ScopeMenu } from "./task/ScopeMenu";
import { StatusMenu } from "./task/StatusMenu";
import { CalendarView } from "./views/CalendarView";
import { TimelineView } from "./views/TimelineView";
import { NotesView } from "./views/NotesView";
import { MetricsView } from "./views/MetricsView";
import { PhasesView } from "./views/PhasesView";
import { TasksView } from "./views/TasksView";
import { sectionLabel, type Section } from "./lib/sections";
import {
  RANGE_MODES,
  RECAP_PRESENTATIONS,
  readRecapPresentation,
  writeRecapPresentation,
  type RecapPresentation,
} from "./lib/insights";
import { useRecapDateRange } from "./hooks/useRecapDateRange";
import { phaseName, phaseTone } from "./lib/period";
import { nextDashboardSize } from "./lib/windowSize";
import "./Dashboard.css";

function DashboardInner() {
  const [section, setSection] = useState<Section>("recap");
  const [recapPresentation, setRecapPresentation] =
    useState<RecapPresentation>(readRecapPresentation);
  const recapDateRange = useRecapDateRange(recapPresentation);
  const [sectionSidebar, setSectionSidebar] = useState<HTMLElement | null>(
    null,
  );
  const selectRecapPresentation = useCallback(
    (presentation: RecapPresentation) => {
      writeRecapPresentation(presentation);
      setRecapPresentation(presentation);
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
  const onRecap = section === "recap";
  const showTimeline = onRecap && recapPresentation === "timeline";
  const surface = !onRecap ? section : showTimeline ? "timeline" : "calendar";
  const recapSwitches = (
    <>
      <ViewToggle
        value={recapDateRange.mode}
        options={RANGE_MODES.map((mode) => ({
          ...mode,
          disabled: showTimeline && mode.key === "week",
        }))}
        label="Recap date range"
        onChange={recapDateRange.selectMode}
      />
      <ViewToggle
        value={recapPresentation}
        options={RECAP_PRESENTATIONS}
        label="Recap presentation"
        onChange={selectRecapPresentation}
      />
    </>
  );

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
      className={`dashboard${section === "tasks" ? " dashboard--tasks" : ""}`}
    >
      {/* Provider (and sticky board) must live under .dashboard so theme
          tokens like --surface / --note resolve on the notes. */}
      <FloatingNotesProvider>
        <AmbientVisualizer
          active={isDoing}
          style={backgroundStyle}
          tuning={backgroundTuning}
        />
        <DashboardSidebar section={section} onSelectSection={setSection} />
        <aside className="section-sidebar" ref={setSectionSidebar}>
          <div className="section-sidebar__head">
            <h2 className="section-sidebar__title">{sectionLabel(section)}</h2>
          </div>
        </aside>
        <div className={`dashboard__inner dashboard__inner--${surface}`}>
          <ErrorBanner />

          {onRecap && !showTimeline && (
            <CalendarView
              onOpenSection={setSection}
              recapSwitches={recapSwitches}
              sectionSidebar={sectionSidebar}
              range={recapDateRange}
            />
          )}
          {showTimeline && (
            <TimelineView
              onOpenSection={setSection}
              recapSwitches={recapSwitches}
              sectionSidebar={sectionSidebar}
              range={recapDateRange}
            />
          )}
          {/* Away from Recap, these four stay mounted so filters, selection,
              and unsent names survive switches between them. Tasks alone
              returns to Day and closes its Task detail on leaving. */}
          {!onRecap && (
            <>
              <div className="section-slot" hidden={section !== "notes"}>
                <NotesView sectionSidebar={sectionSidebar} visible={section === "notes"} />
              </div>
              <div className="section-slot" hidden={section !== "tasks"}>
                <TasksView sectionSidebar={sectionSidebar} visible={section === "tasks"} />
              </div>
              <div className="section-slot" hidden={section !== "metrics"}>
                <MetricsView sectionSidebar={sectionSidebar} visible={section === "metrics"} />
              </div>
              <div className="section-slot" hidden={section !== "phases"}>
                <PhasesView />
              </div>
            </>
          )}
        </div>
        <ScopeMenu />
        <StatusMenu />
      </FloatingNotesProvider>
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
