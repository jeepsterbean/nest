import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/popup/windowDrag", () => ({
  startPopupWindowDrag: vi.fn(),
}));
vi.mock("../../src/lib/simplifiedView", () => ({ SIMPLIFIED_VIEW: false }));

import {
  adjacentTimerInterval,
  initialPopupPanels,
  isMetricCheckInDue,
  isPopupWindowDragTarget,
  popupAssistantMounted,
  popupPanelShortcut,
  PopupPanelToggles,
  PopupTopPanel,
  readLastPopupTab,
  readPopupPanels,
  shouldCloseOverlayOnFocusLeave,
  shouldDismissOnPointerDown,
  togglePopupPanel,
  writePopupPanels,
} from "../../src/popup/PopupContent";
import type { PopupPanelId } from "../../src/popup/PopupContent";
import { DEFAULT_TILE_ICONS } from "../../src/dashboard/lib/tileIcons";
import {
  firstScorablePulse,
  MetricCheckIn,
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

  it("skips pulses whose metrics are all silenced", () => {
    expect(
      firstScorablePulse(
        [pulse(1, [9]), pulse(2, [8])],
        new Set([9]),
      )?.id,
    ).toBe(2);
    expect(firstScorablePulse([pulse(1, [9])], new Set([9]))).toBeNull();
  });
});

describe("MetricCheckIn silence", () => {
  it("puts a Silence control beside the Metric title", () => {
    const html = renderToStaticMarkup(
      createElement(MetricCheckIn, {
        metrics: [
          {
            id: 9,
            name: "Focus",
            icon: "activity",
            createdAt: 1,
            color: null,
          },
        ],
        pulses: [pulse(1, [9])],
        submitting: false,
        emptyCopy: "none",
        onComplete: async () => undefined,
        silenceMinutes: 45,
        nowMs: 1_000,
      }),
    );

    expect(html).toContain("Focus");
    expect(html).toContain('aria-label="Silence Focus for 45 min"');
    expect(html).toContain("metric-step__silence");
  });

  it("blames the empty Pulse, not Silence, when no Metric is assigned", () => {
    const html = renderToStaticMarkup(
      createElement(MetricCheckIn, {
        metrics: [],
        pulses: [pulse(1, [])],
        submitting: false,
        emptyCopy: "No pulses yet.",
        onComplete: async () => undefined,
        silenceMinutes: 45,
        nowMs: 1_000,
      }),
    );

    expect(html).toContain("This pulse has no metrics yet.");
    expect(html).not.toContain("silenced");
  });
});

describe("isMetricCheckInDue", () => {
  it("becomes due at the scheduled second", () => {
    expect(isMetricCheckInDue(100, 99_999)).toBe(false);
    expect(isMetricCheckInDue(100, 100_000)).toBe(true);
  });

  it("stays quiet while any Metric is silenced", () => {
    expect(isMetricCheckInDue(100, 100_000, new Set([3]))).toBe(false);
    expect(isMetricCheckInDue(100, 100_000, new Set())).toBe(true);
  });
});

describe("togglePopupPanel", () => {
  const ALL: PopupPanelId[] = ["dump", "now", "assistant"];

  it("reaches all eight combinations, including none at all", () => {
    const combinations = new Set<string>();
    // Every subset is one toggle away from the subset without that panel.
    for (let mask = 0; mask < 8; mask += 1) {
      let visible: PopupPanelId[] = [];
      ALL.forEach((panel, index) => {
        if (mask & (1 << index)) visible = togglePopupPanel(visible, panel);
      });
      combinations.add(visible.join(","));
    }
    expect(combinations.size).toBe(8);
    expect(combinations.has("")).toBe(true);
    expect(combinations.has("dump,now,assistant")).toBe(true);
  });

  it("keeps sidebar order however the panels were shown", () => {
    expect(togglePopupPanel(["assistant"], "dump")).toEqual(["dump", "assistant"]);
    expect(togglePopupPanel(["assistant", "dump"], "now")).toEqual([
      "dump",
      "now",
      "assistant",
    ]);
  });

  it("returns to the same combination on a repeated toggle", () => {
    const visible: PopupPanelId[] = ["dump", "now"];
    expect(togglePopupPanel(togglePopupPanel(visible, "now"), "now")).toEqual(
      visible,
    );
    expect(
      togglePopupPanel(togglePopupPanel(visible, "assistant"), "assistant"),
    ).toEqual(visible);
    expect(togglePopupPanel(togglePopupPanel([], "dump"), "dump")).toEqual([]);
  });
});

