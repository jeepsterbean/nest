import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DayCalendar } from "../../../src/dashboard/components/DayPicker";
import { LogsTimeline } from "../../../src/dashboard/views/LogsTimeline";

const nowMs = new Date(2026, 9, 7, 12).getTime();

describe("date navigation and empty Timeline", () => {
  it("gives the selected date the calendar's single Tab stop", () => {
    const from = new Date(2026, 9, 5).getTime() / 1000;
    const markup = renderToStaticMarkup(createElement(DayCalendar, {
      earliestSec: new Date(2026, 8, 7).getTime() / 1000,
      nowMs,
      selected: { from, to: from + 86400 },
      onPick: () => {},
    }));
    expect(markup.match(/tabindex="0"/g)).toHaveLength(1);
    expect(markup).toMatch(/tabindex="0"[^>]*aria-selected="true"/);
  });

  it.each([true, false])("shows an empty current-time row only when enabled (%s)", (showCurrentTime) => {
    const markup = renderToStaticMarkup(createElement(LogsTimeline, {
      events: [], phaseCheckIns: [], phases: [], metrics: [], pulses: [], tasks: [],
      expandedDumpIds: new Set<number>(), onDeleteCheckIn: () => {},
      onToggleDump: () => {}, nowMs, showCurrentTime,
    }));
    expect(markup.includes("logs-chrono__row--now")).toBe(showCurrentTime);
  });
});
