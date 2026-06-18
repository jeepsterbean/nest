import { useState } from "react";
import { DashboardDataProvider } from "./context/DashboardDataContext";
import { TaskMenuProvider } from "./context/TaskMenuContext";
import {
  DashboardHeader,
  type DashboardView,
} from "./components/DashboardHeader";
import { BrainDumpModal } from "./components/BrainDumpModal";
import { ErrorBanner } from "./components/ErrorBanner";
import { ScopeMenu } from "./task/ScopeMenu";
import { StatusMenu } from "./task/StatusMenu";
import { OverviewView } from "./views/OverviewView";
import { JournalView } from "./views/JournalView";
import { TasksView } from "./views/TasksView";
import { MetricsView } from "./views/MetricsView";
import { PhasesView } from "./views/PhasesView";
import "./Dashboard.css";

function DashboardInner() {
  const [view, setView] = useState<DashboardView>("overview");
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);
  return (
    <main className="dashboard">
      <div className="dashboard__inner">
        <DashboardHeader
          view={view}
          onSelectView={setView}
          brainDumpOpen={brainDumpOpen}
          onToggleBrainDump={() => setBrainDumpOpen((open) => !open)}
        />

        <BrainDumpModal
          open={brainDumpOpen}
          onClose={() => setBrainDumpOpen(false)}
        />

        <ErrorBanner />

        {view === "overview" && <OverviewView />}
        {view === "journal" && <JournalView />}
        {view === "tasks" && <TasksView />}
        {view === "metrics" && <MetricsView />}
        {view === "phases" && <PhasesView />}
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
