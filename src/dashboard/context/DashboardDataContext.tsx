import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { subscribeTauriEvent } from "../../lib/tauriListen";
import {
  getCheckInSchedule,
  latestPhaseCheckIn,
  listBrainDumps,
  listMetricCheckIns,
  listMetrics,
  listPulses,
  listPhaseCheckIns,
  listPhases,
  listTasks,
  listTaskDependencies,
  listTaskStatusEvents,
  listTaskWorkStretches,
} from "../../lib/commands";
import type {
  BrainDump,
  CheckInSchedule,
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Pulse,
  Task,
  TaskDependency,
  TaskStatusEvent,
  TaskWorkStretch,
} from "../../lib/types";
import { buildScopeTree, type ScopeTree } from "../lib/scope";
import { buildTaskGraph, type TaskGraphProjection } from "../lib/taskGraph";

/** How far back check-ins, phases, dumps and status events are loaded.
 * Insights' longest range (30 days) must stay inside this window. */
const HISTORY_WINDOW_SECONDS = 30 * 24 * 60 * 60;

type DashboardData = {
  tasks: Task[];
  taskDependencies: TaskDependency[];
  taskStatusEvents: TaskStatusEvent[];
  taskWorkStretches: TaskWorkStretch[];
  taskGraph: TaskGraphProjection;
  metrics: Metric[];
  pulses: Pulse[];
  phases: Phase[];
  checkIns: MetricCheckInWithRatings[];
  phaseCheckIns: PhaseCheckIn[];
  brainDumps: BrainDump[];
  latestPhase: PhaseCheckIn | null;
  checkInSchedule: CheckInSchedule | null;
  scopeTree: ScopeTree;
  loaded: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setError: (error: string | null) => void;
  // Network primitive: runs a mutation, then reloads, surfacing failures via
  // setError. Returns true on success so callers can gate success-only side
  // effects (clearing inputs, closing dialogs) on the result.
  mutate: (fn: () => Promise<unknown>) => Promise<boolean>;
};

const DashboardDataContext = createContext<DashboardData | null>(null);

export function DashboardDataProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskDependencies, setTaskDependencies] = useState<TaskDependency[]>([]);
  const [taskStatusEvents, setTaskStatusEvents] = useState<TaskStatusEvent[]>([]);
  const [taskWorkStretches, setTaskWorkStretches] = useState<TaskWorkStretch[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [checkIns, setCheckIns] = useState<MetricCheckInWithRatings[]>([]);
  const [phaseCheckIns, setPhaseCheckIns] = useState<PhaseCheckIn[]>([]);
  const [brainDumps, setBrainDumps] = useState<BrainDump[]>([]);
  const [latestPhase, setLatestPhase] = useState<PhaseCheckIn | null>(null);
  const [checkInSchedule, setCheckInSchedule] =
    useState<CheckInSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const reloadRequest = useRef(0);

  const reload = useCallback(async () => {
    const request = ++reloadRequest.current;
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - HISTORY_WINDOW_SECONDS;
      const to = now + 1;
      const [t, td, tse, tws, m, pulses, p, ci, pci, bd, lp, schedule] = await Promise.all([
        listTasks(),
        listTaskDependencies(),
        listTaskStatusEvents(from, to),
        listTaskWorkStretches(from, to),
        listMetrics(),
        listPulses(),
        listPhases(true),
        listMetricCheckIns(from, to),
        listPhaseCheckIns(from, to),
        listBrainDumps(from, to),
        latestPhaseCheckIn(),
        getCheckInSchedule(),
      ]);
      if (request !== reloadRequest.current) return;
      setTasks(t);
      setTaskDependencies(td);
      setTaskStatusEvents(tse);
      setTaskWorkStretches(tws);
      setMetrics(m);
      setPulses(pulses);
      setPhases(p);
      setCheckIns(ci);
      setPhaseCheckIns(pci);
      setBrainDumps(bd);
      setLatestPhase(lp);
      setCheckInSchedule(schedule);
    } catch (e) {
      if (request === reloadRequest.current) setError(String(e));
    } finally {
      if (request === reloadRequest.current) setLoaded(true);
    }
  }, []);

  const mutate = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await reload();
        return true;
      } catch (e) {
        setError(String(e));
        return false;
      }
    },
    [reload],
  );

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    const stops = ["check-in-submitted", "phase-changed"].map((event) =>
      subscribeTauriEvent(event, reload),
    );
    return () => stops.forEach((stop) => stop());
  }, [reload]);

  const scopeTree = useMemo(() => buildScopeTree(tasks), [tasks]);
  const taskGraph = useMemo(
    () => buildTaskGraph(tasks, taskDependencies),
    [tasks, taskDependencies],
  );

  const value = useMemo<DashboardData>(
    () => ({
      tasks,
      taskDependencies,
      taskStatusEvents,
      taskWorkStretches,
      taskGraph,
      metrics,
      pulses,
      phases,
      checkIns,
      phaseCheckIns,
      brainDumps,
      latestPhase,
      checkInSchedule,
      scopeTree,
      loaded,
      error,
      reload,
      setError,
      mutate,
    }),
    [
      tasks,
      taskDependencies,
      taskStatusEvents,
      taskWorkStretches,
      taskGraph,
      metrics,
      pulses,
      phases,
      checkIns,
      phaseCheckIns,
      brainDumps,
      latestPhase,
      checkInSchedule,
      scopeTree,
      loaded,
      error,
      reload,
      mutate,
    ],
  );

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
}

export function useDashboardData() {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error("useDashboardData must be used within DashboardDataProvider");
  }
  return ctx;
}
