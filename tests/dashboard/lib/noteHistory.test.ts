import { expect, it } from "vitest";
import type { Note } from "../../../src/lib/types";
import { filterNoteHistory } from "../../../src/dashboard/lib/noteHistory";

it("filters a local calendar day with an exclusive next-day boundary and tags", () => {
  const dayMs = new Date(2026, 8, 29).getTime();
  const at = (id: number, seconds: number, tagged = true): Note => ({
    id, createdAt: dayMs / 1000 + seconds, text: "A thought",
    tags: tagged ? [{ id: 4, name: "Personal" }] : [],
  });
  const notes = [at(1, -1), at(2, 0), at(3, 3600), at(4, 86399, false), at(5, 86400)];
  expect(filterNoteHistory(notes, dayMs, "").map((note) => note.id)).toEqual([4, 3, 2]);
  expect(filterNoteHistory(notes, dayMs, "4").map((note) => note.id)).toEqual([3, 2]);
  expect(filterNoteHistory(notes, dayMs, "99")).toEqual([]);
  expect(notes.map((note) => note.id)).toEqual([1, 2, 3, 4, 5]);
});
