import { describe, expect, it } from "vitest";
import {
  DEFAULT_ASSISTANT_CONFIG,
  adoptConfigDefaults,
  DEFAULT_TASK_DETAIL,
  MAX_CONTEXT_DUMPS,
  buildAssistantMessage,
  describeOption,
  formatDumps,
  formatMetrics,
  formatPhase,
  formatStamp,
  formatTasks,
  isValidOption,
  renderTemplate,
  sampleData,
} from "../../../src/dashboard/lib/assistantContext";
import { buildTaskGraph } from "../../../src/dashboard/lib/taskGraph";
import { formatTime } from "../../../src/dashboard/lib/time";
import type { BrainDump, Metric, MetricCheckInWithRatings, Task } from "../../../src/lib/types";

const task = (id: number, status: Task["status"] = "active"): Task => ({
  id, title: id === 1 ? "Plan the day" : "Unblock the task", description: "A useful detail",
  status, workingNow: id === 1, workedSeconds: 90, workStartedAt: null, scope: "Nest",
  value: null, effort: null, parentTaskId: null, createdAt: 0, updatedAt: 0,
});

const noSelection = { dumps: null, metrics: null, phase: null, tasks: null };
const SAMPLE_NOW = 1_800_000_000;
const SAMPLE_DATA = sampleData(SAMPLE_NOW);

