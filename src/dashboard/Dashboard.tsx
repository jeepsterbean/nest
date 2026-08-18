import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { DashboardDataProvider } from "./context/DashboardDataContext";
import { TaskMenuProvider } from "./context/TaskMenuContext";
import {
  DashboardHeader,
  DashboardSidebar,
  type DashboardView,
} from "./components/DashboardHeader";
import { ErrorBanner } from "./components/ErrorBanner";
import { ScopeMenu } from "./task/ScopeMenu";
import { StatusMenu } from "./task/StatusMenu";
import { OverviewView } from "./views/OverviewView";
import { CalendarView } from "./views/CalendarView";
import { InsightsView } from "./views/InsightsView";
import { JournalView } from "./views/JournalView";
import { TasksView } from "./views/TasksView";
import { MetricsView } from "./views/MetricsView";
import { nextDashboardSize } from "./lib/windowSize";
import "./Dashboard.css";

function DashboardInner() {
  const [view, setView] = useState<DashboardView>("overview");

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
      <DashboardSidebar view={view} onSelectView={setView} />
      <div className={`dashboard__inner dashboard__inner--${view}`}>
        <DashboardHeader />

        <ErrorBanner />

        {view === "overview" && <OverviewView />}
        {view === "calendar" && <CalendarView />}
        {view === "insights" && <InsightsView />}
        {view === "journal" && <JournalView />}
        {view === "tasks" && <TasksView />}
        {view === "metrics" && <MetricsView />}
      </div>
      <ScopeMenu />
      <StatusMenu />
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
