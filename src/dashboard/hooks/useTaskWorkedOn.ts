import { useCallback, useEffect, useMemo, useState } from "react";
import { listTaskWorkStretches } from "../../lib/commands";
import type { TaskWorkStretch } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import { resolveTaskDateFilter, type TaskDateFilter } from "../lib/taskDateFilter";
import { taskWorkedSecondsInRange } from "../lib/taskWorkedOn";

// Finite SQL bounds cover all supported calendar dates and open stretches.
export const UNBOUNDED_HISTORY_SECONDS = 99_999_999_999;

type FetchedRange = { from: number; to: number };
type RangeHistory = FetchedRange & { stretches: TaskWorkStretch[] };

const sameRange = (fetched: FetchedRange | null, from: number, to: number) =>
  fetched !== null && fetched.from === from && fetched.to === to;

export function useTaskWorkedOn(filter: TaskDateFilter, nowMs: number, enabled: boolean) {
  const { tasks, taskWorkStretches, setError } = useDashboardData();
  const range = enabled ? resolveTaskDateFilter(filter, nowMs) : null;
  const from = range?.fromSec ?? -UNBOUNDED_HISTORY_SECONDS;
  const to = range?.toSec ?? UNBOUNDED_HISTORY_SECONDS;
  const active = range !== null;
  const [history, setHistory] = useState<RangeHistory | null>(null);
  const [failedRange, setFailedRange] = useState<FetchedRange | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Every dashboard reload replaces these arrays, so refetch on recorded work
  // itself. Editing a stretch touches its Task, which catches stretches older
  // than the dashboard's recent window.
  const recordedWorkKey = useMemo(
    () => [
      ...taskWorkStretches.map(stretch => `${stretch.id}:${stretch.startedAt}:${stretch.endedAt}`),
      ...tasks.map(task => `${task.id}=${task.updatedAt}`),
    ].join(","),
    [tasks, taskWorkStretches],
  );

  useEffect(() => {
    if (!active) return;
    let requestCurrent = true;
    listTaskWorkStretches(from, to).then(
      stretches => {
        if (!requestCurrent) return;
        setHistory({ from, to, stretches });
        setFailedRange(null);
      },
      error => {
        if (!requestCurrent) return;
        setFailedRange({ from, to });
        setError(String(error));
      },
    );
    return () => { requestCurrent = false; };
  }, [active, from, to, recordedWorkKey, retryCount, setError]);

  // Totals fetched for this range stay on screen while a refresh is in flight,
  // so a dashboard reload cannot empty the table.
  const rangeHistory = active && sameRange(history, from, to) ? history : null;
  const failed = active && rangeHistory === null && sameRange(failedRange, from, to);

  const { closedTotals, openStretches } = useMemo(() => {
    const stretches = rangeHistory?.stretches ?? [];
    return {
      // A closed stretch has already ended, so its clipped total holds for any clock.
      closedTotals: taskWorkedSecondsInRange(
        stretches.filter(stretch => stretch.endedAt !== null),
        { fromSec: from, toSec: to },
        Number.POSITIVE_INFINITY,
      ),
      openStretches: stretches.filter(stretch => stretch.endedAt === null),
    };
  }, [rangeHistory, from, to]);

  const workedSecondsByTask = useMemo<ReadonlyMap<number, number>>(() => {
    if (openStretches.length === 0) return closedTotals;
    const totals = new Map(closedTotals);
    for (const [taskId, seconds] of taskWorkedSecondsInRange(openStretches, { fromSec: from, toSec: to }, nowMs)) {
      totals.set(taskId, (totals.get(taskId) ?? 0) + seconds);
    }
    return totals;
  }, [closedTotals, openStretches, from, to, nowMs]);

  // Which Tasks have work in range changes far less often than a live total,
  // so this set keeps its identity across clock ticks for the row filters.
  const workedTaskIdsKey = [...workedSecondsByTask.keys()].join(",");
  const workedTaskIds = useMemo<ReadonlySet<number>>(
    () => new Set(workedSecondsByTask.keys()),
    [workedTaskIdsKey],
  );

  const retry = useCallback(() => {
    setFailedRange(null);
    setRetryCount(count => count + 1);
  }, []);

  return {
    workedSecondsByTask: active ? workedSecondsByTask : null,
    workedTaskIds: active ? workedTaskIds : null,
    loading: active && rangeHistory === null && !failed,
    failed,
    retry,
  };
}
