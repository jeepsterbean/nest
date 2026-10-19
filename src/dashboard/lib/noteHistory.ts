import type { Note } from "../../lib/types";
import { shiftDayMs, startOfDayMs } from "./time";

export function filterNoteHistory(
  notes: Note[], dayMs: number, tagId: string,
) {
  const from = startOfDayMs(dayMs / 1000) / 1000;
  const until = shiftDayMs(from * 1000, 1) / 1000;
  return notes
    .filter((note) => note.createdAt >= from && note.createdAt < until
      && (!tagId || note.tags.some((tag) => String(tag.id) === tagId)))
    .sort((a, b) => b.createdAt - a.createdAt);
}
