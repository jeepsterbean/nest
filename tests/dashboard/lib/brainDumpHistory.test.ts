import { expect, it } from "vitest";
import type { BrainDump } from "../../../src/lib/types";
import { filterBrainDumpHistory } from "../../../src/dashboard/lib/brainDumpHistory";

it("filters a local calendar day with an exclusive next-day boundary and tags", () => {
  const dayMs = new Date(2026, 8, 29).getTime();
  const at = (id: number, seconds: number, tagged = true): BrainDump => ({
    id, createdAt: dayMs / 1000 + seconds, text: "A thought",
    tags: tagged ? [{ id: 4, name: "Personal" }] : [],
  });
  const dumps = [at(1, -1), at(2, 0), at(3, 3600), at(4, 86399, false), at(5, 86400)];
  expect(filterBrainDumpHistory(dumps, dayMs, "").map((dump) => dump.id)).toEqual([4, 3, 2]);
  expect(filterBrainDumpHistory(dumps, dayMs, "4").map((dump) => dump.id)).toEqual([3, 2]);
  expect(filterBrainDumpHistory(dumps, dayMs, "99")).toEqual([]);
  expect(dumps.map((dump) => dump.id)).toEqual([1, 2, 3, 4, 5]);
});
