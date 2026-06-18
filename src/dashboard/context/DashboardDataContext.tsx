import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import {
  getCheckInSchedule,
  latestPhaseCheckIn,
  listBrainDumps,
  listMetricCheckIns,
  listMetrics,
  listPhaseCheckIns,
  listPhases,
  listTasks,
} from "../../lib/commands";
import type {
  BrainDump,
  CheckInSchedule,
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Task,
} from "../../lib/types";
import { buildScopeTree, type ScopeTree } from "../lib/scope";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

type DashboardData = {
  tasks: Task[];
  metrics: Metric[];
  phases: Phase[];
  checkIns: MetricCheckInWithRatings[];
  phaseCheckIns: PhaseCheckIn[];
  brainDumps: BrainDump[];
  allBrainDumps: BrainDump[];
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
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [checkIns, setCheckIns] = useState<MetricCheckInWithRatings[]>([]);
  const [phaseCheckIns, setPhaseCheckIns] = useState<PhaseCheckIn[]>([]);
  const [brainDumps, setBrainDumps] = useState<BrainDump[]>([]);
  const [allBrainDumps, setAllBrainDumps] = useState<BrainDump[]>([]);
  const [latestPhase, setLatestPhase] = useState<PhaseCheckIn | null>(null);
  const [checkInSchedule, setCheckInSchedule] =
    useState<CheckInSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - THIRTY_DAYS_SECONDS;
      const to = now + 1;
      const [t, m, p, ci, pci, bd, allBd, lp, schedule] = await Promise.all([
        listTasks(),
        listMetrics(true),
        listPhases(true),
        listMetricCheckIns(from, to),
        listPhaseCheckIns(from, to),
        listBrainDumps(from, to),
        listBrainDumps(0, to),
        latestPhaseCheckIn(),
        getCheckInSchedule(),
      ]);
      setTasks(t);
      setMetrics(m);
      setPhases(p);
      setCheckIns(ci);
      setPhaseCheckIns(pci);
      setBrainDumps(bd);
      setAllBrainDumps(allBd);
      setLatestPhase(lp);
      setCheckInSchedule(schedule);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoaded(true);
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

  // The native timer advances the schedule when a popup fires without
  // emitting a dashboard event, so refresh this value independently.
  useEffect(() => {
    const interval = window.setInterval(() => {
      void getCheckInSchedule()
        .then(setCheckInSchedule)
        .catch((e) => setError(String(e)));
    }, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  // Refresh when a check-in is submitted from the popup.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("check-in-submitted", () => {
      reload();
    }).then((u) => {
      unlisten = u;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, [reload]);

  const scopeTree = useMemo(() => buildScopeTree(tasks), [tasks]);

  const value = useMemo<DashboardData>(
    () => ({
      tasks,
      metrics,
      phases,
      checkIns,
      phaseCheckIns,
      brainDumps,
      allBrainDumps,
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
      metrics,
      phases,
      checkIns,
      phaseCheckIns,
      brainDumps,
      allBrainDumps,
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
