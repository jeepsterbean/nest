import { describe, expect, it } from "vitest";
import {
  buildWorkLanes,
  placeOnWindow,
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

describe("buildWorkLanes", () => {
  it("clips a stretch that starts before the window", () => {
    const [lane] = buildWorkLanes(
      [stretch(1, 1, 500, 1200)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(lane.blocks).toEqual([
      { id: 1, from: 1000, to: 1200, leftPct: 0, widthPct: 20 },
    ]);
    expect(lane.seconds).toBe(200);
  });

  it("clips a stretch that runs past the window", () => {
    const [lane] = buildWorkLanes(
      [stretch(1, 1, 1900, 3000)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(lane.blocks[0]).toMatchObject({ from: 1900, to: 2000, widthPct: 10 });
  });

  it("runs an open stretch up to now", () => {
    const [lane] = buildWorkLanes(
      [stretch(1, 1, 1500, null)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(lane.blocks[0]).toMatchObject({
      from: 1500,
      to: 1800,
      leftPct: 50,
      widthPct: 30,
    });
  });

  it("drops tasks with no work inside the window", () => {
    expect(
      buildWorkLanes(
        [stretch(1, 1, 100, 200)],
        [task(1)],
        FROM,
        TO,
        NOW_MS,
      ),
    ).toEqual([]);
  });

  it("gives each task a lane, busiest first", () => {
    const lanes = buildWorkLanes(
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
    expect(lanes.map((lane) => [lane.task.id, lane.seconds])).toEqual([
      [2, 400],
      [1, 200],
    ]);
    expect(lanes[1].blocks.map((block) => block.id)).toEqual([1, 3]);
  });

  it("spans the whole track when the stretch covers the window", () => {
    const [lane] = buildWorkLanes(
      [stretch(1, 1, FROM, TO)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );
    expect(lane.blocks[0]).toMatchObject({ leftPct: 0, widthPct: 100 });
  });

  it("returns nothing for an empty window", () => {
    expect(
      buildWorkLanes([stretch(1, 1, 1000, 1100)], [task(1)], TO, FROM, NOW_MS),
    ).toEqual([]);
  });
});

describe("alignment with the Phase strip", () => {
  it("places a Phase session and a work stretch with the same bounds identically", () => {
    const [session] = phaseSessions(
      [
        { id: 1, createdAt: 1200, phaseId: 1, phaseLabel: null },
        { id: 2, createdAt: 1600, phaseId: 2, phaseLabel: null },
      ],
      FROM,
      TO,
    ).filter((candidate) => candidate.phaseId === 1);
    const [lane] = buildWorkLanes(
      [stretch(1, 1, session.from, session.to)],
      [task(1)],
      FROM,
      TO,
      NOW_MS,
    );

    const phasePlacement = placeOnWindow(session.from, session.to, FROM, TO);
    expect(lane.blocks[0].leftPct).toBe(phasePlacement.leftPct);
    expect(lane.blocks[0].widthPct).toBe(phasePlacement.widthPct);
  });
});
