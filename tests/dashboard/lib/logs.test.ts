import { describe, expect, it } from "vitest";
import {
  buildLogExportEvents,
  buildLogsEvents,
  logDayKeys,
  logDayMarkdown,
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

const ALL_KINDS = ["dumps", "phases", "metrics", "tasks"];

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
      JSON.stringify({ kinds: ["tasks", "cards", "dumps", "tasks"] }),
    );
    expect(readLogsPreferences(storage)).toEqual({
      kinds: ["dumps", "tasks"],
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
    expect(toggleLogKind(["tasks"], "dumps")).toEqual(["dumps", "tasks"]);
    expect(toggleLogKind(["dumps", "tasks"], "dumps")).toEqual(["tasks"]);
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
  const dump = { id: 1, createdAt: 180, text: "note", tags: [] };
  const stretch = { id: 1, taskId: 1, startedAt: 160, endedAt: 190 };
  const feed = (kinds: Parameters<typeof buildLogsEvents>[0], every = false) =>
    buildLogsEvents(kinds, every, [checkIn], phaseCheckIns, [dump], [stretch], 0);

  it("includes only the selected kinds", () => {
    expect(feed(["dumps", "tasks"]).map((event) => event.kind)).toEqual([
      "work-stop",
      "dump",
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

describe("daily Logs export", () => {
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
    const events = buildLogExportEvents(
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

    const markdown = logDayMarkdown(0, events, {
      phases: [
        {
          id: 3,
          name: "Doing",
          icon: "play",
          color: null,
          createdAt: 0,
          inactiveSince: null,
        },
      ],
      metrics: [
        { id: 1, name: "Energy", icon: "sun", color: null, createdAt: 0 },
      ],
      pulses: [
        { id: 1, name: "Daily pulse", icon: "activity", createdAt: 0, metricIds: [1] },
      ],
      tasks: [
        {
          id: 1,
          title: "Write proposal",
          description: "",
          status: "active",
          workingNow: false,
          workedSeconds: 30,
          workStartedAt: null,
          scope: null,
          value: null,
          effort: null,
          parentTaskId: null,
          createdAt: 0,
          updatedAt: 0,
        },
      ],
    });

    expect(markdown).toContain("Phase — Doing");
    expect(markdown).toContain("Metric check-in — Daily pulse: Energy 4");
    expect(markdown).toContain("Working now started — Write proposal");
    expect(markdown).toContain("Paused — Write proposal");
    expect(markdown).toContain("Brain dump — Tags: reflection");
    expect(markdown).toContain("> First line\n  > Second line");
  });

  it("keeps settled Resting in the day export so Scoping-only dumps cannot hide away time", () => {
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
    const events = buildLogExportEvents(
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
    expect(buildLogsEvents(["dumps"], false, [], [], [], [], 0, history)).toEqual([]);
  });

  it("exports creation, completion, reopening, cancellation and retired statuses", () => {
    const events = buildLogExportEvents([], [], [], [], 0, history);
    const markdown = logDayMarkdown(0, events, { phases: [], metrics: [], pulses: [], tasks: [] });
    expect(markdown).toContain("Created task · Active — Task 7");
    expect(markdown).toContain("Completed task · Active → Completed — Task 7");
    expect(markdown).toContain("Completed → Up next — Task 7");
    expect(markdown).toContain("Cancelled task · Up next → Cancelled — Task 7");
    expect(markdown).toContain("Cancelled task · Paused → Cancelled — Task 7");
    expect(markdown.indexOf("Created task")).toBeLessThan(markdown.indexOf("Completed task"));
    expect(markdown.indexOf("Completed task")).toBeLessThan(markdown.indexOf("Completed → Up next"));
  });
});

describe("Logs selected day", () => {
  const day = (date: number) => new Date(2026, 8, date).getTime();
  const at = (date: number, hour: number) =>
    new Date(2026, 8, date, hour).getTime() / 1000;
  // Newest first, with Sep 26 and Sep 29 empty.
  const events = [
    { at: at(30, 9) },
    { at: at(28, 18) },
    { at: at(28, 8) },
    { at: at(27, 12) },
    { at: at(25, 7) },
  ];
  const keys = logDayKeys(events);

  it("lists each day with entries once, newest first", () => {
    expect(keys).toEqual([day(30), day(28), day(27), day(25)]);
  });


});
