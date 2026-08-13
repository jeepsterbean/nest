import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PopupTopPanel } from "../../src/popup/CheckInForm";

const props: ComponentProps<typeof PopupTopPanel> = {
  timerDue: true,
  countdown: "0:00",
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
  });
});
