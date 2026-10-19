import { describe, expect, it } from "vitest";
import {
  ALL_LOG_KINDS,
  buildLogsEvents,
  taskStatusEventLabel,
  readLogsPreferences,
  toggleLogKind,
  writeLogsPreferences,
} from "../../../src/dashboard/lib/logs";
import type {
  MetricCheckInWithRatings,
  PhaseCheckIn,
  TaskStatusEvent,
} from "../../../src/lib/types";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

const ALL_KINDS = ["notes", "phases", "metrics", "tasks"];

describe("Logs preferences", () => {
  it("defaults to every kind", () => {
    expect(readLogsPreferences(memory())).toEqual({
      kinds: ALL_KINDS,
    });
  });

  it("round-trips the selected kinds", () => {
    const storage = memory();
    writeLogsPreferences({ kinds: ["phases", "tasks"] }, storage);
    expect(readLogsPreferences(storage)).toEqual({
      kinds: ["phases", "tasks"],
    });
  });

  it("keeps kinds in filter order and drops unknown ones", () => {
    const storage = memory();
    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({ kinds: ["tasks", "cards", "notes", "tasks"] }),
    );
    expect(readLogsPreferences(storage)).toEqual({
      kinds: ["notes", "tasks"],
    });
  });

  it("selects every kind for storage from before multi-select", () => {
    const storage = memory();
    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({ view: "phases", layout: "raw" }),
    );
    expect(readLogsPreferences(storage)).toEqual({
      kinds: ALL_KINDS,
    });
  });

  it("reads Notes saved as the brain dump kind", () => {
    const storage = memory();
    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({ kinds: ["tasks", "dumps"] }),
    );
    expect(readLogsPreferences(storage)).toEqual({ kinds: ["notes", "tasks"] });
  });

  it("ignores a retired List / Hours scale", () => {
    const storage = memory();
    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({ kinds: ["tasks"], scale: "hours" }),
    );
    expect(readLogsPreferences(storage)).toEqual({ kinds: ["tasks"] });
  });

  it("selects every kind when nothing valid was stored", () => {
    const storage = memory();
    storage.setItem("nest:logs-preferences", JSON.stringify({ kinds: [] }));
    expect(readLogsPreferences(storage)).toEqual({
      kinds: ALL_KINDS,
    });
  });

  it("recovers from malformed storage", () => {
    const storage = memory();
    storage.setItem("nest:logs-preferences", "{");
    expect(readLogsPreferences(storage)).toEqual({
      kinds: ALL_KINDS,
    });
  });
});

describe("Logs kind selection", () => {
  it("toggles a kind on in filter order and off again", () => {
    expect(toggleLogKind(["tasks"], "notes")).toEqual(["notes", "tasks"]);
    expect(toggleLogKind(["notes", "tasks"], "notes")).toEqual(["tasks"]);
  });

  it("keeps the last shown kind on", () => {
    expect(toggleLogKind(["phases"], "phases")).toEqual(["phases"]);
  });
});

describe("Logs feed", () => {
  const phase = (id: number, createdAt: number, phaseId: number): PhaseCheckIn => ({
    id,
    createdAt,
    phaseId,
    phaseLabel: null,
  });
  // One burst inside the 60-second settle window, so it lands on Phase 3.
  const phaseCheckIns = [phase(1, 100, 1), phase(2, 130, 2), phase(3, 150, 3)];
  const checkIn: MetricCheckInWithRatings = {
    id: 1,
    createdAt: 170,
    pulseId: 1,
    pulseName: "Daily pulse",
    ratings: [],
  };
  const note = { id: 1, createdAt: 180, text: "note", tags: [] };
  const stretch = { id: 1, taskId: 1, startedAt: 160, endedAt: 190 };
  const feed = (kinds: Parameters<typeof buildLogsEvents>[0], every = false) =>
    buildLogsEvents(kinds, every, [checkIn], phaseCheckIns, [note], [stretch], 0);

  it("includes only the selected kinds", () => {
    expect(feed(["notes", "tasks"]).map((event) => event.kind)).toEqual([
      "work-stop",
      "note",
      "work-start",
    ]);
    expect(feed(["metrics"]).map((event) => event.kind)).toEqual(["metrics"]);
  });

  it("settles Phase rows unless every checkpoint is asked for", () => {
    const phaseIds = (every: boolean) =>
      feed(["phases"], every).map((event) =>
        event.kind === "phase" ? event.checkIn.phaseId : null,
      );
    expect(phaseIds(false)).toEqual([3]);
    expect(phaseIds(true)).toEqual([3, 2, 1]);
  });
});

