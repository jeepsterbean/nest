import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DateNavigation } from "../../../src/dashboard/components/DateNavigation";
import { DayCalendar } from "../../../src/dashboard/components/DayPicker";
import { TimelineList } from "../../../src/dashboard/views/TimelineList";

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
    const markup = renderToStaticMarkup(createElement(TimelineList, {
      events: [], phaseCheckIns: [], phases: [], metrics: [], pulses: [], tasks: [],
      expandedDumpIds: new Set<number>(), onDeleteCheckIn: () => {},
      onToggleDump: () => {}, nowMs, showCurrentTime,
    }));
    expect(markup.includes("logs-chrono__row--now")).toBe(showCurrentTime);
    expect(markup).not.toContain("day-group__label");
    expect(markup).not.toContain("Open in Logs");
  });
});


describe("shared date control", () => {
  it("disables forward navigation on Today and includes the Brain dump shortcut", () => {
    const markup = renderToStaticMarkup(createElement(DateNavigation, {
      label: "Today", unit: "day", canGoNext: false,
      onPrevious: () => {}, onNext: () => {}, onToday: () => {},
    }));
    expect(markup).toMatch(/aria-label="Next day" disabled=""/);
    expect(markup).toContain('aria-label="Go to today"');
    expect(markup).toContain('class="date-navigation__label"');
  });

  it("names the week unit for Calendar's Week range", () => {
    const markup = renderToStaticMarkup(createElement(DateNavigation, {
      label: "05/10/2026 – 11/10/2026", unit: "week", canGoNext: false,
      onPrevious: () => {}, onNext: () => {}, onToday: () => {},
    }));
    expect(markup).toContain('aria-label="Week navigation"');
    expect(markup).toMatch(/aria-label="Next week" disabled=""/);
  });

  it("keeps the month picker free of a separate Today action", () => {
    const markup = renderToStaticMarkup(createElement(DateNavigation, {
      label: "October 2026", unit: "month", canGoPrevious: false, canGoNext: false,
      onPrevious: () => {}, onNext: () => {},
    }));
    expect(markup).toMatch(/aria-label="Previous month" disabled=""/);
    expect(markup).toMatch(/aria-label="Next month" disabled=""/);
    expect(markup).not.toContain('aria-label="Go to today"');
  });
});