describe("initialPopupPanels", () => {
  it("restores a saved combination, empty selection included", () => {
    expect(initialPopupPanels("dump,assistant", null)).toEqual([
      "dump",
      "assistant",
    ]);
    expect(initialPopupPanels("assistant,dump", null)).toEqual([
      "dump",
      "assistant",
    ]);
    expect(initialPopupPanels("", "now")).toEqual([]);
  });

  it("migrates the tab preference it replaced", () => {
    expect(initialPopupPanels(null, "overview")).toEqual([
      "dump",
      "now",
      "assistant",
    ]);
    expect(initialPopupPanels(null, "dump")).toEqual(["dump"]);
    expect(initialPopupPanels(null, "now")).toEqual(["now"]);
    expect(initialPopupPanels(null, "assistant")).toEqual(["assistant"]);
  });

  it("falls back to Brain dump when either preference is missing or invalid", () => {
    expect(initialPopupPanels(null, null)).toEqual(["dump"]);
    expect(initialPopupPanels(null, "nope")).toEqual(["dump"]);
    expect(initialPopupPanels("nope", null)).toEqual(["dump"]);
    expect(initialPopupPanels("nope", "overview")).toEqual([
      "dump",
      "now",
      "assistant",
    ]);
  });
});

describe("popup panel storage", () => {
  const fakeStorage = (initial: Record<string, string> = {}) => {
    const values: Record<string, string> = { ...initial };
    return {
      getItem: (key: string) => values[key] ?? null,
      setItem: (key: string, next: string) => {
        values[key] = next;
      },
    };
  };

  it("round-trips a combination, and an empty one, under nest:popup-panels", () => {
    const storage = fakeStorage();

    expect(readPopupPanels(storage)).toBeNull();
    writePopupPanels(["dump", "assistant"], storage);
    expect(readPopupPanels(storage)).toBe("dump,assistant");
    expect(
      initialPopupPanels(readPopupPanels(storage), readLastPopupTab(storage)),
    ).toEqual(["dump", "assistant"]);

    writePopupPanels([], storage);
    expect(readPopupPanels(storage)).toBe("");
    expect(
      initialPopupPanels(readPopupPanels(storage), readLastPopupTab(storage)),
    ).toEqual([]);
  });

  it("restores the same panels however the Popup was summoned", () => {
    // The Timer-due route no longer forces a combination of its own; a manual
    // summon and a Timer-triggered one both read the saved preference.
    const storage = fakeStorage({ "nest:popup-tab": "overview" });

    expect(
      initialPopupPanels(readPopupPanels(storage), readLastPopupTab(storage)),
    ).toEqual(["dump", "now", "assistant"]);
    writePopupPanels(["now"], storage);
    expect(
      initialPopupPanels(readPopupPanels(storage), readLastPopupTab(storage)),
    ).toEqual(["now"]);
  });

  it("reads as null when storage throws", () => {
    const blocked = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };

    expect(readPopupPanels(blocked)).toBeNull();
    expect(() => writePopupPanels(["dump"], blocked)).not.toThrow();
  });
});

