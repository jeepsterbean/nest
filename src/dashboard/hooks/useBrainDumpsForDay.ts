import { listBrainDumps } from "../../lib/commands";
import { useDashboardData } from "../context/DashboardDataContext";
import { useDayRecords } from "./useDayRecords";

export function useBrainDumpsForDay(dayMs: number, nowMs: number) {
  const { brainDumps } = useDashboardData();
  const { records, loaded } = useDayRecords(dayMs, nowMs, brainDumps, listBrainDumps);
  return { dumps: records, loaded };
}
