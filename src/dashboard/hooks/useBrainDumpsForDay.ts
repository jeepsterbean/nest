import { useEffect, useState } from "react";
import { listBrainDumps } from "../../lib/commands";
import type { BrainDump } from "../../lib/types";
import { HISTORY_WINDOW_DAYS, useDashboardData } from "../context/DashboardDataContext";
import { historyStartSec, shiftDayMs } from "../lib/time";

/** Brain dumps for paging by day. Days inside the dashboard's history window
 * reuse the shared load; older days are fetched one day at a time, so the
 * whole archive stays reachable without loading it all up front. */
export function useBrainDumpsForDay(dayMs: number, nowMs: number) {
  const { brainDumps, loaded, setError } = useDashboardData();
  const fromSec = dayMs / 1000;
  const insideWindow = fromSec >= historyStartSec(nowMs, HISTORY_WINDOW_DAYS);
  const [olderDay, setOlderDay] = useState<{ dayMs: number; dumps: BrainDump[] } | null>(null);

  // `brainDumps` changes on every dashboard reload, which is how tag edits
  // and data-changed events reach an older day without a separate listener.
  useEffect(() => {
    if (insideWindow) return;
    let cancelled = false;
    listBrainDumps(fromSec, shiftDayMs(dayMs, 1) / 1000).then(
      (dumps) => { if (!cancelled) setOlderDay({ dayMs, dumps }); },
      (error) => { if (!cancelled) setError(String(error)); },
    );
    return () => { cancelled = true; };
  }, [dayMs, fromSec, insideWindow, brainDumps, setError]);

  if (insideWindow) return { dumps: brainDumps, loaded };
  return olderDay?.dayMs === dayMs
    ? { dumps: olderDay.dumps, loaded: true }
    : { dumps: [], loaded: false };
}
