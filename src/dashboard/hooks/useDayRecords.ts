import { useEffect, useState } from "react";
import { HISTORY_WINDOW_DAYS, useDashboardData } from "../context/DashboardDataContext";
import { historyStartSec, shiftDayMs } from "../lib/time";

/** Records for paging by day. Days inside the dashboard's history window
 * reuse the shared load; older days are fetched one day at a time, so the
 * whole archive stays reachable without loading it all up front. */
export function useDayRecords<T>(
  dayMs: number,
  nowMs: number,
  shared: T[],
  listRange: (from: number, to: number) => Promise<T[]>,
) {
  const { loaded, setError } = useDashboardData();
  const fromSec = dayMs / 1000;
  const insideWindow = fromSec >= historyStartSec(nowMs, HISTORY_WINDOW_DAYS);
  const [olderDay, setOlderDay] = useState<{ dayMs: number; records: T[] } | null>(null);

  // `shared` changes on every dashboard reload, which is how edits and
  // data-changed events reach an older day without a separate listener.
  useEffect(() => {
    if (insideWindow) return;
    let cancelled = false;
    listRange(fromSec, shiftDayMs(dayMs, 1) / 1000).then(
      (records) => { if (!cancelled) setOlderDay({ dayMs, records }); },
      (error) => { if (!cancelled) setError(String(error)); },
    );
    return () => { cancelled = true; };
  }, [dayMs, fromSec, insideWindow, shared, listRange, setError]);

  if (insideWindow) return { records: shared, loaded };
  return olderDay?.dayMs === dayMs
    ? { records: olderDay.records, loaded: true }
    : { records: [] as T[], loaded: false };
}
