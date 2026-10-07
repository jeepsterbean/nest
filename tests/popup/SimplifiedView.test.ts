import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/popup/windowDrag", () => ({ startPopupWindowDrag: vi.fn() }));
vi.mock("../../src/lib/simplifiedView", () => ({ SIMPLIFIED_VIEW: true }));
vi.mock("../../src/dashboard/hooks/useTileIcons", () => ({
  useTileIcons: () => DEFAULT_TILE_ICONS,
}));

import { DashboardSidebar } from "../../src/dashboard/components/DashboardHeader";
import { DEFAULT_TILE_ICONS } from "../../src/dashboard/lib/tileIcons";
import {
  initialPopupPanels,
  popupAssistantMounted,
  popupPanelShortcut,
  PopupPanelToggles,
  togglePopupPanel,
} from "../../src/popup/PopupContent";

describe("simplified view", () => {
  it("offers Calendar and Core in the dashboard", () => {
    const html = renderToStaticMarkup(createElement(DashboardSidebar, {
      view: "calendar",
      onSelectView: vi.fn(),
    }));
    expect(html).toContain('aria-label="Calendar, choose icon"');
    expect(html).toContain('aria-label="Core"');
    for (const label of ["Overview", "Assistant", "Settings"]) {
      expect(html).not.toContain(`>${label}<`);
    }
  });

  it("restores available panels and preserves an explicitly empty selection", () => {
    expect(initialPopupPanels("assistant,now,dump", null)).toEqual(["dump", "now"]);
    expect(initialPopupPanels("assistant", "overview")).toEqual(["dump"]);
    expect(initialPopupPanels(null, "assistant")).toEqual(["dump"]);
    expect(initialPopupPanels(null, "overview")).toEqual(["dump", "now"]);
    expect(initialPopupPanels("", "assistant")).toEqual([]);
  });

  it("keeps Assistant unavailable to shortcuts, toggles, and mounting", () => {
    const key = {
      key: "3", metaKey: true, ctrlKey: false, altKey: false,
      shiftKey: false, repeat: false, isComposing: false,
    };
    expect(popupPanelShortcut(key)).toBeNull();
    expect(popupPanelShortcut({ ...key, key: "1" })).toBe("dump");
    expect(popupPanelShortcut({ ...key, key: "2" })).toBe("now");
    expect(togglePopupPanel(["dump"], "assistant")).toEqual(["dump"]);
    expect(popupAssistantMounted(["assistant"], true)).toBe(false);
    const html = renderToStaticMarkup(createElement(PopupPanelToggles, {
      visible: ["dump"], metricDue: false, icons: DEFAULT_TILE_ICONS,
      toggleRefs: {
        dump: createRef<HTMLButtonElement>(),
        now: createRef<HTMLButtonElement>(),
        assistant: createRef<HTMLButtonElement>(),
      },
      onToggle: vi.fn(),
    }));
    expect(html).toContain('aria-label="Brain dump"');
    expect(html).toContain('aria-label="Tasks and metrics"');
    expect(html).not.toContain("Chat assistant");
    expect(html).not.toContain("Meta+3");
  });
});
