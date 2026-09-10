import { describe, expect, it } from "vitest";
import {
  buildLogExportEvents,
  logDayMarkdown,
  readLogsPreferences,
  writeLogsPreferences,
} from "../../../src/dashboard/lib/logs";
import type {
  MetricCheckInWithRatings,
  PhaseCheckIn,
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

describe("Logs preferences", () => {
  it("defaults to Raw", () => {
    expect(readLogsPreferences(memory())).toEqual({ view: "raw" });
  });

  it("round-trips the selected Logs view", () => {
    const storage = memory();
    writeLogsPreferences({ view: "timeline" }, storage);
    expect(readLogsPreferences(storage)).toEqual({ view: "timeline" });
  });

  it("migrates legacy layout and filter onto a single view", () => {
    const storage = memory();
    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({
        layout: "timeline",
        rawFilter: "phases",
        phaseMode: "raw",
      }),
    );
    expect(readLogsPreferences(storage)).toEqual({ view: "timeline" });

    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({
        layout: "raw",
        rawFilter: "dumps",
        phaseMode: "aggregated",
      }),
    );
    expect(readLogsPreferences(storage)).toEqual({ view: "dumps" });

    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({
        layout: "raw",
        rawFilter: "all",
        phaseMode: "aggregated",
      }),
    );
    expect(readLogsPreferences(storage)).toEqual({ view: "raw" });
  });

  it("falls back when the stored view is invalid", () => {
    const storage = memory();
    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({ view: "cards" }),
    );
    expect(readLogsPreferences(storage)).toEqual({ view: "raw" });
  });

  it("recovers from malformed storage", () => {
    const storage = memory();
    storage.setItem("nest:logs-preferences", "{");
    expect(readLogsPreferences(storage)).toEqual({ view: "raw" });
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
    expect(markdown).toContain("Working now stopped — Write proposal");
    expect(markdown).toContain("Brain dump — Tags: reflection");
    expect(markdown).toContain("> First line\n  > Second line");
  });

  it("keeps settled Resting on the Timeline so Scoping-only dumps cannot hide away time", () => {
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
