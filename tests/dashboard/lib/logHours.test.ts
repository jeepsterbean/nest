import { describe, expect, it } from "vitest";
import { logHours } from "../../../src/dashboard/lib/logHours";
import { buildRawLog } from "../../../src/dashboard/lib/timeline";
import type {
  MetricCheckInWithRatings,
  PhaseCheckIn,
  TaskStatusEvent,
} from "../../../src/lib/types";

const DAY_FROM = 1_000_000;
const DAY_TO = DAY_FROM + 24 * 3600;
const at = (hour: number, minute = 0) => DAY_FROM + hour * 3600 + minute * 60;

const checkIn: MetricCheckInWithRatings = {
  id: 1,
  createdAt: at(9, 5),
  pulseId: 1,
  pulseName: "Daily pulse",
  ratings: [],
};
const dump = { id: 1, createdAt: at(9, 40), text: "note", tags: [] };
const phase: PhaseCheckIn = { id: 1, createdAt: at(9, 1), phaseId: 1, phaseLabel: null };
const statusEvent: TaskStatusEvent = {
  id: 1,
  taskId: 7,
  fromStatus: "up_next",
  toStatus: "active",
  createdAt: at(9, 10),
};
const stretches = [
  { id: 1, taskId: 7, startedAt: at(9, 12), endedAt: at(9, 50) },
  { id: 2, taskId: 8, startedAt: at(9, 30), endedAt: at(11, 15) },
];

const hours = () =>
  logHours(
    buildRawLog([checkIn], [phase], [dump], stretches, [statusEvent]),
    DAY_FROM,
    DAY_TO,
  );

describe("logHours", () => {
  it("keeps only hours with marks, oldest first", () => {
    expect(hours().map((hour) => [hour.from, hour.to])).toEqual([
      [at(9), at(10)],
      [at(11), at(12)],
    ]);
  });

  it("orders marks by time and gives each changed Task one mark per hour", () => {
    const [nine] = hours();
    expect(nine.marks.map((mark) => mark.key)).toEqual([
      "metrics-1",
      `task-7-${at(9)}`,
      `task-8-${at(9)}`,
      "dump-1",
    ]);
    const task7 = nine.marks[1];
    expect(task7.kind === "task" && task7.changes.map((change) => change.kind)).toEqual([
      "task-status",
      "work-start",
      "work-stop",
    ]);
  });

  it("leaves Phases to the wash and events outside the day out", () => {
    const outside = { ...dump, id: 2, createdAt: DAY_TO };
    const result = logHours(
      buildRawLog([], [phase], [outside], []),
      DAY_FROM,
      DAY_TO,
    );
    expect(result).toEqual([]);
  });
});
