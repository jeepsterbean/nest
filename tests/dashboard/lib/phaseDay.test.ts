import { describe, expect, it } from "vitest";
import {
  buildPhaseDay,
  readPhaseView,
  writePhaseView,
} from "../../../src/dashboard/lib/phaseDay";
import type { Phase, PhaseCheckIn } from "../../../src/lib/types";

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const phases: Phase[] = ["Doing", "Scoping", "Resting", "Offline"].map(
  (name, index) => ({
    id: index + 1,
    name,
    icon: "circle",
    color: null,
    createdAt: 0,
    inactiveSince: null,
  }),
);

const checkpoint = (
  id: number,
  createdAt: number,
  phaseId: number | null,
): PhaseCheckIn => ({ id, createdAt, phaseId, phaseLabel: null });

const phaseRow = (rows: ReturnType<typeof buildPhaseDay>, name: string) =>
  rows.find((row) => row.name === name)!;

describe("buildPhaseDay", () => {
  it("gives every live Phase a row, with overnight Offline at full width", () => {
    const rows = buildPhaseDay(
      [
        checkpoint(1, -HOUR, 4),
        checkpoint(2, 7 * HOUR, 1),
        checkpoint(3, 9 * HOUR, 3),
        checkpoint(4, 10 * HOUR, 1),
      ],
      phases,
      0,
      DAY,
      2 * DAY,
    );

    expect(rows.map((row) => row.name)).toEqual([
      "Doing",
      "Scoping",
      "Resting",
      "Offline",
    ]);
    expect(phaseRow(rows, "Offline").sessions).toEqual([
      { from: 0, to: 7 * HOUR, startOffset: 0, endOffset: 7 / 24 },
    ]);
    expect(phaseRow(rows, "Doing").sessions.map((s) => [s.from, s.to])).toEqual([
      [7 * HOUR, 9 * HOUR],
      [10 * HOUR, DAY],
    ]);
    expect(phaseRow(rows, "Doing").seconds).toBe(16 * HOUR);
    expect(phaseRow(rows, "Scoping")).toMatchObject({ seconds: 0, sessions: [] });
  });

  it("stops today's sessions at now", () => {
    const rows = buildPhaseDay(
      [checkpoint(1, 8 * HOUR, 1)],
      phases,
      0,
      DAY,
      12 * HOUR,
    );

    expect(phaseRow(rows, "Doing").sessions).toEqual([
      { from: 8 * HOUR, to: 12 * HOUR, startOffset: 8 / 24, endOffset: 0.5 },
    ]);
  });

  it("counts a checkpoint with no Phase as Offline", () => {
    const rows = buildPhaseDay(
      [checkpoint(1, 0, 1), checkpoint(2, 6 * HOUR, null)],
      phases,
      0,
      DAY,
      2 * DAY,
    );

    expect(phaseRow(rows, "Offline").seconds).toBe(18 * HOUR);
  });

  it("drops a burst that settles back on the Phase before it", () => {
    const rows = buildPhaseDay(
      [
        checkpoint(1, 0, 1),
        checkpoint(2, 5 * HOUR, 2),
        checkpoint(3, 5 * HOUR + 20, 1),
      ],
      phases,
      0,
      DAY,
      2 * DAY,
    );

    expect(phaseRow(rows, "Scoping").sessions).toEqual([]);
    expect(phaseRow(rows, "Doing").seconds).toBe(DAY);
  });
});

describe("Phase view preference", () => {
  const memoryStorage = () => {
    const values = new Map<string, string>();
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
  };

  it("defaults to Day and remembers Guide", () => {
    const storage = memoryStorage();
    expect(readPhaseView(storage)).toBe("day");
    writePhaseView("guide", storage);
    expect(readPhaseView(storage)).toBe("guide");
  });

  it("falls back to Day on an unknown stored value", () => {
    const storage = memoryStorage();
    storage.setItem("nest:phase-view", "week");
    expect(readPhaseView(storage)).toBe("day");
  });
});
