import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  firstScorablePulse,
  holdMetricDue,
  nextMetricIndex,
  PopupTopPanel,
  taskListOwnsWheel,
} from "../../src/popup/PopupContent";
import type { Pulse } from "../../src/lib/types";

const pulse = (id: number, metricIds: number[]): Pulse => ({
  id,
  name: `Pulse ${id}`,
  icon: "activity",
  createdAt: id,
  metricIds,
});

const props: ComponentProps<typeof PopupTopPanel> = {
  timerDue: true,
  countdown: "0:00",
  remainingRatio: 0,
  timerPickerOpen: true,
  schedulingTimer: false,
  selectedInterval: 15,
  onTimerPickerOpenChange: vi.fn(),
  onSelectInterval: vi.fn(),
  onOpenDashboard: vi.fn(),
};

describe("PopupTopPanel", () => {
  it("starts a new timer from the clock when the timer is due", () => {
    const html = renderToStaticMarkup(createElement(PopupTopPanel, props));

    expect(html).toContain('aria-label="Timer"');
    expect(html).toContain("0:00");
    expect(html).toContain('aria-label="Start timer"');
    expect(html).toContain("15 min");
    expect(html).not.toContain("combined-timer__sweep");
  });

  it("draws the remaining sweep while the timer is running", () => {
    const html = renderToStaticMarkup(
      createElement(PopupTopPanel, {
        ...props,
        timerDue: false,
        countdown: "7:30",
        remainingRatio: 0.5,
        timerPickerOpen: false,
      }),
    );

    expect(html).toContain("combined-timer__sweep");
    expect(html).toContain("7:30");
  });
});

describe("nextMetricIndex", () => {
  it("advances until the final metric", () => {
    expect(nextMetricIndex(0, 5)).toBe(1);
    expect(nextMetricIndex(4, 5)).toBeNull();
  });
});

describe("firstScorablePulse", () => {
  it("picks the first pulse that has metrics", () => {
    expect(firstScorablePulse([pulse(1, []), pulse(2, [9]), pulse(3, [8])])?.id).toBe(2);
    expect(firstScorablePulse([pulse(1, [])])).toBeNull();
  });
});

describe("holdMetricDue", () => {
  it("latches when the timer is due and only a Metric check-in save releases it", () => {
    expect(holdMetricDue(false, false, false)).toBe(false);
    expect(holdMetricDue(false, true, false)).toBe(true);
    expect(holdMetricDue(true, false, false)).toBe(true);
    expect(holdMetricDue(true, true, true)).toBe(false);
    expect(holdMetricDue(true, false, true)).toBe(false);
  });
});

describe("taskListOwnsWheel", () => {
  const list = (scrollTop: number, clientHeight = 100, scrollHeight = 200) => ({
    scrollTop,
    clientHeight,
    scrollHeight,
  });

  it("keeps upward wheel on the list when history sits above", () => {
    expect(taskListOwnsWheel(-40, list(80))).toBe(true);
    expect(taskListOwnsWheel(-40, list(0))).toBe(false);
  });

  it("keeps downward wheel on the list until the bottom", () => {
    expect(taskListOwnsWheel(40, list(0))).toBe(true);
    expect(taskListOwnsWheel(40, list(100))).toBe(false);
  });
});
