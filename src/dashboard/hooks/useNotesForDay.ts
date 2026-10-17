import { listNotes } from "../../lib/commands";
import { useDashboardData } from "../context/DashboardDataContext";
import { useDayRecords } from "./useDayRecords";

export function useNotesForDay(dayMs: number, nowMs: number) {
  const { notes } = useDashboardData();
  const { records, loaded } = useDayRecords(dayMs, nowMs, notes, listNotes);
  return { notes: records, loaded };
}
