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
};

describe("PopupTimerBar", () => {
  it("pins the clock to 0:00 when the timer is due", () => {
    const html = renderToStaticMarkup(createElement(PopupTimerBar, props));

    expect(html).toContain('aria-label="Timer"');
    expect(html).toContain("0:00");
    expect(html).toContain("15 min");
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
      }),
    );

    expect(html).toContain("popup-timer__sweep");
    expect(html).toContain("7:30");
  });
});
