import { describe, expect, it } from "vitest";
import {
  layoutWorkBlocks,
  placeOnWindow,
  workTotals,
} from "../../../src/dashboard/lib/workTimeline";
import { phaseSessions } from "../../../src/dashboard/lib/timeline";
import type { Task, TaskWorkStretch } from "../../../src/lib/types";

const task = (id: number, title = `Task ${id}`): Task => ({
  id,
  title,
  description: "",
  status: "active",
  workingNow: false,
  workedSeconds: 0,
  workStartedAt: null,
  scope: null,
  value: null,
  effort: null,
  parentTaskId: null,
  createdAt: 0,
  updatedAt: 0,
});

const stretch = (
  id: number,
  taskId: number,
  startedAt: number,
  endedAt: number | null,
): TaskWorkStretch => ({ id, taskId, startedAt, endedAt });

// 1000 -> 2000 keeps the arithmetic readable: 10 seconds is 1%.
const FROM = 1000;
const TO = 2000;
const NOW_MS = 1_800_000;

describe("layoutWorkBlocks", () => {
  it("clips a stretch that starts before the window", () => {
    const [block] = layoutWorkBlocks(
      [stretch(1, 1, 500, 1200)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(block).toMatchObject({ id: 1, from: 1000, to: 1200, startPct: 0, sizePct: 20 });
  });

  it("clips a stretch that runs past the window", () => {
    const [block] = layoutWorkBlocks(
      [stretch(1, 1, 1900, 3000)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(block).toMatchObject({ from: 1900, to: 2000, sizePct: 10 });
  });

  it("runs an open stretch up to now", () => {
    const [block] = layoutWorkBlocks(
      [stretch(1, 1, 1500, null)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(block).toMatchObject({ from: 1500, to: 1800, startPct: 50, sizePct: 30 });
  });

  it("drops work outside the window", () => {
    expect(
      layoutWorkBlocks([stretch(1, 1, 100, 200)], [task(1)], FROM, TO, NOW_MS),
    ).toEqual([]);
  });

  it("spans the whole column when the stretch covers the window", () => {
    const [block] = layoutWorkBlocks(
      [stretch(1, 1, FROM, TO)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(block).toMatchObject({ startPct: 0, sizePct: 100 });
  });

  it("returns nothing for an empty window", () => {
    expect(
      layoutWorkBlocks([stretch(1, 1, 1000, 1100)], [task(1)], TO, FROM, NOW_MS),
    ).toEqual([]);
  });

  it("keeps one column when nothing overlaps", () => {
    const blocks = layoutWorkBlocks(
      [stretch(1, 1, 1000, 1200), stretch(2, 2, 1200, 1400)],
      [task(1), task(2)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(blocks.map((block) => [block.col, block.cols])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it("splits concurrent Working now side by side", () => {
    const blocks = layoutWorkBlocks(
      [stretch(1, 1, 1000, 1400), stretch(2, 2, 1100, 1300)],
      [task(1), task(2)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(blocks.map((block) => [block.id, block.col, block.cols])).toEqual([
      [1, 0, 2],
      [2, 1, 2],
    ]);
  });

  it("widens a whole cluster to its busiest moment", () => {
    const blocks = layoutWorkBlocks(
      [
        stretch(1, 1, 1000, 1600),
        stretch(2, 2, 1100, 1300),
        stretch(3, 3, 1200, 1400),
      ],
      [task(1), task(2), task(3)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(blocks.map((block) => [block.id, block.col, block.cols])).toEqual([
      [1, 0, 3],
      [2, 1, 3],
      [3, 2, 3],
    ]);
  });

  it("reuses a column once the stretch holding it has ended", () => {
    const blocks = layoutWorkBlocks(
      [
        stretch(1, 1, 1000, 1600),
        stretch(2, 2, 1100, 1200),
        stretch(3, 3, 1300, 1400),
      ],
      [task(1), task(2), task(3)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(blocks.map((block) => [block.id, block.col, block.cols])).toEqual([
      [1, 0, 2],
      [2, 1, 2],
      [3, 1, 2],
    ]);
  });

  it("starts a fresh cluster after a gap", () => {
    const blocks = layoutWorkBlocks(
      [
        stretch(1, 1, 1000, 1200),
        stretch(2, 2, 1000, 1200),
        stretch(3, 3, 1500, 1600),
      ],
      [task(1), task(2), task(3)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(blocks.map((block) => block.cols)).toEqual([2, 2, 1]);
  });
});

describe("workTotals", () => {
  it("sums a task's blocks, busiest first", () => {
    const blocks = layoutWorkBlocks(
      [
        stretch(1, 1, 1000, 1100),
        stretch(2, 2, 1000, 1400),
        stretch(3, 1, 1500, 1600),
      ],
      [task(1), task(2)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(workTotals(blocks).map((row) => [row.task.id, row.seconds])).toEqual([
      [2, 400],
      [1, 200],
    ]);
  });
});

describe("alignment with the Phase ribbon", () => {
  it("places a Phase session and a work stretch with the same bounds identically", () => {
    const [session] = phaseSessions(
      [
        { id: 1, createdAt: 1200, phaseId: 1, phaseLabel: null },
        { id: 2, createdAt: 1600, phaseId: 2, phaseLabel: null },
      ],
      FROM,
      TO,
    ).filter((candidate) => candidate.phaseId === 1);
    const [block] = layoutWorkBlocks(
      [stretch(1, 1, session.from, session.to)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );

    const phasePlacement = placeOnWindow(session.from, session.to, FROM, TO);
    expect(block.startPct).toBe(phasePlacement.startPct);
    expect(block.sizePct).toBe(phasePlacement.sizePct);
  });
});
