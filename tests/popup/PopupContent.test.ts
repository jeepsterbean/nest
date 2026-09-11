import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/popup/windowDrag", () => ({
  startPopupWindowDrag: vi.fn(),
}));

import {
  adjacentTimerInterval,
  holdMetricDue,
  isPopupWindowDragTarget,
  nextPopupTab,
  PopupTopPanel,
  shouldCloseOverlayOnFocusLeave,
  shouldDismissOnPointerDown,
} from "../../src/popup/PopupContent";
import {
  firstScorablePulse,
  nextMetricIndex,
} from "../../src/dashboard/components/MetricCheckIn";
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
  timerButtonRef: createRef(),
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
    expect(html).toContain('tabindex="-1"');
    // Picker must sit inside the circle anchor, not under full-height __main
    // (that places it below the popup viewport where overflow clips it).
    expect(html).toMatch(
      /combined-timer__anchor[\s\S]*combined-timer__picker[\s\S]*15 min/,
    );
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

describe("shouldDismissOnPointerDown", () => {
  const target = (matches: string | null) =>
    ({
      closest: (selector: string) =>
        matches != null && selector.includes(matches) ? {} : null,
    }) as unknown as EventTarget;

  it("dismisses open overlays only when the pointer is outside their root", () => {
    expect(
      shouldDismissOnPointerDown(true, target(null), ".combined-timer__anchor"),
    ).toBe(true);
    expect(
      shouldDismissOnPointerDown(
        true,
        target("combined-timer__anchor"),
        ".combined-timer__anchor",
      ),
    ).toBe(false);
    expect(
      shouldDismissOnPointerDown(
        true,
        target(null),
        ".now-task--composer, .now-group__add",
      ),
    ).toBe(true);
    expect(
      shouldDismissOnPointerDown(
        true,
        target("now-group__add"),
        ".now-task--composer, .now-group__add",
      ),
    ).toBe(false);
    expect(
      shouldDismissOnPointerDown(false, target(null), ".combined-timer__anchor"),
    ).toBe(false);
  });
});

describe("shouldCloseOverlayOnFocusLeave", () => {
  it("ignores empty relatedTarget so opening the picker does not flicker closed", () => {
    const target = (contains: (node: unknown) => boolean) =>
      ({ contains }) as unknown as EventTarget;
    const current = target(() => false);
    expect(shouldCloseOverlayOnFocusLeave(current, null)).toBe(false);
    expect(shouldCloseOverlayOnFocusLeave(current, target(() => false))).toBe(
      true,
    );
    expect(
      shouldCloseOverlayOnFocusLeave(
        target((node) => node === current),
        current,
      ),
    ).toBe(false);
  });
});

describe("adjacentTimerInterval", () => {
  it("moves between timer values and stops at either end", () => {
    expect(adjacentTimerInterval(15, 1)).toBe(20);
    expect(adjacentTimerInterval(15, -1)).toBe(10);
    expect(adjacentTimerInterval(30, 1)).toBe(30);
    expect(adjacentTimerInterval(5, -1)).toBe(5);
  });
});

describe("isPopupWindowDragTarget", () => {
  it("allows empty chrome and rejects controls", () => {
    expect(isPopupWindowDragTarget(null)).toBe(false);
    expect(
      isPopupWindowDragTarget({
        closest: () => null,
      } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isPopupWindowDragTarget({
        closest: (selector: string) =>
          selector.includes("button") ? {} : null,
      } as unknown as EventTarget),
    ).toBe(false);
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

describe("nextPopupTab", () => {
  type Mods = Partial<
    Record<"metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "isComposing", boolean>
  >;
  const key = (k: string, mods: Mods = {}) => ({
    key: k,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    ...mods,
  });

  it("cycles through the popup tabs on Tab", () => {
    expect(nextPopupTab(key("Tab"), "now")).toBe("dump");
    expect(nextPopupTab(key("Tab"), "dump")).toBe("assistant");
    expect(nextPopupTab(key("Tab"), "assistant")).toBe("now");
    expect(nextPopupTab(key("Tab", { shiftKey: true }), "now")).toBe("assistant");
    expect(nextPopupTab(key("Tab", { shiftKey: true }), "assistant")).toBe("dump");
    expect(nextPopupTab(key("Tab", { isComposing: true }), "now")).toBeNull();
    expect(nextPopupTab(key("Tab", { ctrlKey: true }), "now")).toBeNull();
  });

  it("maps ⌘1–3 to tabs and ignores everything else", () => {
    const cmd = { metaKey: true };
    expect(nextPopupTab(key("1", cmd), "dump")).toBe("now");
    expect(nextPopupTab(key("2", cmd), "now")).toBe("dump");
    expect(nextPopupTab(key("3", cmd), "now")).toBe("assistant");
    expect(nextPopupTab(key("4", cmd), "now")).toBeNull();
    expect(nextPopupTab(key("a", cmd), "now")).toBeNull();
    expect(nextPopupTab(key("1"), "now")).toBeNull();
  });
});
