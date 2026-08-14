import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PopupTopPanel } from "../../src/popup/CheckInForm";

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
  it("keeps interval selection on the timer when a check-in is due", () => {
    const html = renderToStaticMarkup(createElement(PopupTopPanel, props));

    expect(html).toContain("Change next check-in interval");
    expect(html).toContain('aria-label="Next check-in interval"');
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