describe("assistant context", () => {
  it("takes a default saved in the other window without dropping this message's own picks", () => {
    const withDefault = (signal: "dumps" | "tasks", defaultOption: string | null) => ({
      ...DEFAULT_ASSISTANT_CONFIG,
      signals: {
        ...DEFAULT_ASSISTANT_CONFIG.signals,
        [signal]: { ...DEFAULT_ASSISTANT_CONFIG.signals[signal], defaultOption },
      },
    });
    const adopted = adoptConfigDefaults(
      DEFAULT_ASSISTANT_CONFIG,
      withDefault("dumps", "last:3"),
      { ...noSelection, tasks: "active" },
    );
    expect(adopted.dumps).toBe("last:3");
    expect(adopted.tasks).toBe("active");
    expect(adoptConfigDefaults(withDefault("dumps", "last:3"), withDefault("dumps", null), adopted).dumps)
      .toBeNull();
  });

  it("formats the Tasks a group option picks, with derived readiness", () => {
    const tasks = [task(1), task(2, "up_next")];
    const graph = buildTaskGraph(tasks, [{ blockerTaskId: 2, blockedTaskId: 1, createdAt: 0 }]);
    const output = formatTasks(tasks, graph, "active", { ...DEFAULT_TASK_DETAIL, description: true });
    expect(output).toContain("Tasks · active");
    expect(output).toContain("blocked by: Unblock the task");
    expect(output).toContain("A useful detail");
    expect(output).not.toContain("- Unblock the task");
    expect(formatTasks(tasks, graph, "active+up_next", DEFAULT_TASK_DETAIL)).toContain("- Unblock the task");
  });

  it("formats newest dump and metric rows by count or window", () => {
    const dumps: BrainDump[] = [
      { id: 1, createdAt: 100, text: "older thought", tags: [] },
      { id: 2, createdAt: 3_000, text: "plain thought", tags: [] },
    ];
    const metrics: Metric[] = [{ id: 1, name: "focus", icon: "", color: null, createdAt: 0 }];
    const checkIns: MetricCheckInWithRatings[] = [{ id: 1, createdAt: 100, pulseId: null, pulseName: null, ratings: [{ checkInId: 1, metricId: 1, value: 4 }] }];
    expect(formatDumps(dumps, "last:1", 3_600)).toContain("plain thought");
    expect(formatDumps(dumps, "last:1", 3_600)).not.toContain("older thought");
    expect(formatDumps(dumps, "window:15", 3_600)).not.toContain("older thought");
    expect(formatDumps(dumps, "window:15", 10_000)).toBe("");
    expect(formatMetrics(metrics, checkIns, "last:1")).toContain("focus 4");
  });

  it("stamps rows from before today with their day, so a count option cannot pass them off as today", () => {
    const now = new Date(2026, 8, 11, 14, 0).getTime() / 1000;
    const today = new Date(2026, 8, 11, 13, 58).getTime() / 1000;
    const yesterday = new Date(2026, 8, 10, 9, 5).getTime() / 1000;
    const dumps: BrainDump[] = [
      { id: 1, createdAt: today, text: "fresh thought", tags: [] },
      { id: 2, createdAt: yesterday, text: "old thought", tags: [] },
    ];
    const output = formatDumps(dumps, "last:2", now);
    expect(output).toContain(`- ${formatTime(today)}  fresh thought`);
    expect(output).toContain(`- Yesterday ${formatTime(yesterday)}  old thought`);
  });

  it("labels options and rejects shapes a signal cannot use", () => {
    expect(describeOption("dumps", "window:90")).toBe("Last 1h 30m");
    expect(describeOption("tasks", "workingNow+up_next")).toBe("Working now + Up next");
    expect(isValidOption("phase", "last:3")).toBe(false);
    expect(isValidOption("metrics", "window:0")).toBe(false);
    expect(isValidOption("tasks", "active+active")).toBe(false);
  });

  it("caps a wide window at the newest dumps and says so", () => {
    const dumps: BrainDump[] = Array.from({ length: MAX_CONTEXT_DUMPS + 5 }, (_, index) => ({
      id: index, createdAt: 10_000 - index, text: `thought ${index}`, tags: [],
    }));
    const output = formatDumps(dumps, "window:60", 10_000);
    expect(output.split("\n")[0]).toBe(`Brain dumps · last 1h · newest ${MAX_CONTEXT_DUMPS} of ${MAX_CONTEXT_DUMPS + 5}`);
    expect(output.split("\n")).toHaveLength(MAX_CONTEXT_DUMPS + 1);
    expect(output).toContain("thought 0");
    expect(output).not.toContain(`thought ${MAX_CONTEXT_DUMPS}`);
  });

  it("times sample records back from the clock it is given", () => {
    const now = 1_900_000_000;
    expect(Math.max(...sampleData(now).checkIns.map((checkIn) => checkIn.createdAt))).toBe(now - 3 * 60);
  });

  it("every default option renders sample output", () => {
    for (const { key } of DEFAULT_ASSISTANT_CONFIG.signals.dumps.options) expect(formatDumps(SAMPLE_DATA.brainDumps, key, SAMPLE_NOW)).not.toBe("");
    for (const { key } of DEFAULT_ASSISTANT_CONFIG.signals.phase.options) expect(formatPhase(SAMPLE_DATA.phases, SAMPLE_DATA.phaseCheckIns, key, SAMPLE_NOW)).not.toBe("");
  });

  it("formats Phase as the session timeline over the window", () => {
    const stamp = (minutesAgo: number) => formatStamp(SAMPLE_NOW - minutesAgo * 60, SAMPLE_NOW);
    expect(formatPhase(SAMPLE_DATA.phases, SAMPLE_DATA.phaseCheckIns, "window:60", SAMPLE_NOW)).toBe(
      ["Phase · last 1h", `- ${stamp(60)}  Doing`, `- ${stamp(50)}  Resting`, `- ${stamp(40)}  Scoping`, `- ${stamp(25)}  Doing`].join("\n"),
    );
    expect(formatPhase(SAMPLE_DATA.phases, [], "window:60", SAMPLE_NOW)).toBe("");
  });

  it("fills template tokens and folds the gaps empty signals leave", () => {
    const blocks = { tasks: "", phase: "Phase · last 1h", dumps: "", metrics: "", message: "Help." };
    expect(renderTemplate("Hi.\n\n{tasks}\n\n{phase}\n\n{dumps}\n\nAsk: {message}", blocks)).toBe("Hi.\n\nPhase · last 1h\n\nAsk: Help.");
    expect(renderTemplate("Be brief.", blocks)).toBe("Be brief.\n\nHelp.");
  });

  it("keeps the user's own blank lines when folding", () => {
    const message = "Why does this fail?\n\n\n\nconst a = 1;";
    const blocks = { tasks: "", phase: "", dumps: "", metrics: "", message };
    expect(renderTemplate("{tasks}\n\n{message}\n\n{dumps}", blocks)).toBe(message);
    expect(buildAssistantMessage(SAMPLE_DATA, DEFAULT_ASSISTANT_CONFIG, noSelection, message, SAMPLE_NOW)).toBe(message);
  });

  it("sends the bare message when nothing is selected, and ignores removed options", () => {
    const config = DEFAULT_ASSISTANT_CONFIG;
    expect(buildAssistantMessage(SAMPLE_DATA, config, noSelection, "Hi", SAMPLE_NOW)).toBe("Hi");
    expect(buildAssistantMessage(SAMPLE_DATA, config, { ...noSelection, dumps: "gone" }, "Hi", SAMPLE_NOW)).toBe("Hi");
  });

  it("heads a named option's block with what it covers, not its name", () => {
    const config = {
      ...DEFAULT_ASSISTANT_CONFIG,
      signals: {
        ...DEFAULT_ASSISTANT_CONFIG.signals,
        dumps: { options: [{ id: "a", name: "Just now", key: "last:1" }], defaultOption: null },
      },
    };
    const output = buildAssistantMessage(SAMPLE_DATA, config, { ...noSelection, dumps: "a" }, "Hi", SAMPLE_NOW);
    expect(output).toContain("Brain dumps · last 1");
    expect(output).not.toContain("Just now");
  });
});