describe("popupPanelShortcut", () => {
  type Mods = Partial<
    Record<
      "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "repeat" | "isComposing",
      boolean
    >
  >;
  const key = (k: string, mods: Mods = {}) => ({
    key: k,
    metaKey: true,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    repeat: false,
    isComposing: false,
    ...mods,
  });

  it("maps \u23181, \u23182 and \u23183 to their panels in sidebar order", () => {
    expect(popupPanelShortcut(key("1"))).toBe("dump");
    expect(popupPanelShortcut(key("2"))).toBe("now");
    expect(popupPanelShortcut(key("3"))).toBe("assistant");
    expect(popupPanelShortcut(key("4"))).toBeNull();
  });

  it("ignores held-key repeats and composition so one press is one toggle", () => {
    expect(popupPanelShortcut(key("1", { repeat: true }))).toBeNull();
    expect(popupPanelShortcut(key("3", { isComposing: true }))).toBeNull();
  });

  it("stays out of other chords and plain typing", () => {
    expect(popupPanelShortcut(key("1", { metaKey: false }))).toBeNull();
    // Shift+number is the punctuation row, not a panel.
    expect(popupPanelShortcut(key("1", { shiftKey: true }))).toBeNull();
    expect(popupPanelShortcut(key("1", { altKey: true }))).toBeNull();
    expect(popupPanelShortcut(key("1", { ctrlKey: true }))).toBeNull();
    // No panel claims an editing chord, so Copy/Cut/Paste stay themselves.
    expect(popupPanelShortcut(key("c"))).toBeNull();
    expect(popupPanelShortcut(key("x"))).toBeNull();
    expect(popupPanelShortcut(key("v"))).toBeNull();
    expect(popupPanelShortcut(key("Tab", { metaKey: false }))).toBeNull();
  });
});

describe("popupAssistantMounted", () => {
  it("mounts Chat once shown, then keeps it mounted while hidden", () => {
    expect(popupAssistantMounted(["assistant"], false)).toBe(true);
    expect(popupAssistantMounted(["dump", "assistant"], false)).toBe(true);
    expect(popupAssistantMounted(["dump"], false)).toBe(false);
    expect(popupAssistantMounted([], false)).toBe(false);
    // Hidden after being shown: still mounted, so the chat keeps its activity.
    expect(popupAssistantMounted(["dump"], true)).toBe(true);
  });
});

describe("PopupPanelToggles", () => {
  const ALL: PopupPanelId[] = ["dump", "now", "assistant"];
  const toggleRefs = {
    dump: createRef<HTMLButtonElement>(),
    now: createRef<HTMLButtonElement>(),
    assistant: createRef<HTMLButtonElement>(),
  };
  const render = (visible: PopupPanelId[], metricDue = false) =>
    renderToStaticMarkup(
      createElement(PopupPanelToggles, {
        visible,
        metricDue,
        icons: DEFAULT_TILE_ICONS,
        toggleRefs,
        onToggle: vi.fn(),
      }),
    );
  const pressedStates = (html: string) =>
    [...html.matchAll(/aria-pressed="(true|false)"/g)].map(
      ([, value]) => value === "true",
    );

  it("reports each panel's own visibility for all eight combinations", () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const visible = ALL.filter((_, index) => mask & (1 << index));
      expect(pressedStates(render(visible))).toEqual(
        ALL.map((panel) => visible.includes(panel)),
      );
    }
  });

  it("names each panel and its shortcut, and stays keyboard reachable", () => {
    const html = render(["dump"]);

    expect(html).toContain('title="Brain dump (\u23181)"');
    expect(html).toContain('aria-keyshortcuts="Meta+1"');
    expect(html).toContain('title="Tasks and metrics (\u23182)"');
    expect(html).toContain('aria-keyshortcuts="Meta+2"');
    expect(html).toContain('title="Chat assistant (\u23183)"');
    expect(html).toContain('aria-keyshortcuts="Meta+3"');
    expect(html).not.toContain('tabindex="-1"');
  });

  it("keeps the Metric due dot on Tasks while that panel is hidden", () => {
    expect(render([], true)).toContain("popup-tabs__tab--due");
    expect(render(["dump", "now", "assistant"], false)).not.toContain(
      "popup-tabs__tab--due",
    );
    // Only Tasks carries it, whichever panels are open.
    expect(render([], true).match(/popup-tabs__tab--due/g)).toHaveLength(1);
  });
});
