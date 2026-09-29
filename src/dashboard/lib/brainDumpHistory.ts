import type { BrainDump } from "../../lib/types";
import { dayLabel, startOfDayMs } from "./time";

export function filterBrainDumpHistory(
  dumps: BrainDump[], days: number, tagId: string, nowMs: number,
) {
  const from = nowMs / 1000 - days * 86400;
  return dumps
    .filter((dump) => dump.createdAt >= from && dump.createdAt <= nowMs / 1000
      && (!tagId || dump.tags.some((tag) => String(tag.id) === tagId)))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export type BrainDumpDay = { dayMs: number; label: string; dumps: BrainDump[] };

/** Groups newest-first dumps under local-day labels, keeping their order. */
export function groupBrainDumpsByDay(dumps: BrainDump[], nowMs: number): BrainDumpDay[] {
  const days: BrainDumpDay[] = [];
  for (const dump of dumps) {
    const dayMs = startOfDayMs(dump.createdAt);
    const current = days[days.length - 1];
    if (current?.dayMs === dayMs) current.dumps.push(dump);
    else days.push({ dayMs, label: dayLabel(dump.createdAt, nowMs), dumps: [dump] });
  }
  return days;
}
