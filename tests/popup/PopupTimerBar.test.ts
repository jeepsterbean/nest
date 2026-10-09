import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PopupTimerBar } from "../../src/popup/PopupTimerBar";

const nowMs = 1_000_000_000;
const nowSecs = nowMs / 1000;

const props: ComponentProps<typeof PopupTimerBar> = {
  timer: { intervalMinutes: 15, nextDueAt: nowSecs, waitingForResponse: true },
  nowMs,
  timerButtonRef: createRef(),
  onSelectInterval: vi.fn(),
  initialOpen: true,
};

describe("PopupTimerBar", () => {
  it("starts a new timer from the clock when the timer is due", () => {
    const html = renderToStaticMarkup(createElement(PopupTimerBar, props));

    expect(html).toContain('aria-label="Timer"');
    expect(html).toContain("0:00");
    expect(html).toContain('aria-label="Start timer"');
    expect(html).toContain("15 min");
    expect(html).toContain('tabindex="-1"');
    // Picker must sit inside the anchor, not under a full-height wrapper
    // (that places it below the popup viewport where overflow clips it).
    expect(html).toMatch(
      /popup-timer__anchor[\s\S]*popup-timer__picker[\s\S]*15 min/,
    );
    expect(html).not.toContain("popup-timer__sweep");
    expect(html).not.toContain("Open dashboard");
  });

  it("draws the remaining sweep while the timer is running", () => {
    const html = renderToStaticMarkup(
      createElement(PopupTimerBar, {
        ...props,
        timer: {
          intervalMinutes: 15,
          nextDueAt: nowSecs + 450,
          waitingForResponse: false,
        },
        initialOpen: false,
      }),
    );

    expect(html).toContain("popup-timer__sweep");
    expect(html).toContain("7:30");
  });
});