describe("every Logs kind together", () => {
  it("uses settled Phase changes and includes every event type", () => {
    const checkIn: MetricCheckInWithRatings = {
      id: 1,
      createdAt: 170,
      pulseId: 1,
      pulseName: "Daily pulse",
      ratings: [{ checkInId: 1, metricId: 1, value: 4 }],
    };
    const phase = (
      id: number,
      createdAt: number,
      phaseId: number,
    ): PhaseCheckIn => ({
      id,
      createdAt,
      phaseId,
      phaseLabel: null,
    });
    const events = buildLogsEvents(
      ALL_LOG_KINDS,
      false,
      [checkIn],
      [phase(1, 100, 1), phase(2, 130, 2), phase(3, 150, 3)],
      [
        {
          id: 1,
          createdAt: 180,
          text: "First line\nSecond line",
          tags: [{ id: 1, name: "reflection" }],
        },
      ],
      [{ id: 1, taskId: 1, startedAt: 160, endedAt: 190 }],
      0,
    );

    expect(events.filter((event) => event.kind === "phase")).toHaveLength(1);

    expect(new Set(events.map((event) => event.kind))).toEqual(
      new Set(["phase", "metrics", "note", "work-start", "work-stop"]),
    );
  });

  it("keeps settled Resting so Scoping-only notes cannot hide away time", () => {
    const phase = (
      id: number,
      createdAt: number,
      phaseId: number,
    ): PhaseCheckIn => ({
      id,
      createdAt,
      phaseId,
      phaseLabel: null,
    });
    const SCOPING = 2;
    const RESTING = 4;
    const events = buildLogsEvents(
      ALL_LOG_KINDS,
      false,
      [],
      [
        phase(1, 100, SCOPING),
        phase(2, 200, RESTING),
        phase(3, 900, SCOPING),
      ],
      [
        {
          id: 1,
          createdAt: 110,
          text: "planning",
          tags: [],
        },
        {
          id: 2,
          createdAt: 910,
          text: "back",
          tags: [],
        },
      ],
      [],
      0,
    );

    expect(
      events
        .filter((event) => event.kind === "phase")
        .map((event) => event.checkIn.phaseId),
    ).toEqual([SCOPING, RESTING, SCOPING]);
    expect(
      events
        .filter((event) => event.kind === "phase")
        .map((event) => event.at),
    ).toEqual([900, 200, 100]);
  });
});


describe("Task lifecycle history", () => {
  const history: TaskStatusEvent[] = [
    { id: 1, taskId: 7, fromStatus: null, toStatus: "active", createdAt: 100 },
    { id: 2, taskId: 7, fromStatus: "active", toStatus: "completed", createdAt: 200 },
    { id: 3, taskId: 7, fromStatus: "completed", toStatus: "up_next", createdAt: 200 },
    { id: 4, taskId: 7, fromStatus: "up_next", toStatus: "cancelled", createdAt: 300 },
    { id: 5, taskId: 7, fromStatus: "paused", toStatus: "cancelled", createdAt: 400 },
  ];

  it("filters lifecycle rows with Tasks and orders same-second transitions by id", () => {
    const events = buildLogsEvents(["tasks"], false, [], [], [], [], 0, history);
    expect(events.map((event) => event.kind === "task-status" ? event.statusEvent.id : null))
      .toEqual([5, 4, 3, 2, 1]);
    expect(buildLogsEvents(["notes"], false, [], [], [], [], 0, history)).toEqual([]);
  });

  it("labels creation, completion, reopening, cancellation and retired statuses", () => {
    expect(history.map(taskStatusEventLabel)).toEqual([
      "Created task · Active",
      "Completed task · Active → Completed",
      "Completed → Up next",
      "Cancelled task · Up next → Cancelled",
      "Cancelled task · Paused → Cancelled",
    ]);
  });
});
