import type { BrainDump } from "../../lib/types";
import { shiftDayMs, startOfDayMs } from "./time";

export function filterBrainDumpHistory(
  dumps: BrainDump[], dayMs: number, tagId: string,
) {
  const from = startOfDayMs(dayMs / 1000) / 1000;
  const until = shiftDayMs(from * 1000, 1) / 1000;
  return dumps
    .filter((dump) => dump.createdAt >= from && dump.createdAt < until
      && (!tagId || dump.tags.some((tag) => String(tag.id) === tagId)))
    .sort((a, b) => b.createdAt - a.createdAt);
}
