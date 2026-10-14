import { useCallback, useEffect, useMemo, useState } from "react";
import { listTaskStatusEvents } from "../../lib/commands";
import { useDashboardData } from "../context/DashboardDataContext";
import { resolveTaskDateFilter, type TaskDateFilter } from "../lib/taskDateFilter";
import { statusChangedTaskIds } from "../lib/taskStatusChanged";
import { UNBOUNDED_HISTORY_SECONDS } from "./useTaskWorkedOn";

const EMPTY_TASK_IDS: ReadonlySet<number> = new Set();

export function useTaskStatusChanged(filter: TaskDateFilter, nowMs: number, enabled: boolean) {
  const { tasks, setError } = useDashboardData();
  const range = enabled ? resolveTaskDateFilter(filter, nowMs) : null;
  const from = range?.fromSec ?? -UNBOUNDED_HISTORY_SECONDS;
  const to = range?.toSec ?? UNBOUNDED_HISTORY_SECONDS;
  const key = range === null ? null : `${from}:${to}`;
  // A status change bumps the Task's history revision, so refetch on that.
  const revision = useMemo(() => tasks.map(task => `${task.id}:${task.historyRevision}`).join(","), [tasks]);
  const [history, setHistory] = useState<{ key: string; ids: ReadonlySet<number> } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  useEffect(() => {
    if (key === null) return;
    let current = true;
    listTaskStatusEvents(from, to).then(events => {
      if (!current) return;
      setHistory({ key, ids: statusChangedTaskIds(events, from, to) });
      setFailedKey(null);
    }, error => {
      if (!current) return;
      setFailedKey(key);
      setError(String(error));
    });
    return () => { current = false; };
  }, [key, from, to, revision, retryCount, setError]);
  const ready = key !== null && history?.key === key;
  const failed = key !== null && !ready && failedKey === key;
  const retry = useCallback(() => {
    setFailedKey(null);
    setRetryCount(count => count + 1);
  }, []);
  return { taskIds: key === null ? null : ready ? history.ids : EMPTY_TASK_IDS, loading: key !== null && !ready && !failed, failed, retry };
}
