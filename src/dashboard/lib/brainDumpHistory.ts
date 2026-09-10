import type { BrainDump } from "../../lib/types";

export function filterBrainDumpHistory(
  dumps: BrainDump[], days: number, tagId: string, nowMs: number,
) {
  const from = nowMs / 1000 - days * 86400;
  return dumps
    .filter((dump) => dump.createdAt >= from && dump.createdAt <= nowMs / 1000
      && (!tagId || dump.tags.some((tag) => String(tag.id) === tagId)))
    .sort((a, b) => b.createdAt - a.createdAt);
}
