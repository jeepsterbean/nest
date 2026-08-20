import { describe, expect, it } from "vitest";
import {
  applyStretchDrag,
  layoutWorkBlocks,
  placeOnWindow,
  placeStretchEditor,
  stretchEditorSide,
  timeOnColumn,
  workTotalsInSpan,
  workedSecondsInSpan,
  workedSecondsToday,
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
    expect(block).toMatchObject({
      from: 1500,
      to: 1800,
      startedAt: 1500,
      endedAt: null,
      startPct: 50,
      sizePct: 30,
    });
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

describe("workTotalsInSpan", () => {
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
    expect(workTotalsInSpan(blocks, FROM, TO).map((row) => [row.task.id, row.seconds])).toEqual([
      [2, 400],
      [1, 200],
    ]);
  });

  it("clips an overnight stretch onto each calendar day", () => {
    const blocks = layoutWorkBlocks(
      [stretch(1, 1, 1000, 1800)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(workTotalsInSpan(blocks, 1000, 1400).map((row) => row.seconds)).toEqual([
      400,
    ]);
    expect(workTotalsInSpan(blocks, 1400, 2000).map((row) => row.seconds)).toEqual([
      400,
    ]);
  });
});

describe("workedSecondsInSpan", () => {
  it("clips overnight work to local midnight and counts an open stretch to now", () => {
    expect(
      workedSecondsInSpan(
        [stretch(1, 1, 800, 1200), stretch(2, 2, 1500, null)],
        FROM,
        TO,
        NOW_MS,
      ),
    ).toBe(200 + 300);
  });

  it("adds concurrent stretches instead of taking the wall-clock union", () => {
    expect(
      workedSecondsInSpan(
        [stretch(1, 1, 1000, 1300), stretch(2, 2, 1100, 1400)],
        FROM,
        TO,
        NOW_MS,
      ),
    ).toBe(600);
  });

  it("can restrict today's total to one Task", () => {
    const nowMs = new Date(2026, 5, 17, 12, 0, 0).getTime();
    const midnight = Math.floor(new Date(2026, 5, 17).getTime() / 1000);
    const stretches = [
      stretch(1, 1, midnight + 100, midnight + 300),
      stretch(2, 2, midnight + 200, midnight + 500),
    ];
    expect(workedSecondsToday(stretches, nowMs, 1)).toBe(200);
    expect(workedSecondsToday(stretches, nowMs)).toBe(500);
  });
});

describe("applyStretchDrag", () => {
  const at = (hours: number, minutes: number, seconds = 0) =>
    Math.floor(new Date(2026, 5, 17, hours, minutes, seconds).getTime() / 1000);
  const now = at(18, 0);
  const hour = 3600;

  it("moves a closed stretch, snapping start and keeping duration", () => {
    const origin = { startedAt: at(10, 7), endedAt: at(11, 7) };
    expect(applyStretchDrag("move", origin, at(14, 20), 13 * 60, now)).toEqual({
      startedAt: at(14, 0),
      endedAt: at(15, 0),
    });
  });

  it("resizes the start and end onto quarter hours", () => {
    const origin = { startedAt: at(10, 0), endedAt: at(12, 0) };
    expect(applyStretchDrag("start", origin, at(10, 22), 0, now)).toEqual({
      startedAt: at(10, 15),
      endedAt: at(12, 0),
    });
    expect(applyStretchDrag("end", origin, at(11, 8), 0, now)).toEqual({
      startedAt: at(10, 0),
      endedAt: at(11, 15),
    });
  });

  it("will not shrink a closed stretch below fifteen minutes", () => {
    const origin = { startedAt: at(10, 0), endedAt: at(12, 0) };
    expect(applyStretchDrag("end", origin, at(10, 5), 0, now)).toEqual({
      startedAt: at(10, 0),
      endedAt: at(10, 15),
    });
    expect(applyStretchDrag("start", origin, at(11, 50), 0, now)).toEqual({
      startedAt: at(11, 45),
      endedAt: at(12, 0),
    });
  });

  it("lets a calendar resize end at now even if that is under fifteen minutes", () => {
    const origin = { startedAt: at(17, 50), endedAt: at(18, 0) };
    const justNow = at(17, 58);
    expect(applyStretchDrag("end", origin, at(17, 52), 0, justNow)).toEqual({
      startedAt: at(17, 50),
      endedAt: at(17, 58),
    });
  });

  it("keeps an open stretch open and only moves its start", () => {
    const origin = { startedAt: at(10, 0), endedAt: null };
    expect(applyStretchDrag("move", origin, at(12, 0), hour, now)).toEqual({
      startedAt: at(11, 0),
      endedAt: null,
    });
    expect(applyStretchDrag("end", origin, at(13, 0), 0, now)).toEqual(origin);
  });

  it("will not place a stretch in the future", () => {
    const origin = { startedAt: at(10, 0), endedAt: at(11, 0) };
    expect(applyStretchDrag("move", origin, at(18, 30), 0, now)).toEqual({
      startedAt: at(17, 0),
      endedAt: at(18, 0),
    });
    expect(applyStretchDrag("end", origin, at(19, 0), 0, now)).toEqual({
      startedAt: at(10, 0),
      endedAt: at(18, 0),
    });
  });

  it("maps a pointer onto the column clock", () => {
    expect(timeOnColumn(1000, 2000, 0.25)).toBe(1250);
    expect(timeOnColumn(1000, 2000, -1)).toBe(1000);
    expect(timeOnColumn(1000, 2000, 2)).toBe(2000);
  });
});

describe("stretch editor placement", () => {
  const viewport = { width: 800, height: 600 };
  const size = { width: 220, height: 180 };

  it("prefers the outer edge of a concurrent pair", () => {
    expect(stretchEditorSide(0, 2)).toBe("left");
    expect(stretchEditorSide(1, 2)).toBe("right");
    expect(stretchEditorSide(0, 1)).toBeNull();
  });

  it("opens to the right of a card that sits near the left", () => {
    const box = placeStretchEditor(
      { top: 100, left: 40, right: 120 },
      viewport,
      null,
      size,
    );
    expect(box.side).toBe("right");
    expect(box.left).toBe(128);
    expect(box.top).toBe(100);
  });

  it("opens to the left when the right side would leave the window", () => {
    const box = placeStretchEditor(
      { top: 100, left: 680, right: 780 },
      viewport,
      null,
      size,
    );
    expect(box.side).toBe("left");
    expect(box.left).toBe(452);
  });

  it("flips off a left preference when that side would clip", () => {
    const box = placeStretchEditor(
      { top: 100, left: 20, right: 90 },
      viewport,
      "left",
      size,
    );
    expect(box.side).toBe("right");
    expect(box.left).toBe(98);
  });

  it("honours a left preference when both sides fit", () => {
    const box = placeStretchEditor(
      { top: 100, left: 300, right: 400 },
      viewport,
      "left",
      size,
    );
    expect(box.side).toBe("left");
    expect(box.left).toBe(72);
  });

  it("clamps vertically so the editor stays on screen", () => {
    const box = placeStretchEditor(
      { top: 500, left: 40, right: 120 },
      viewport,
      null,
      size,
    );
    expect(box.top).toBe(412);
  });

  it("clamps onto the card when neither side has room", () => {
    const box = placeStretchEditor(
      { top: 80, left: 10, right: 790 },
      viewport,
      null,
      size,
    );
    expect(box.side).toBe("right");
    expect(box.left).toBe(572);
    expect(box.left + box.width).toBeLessThanOrEqual(792);
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
