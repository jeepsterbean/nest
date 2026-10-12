import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/dashboard/hooks/useTileIcons", () => ({
  useTileIcons: () => DEFAULT_TILE_ICONS,
}));

import { DashboardSidebar } from "../../../src/dashboard/components/DashboardSidebar";
import { SettingsDialog } from "../../../src/dashboard/components/SettingsOverlay";
import { DEFAULT_TILE_ICONS } from "../../../src/dashboard/lib/tileIcons";
import { BackgroundView } from "../../../src/dashboard/views/BackgroundView";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
};

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
});

const renderSidebar = (view: "recap" | "core") =>
  renderToStaticMarkup(
    createElement(DashboardSidebar, { view, onSelectView: vi.fn() }),
  );

describe("DashboardSidebar", () => {
  it("offers Recap and Core as the only Sections", () => {
    const html = renderSidebar("recap");

    expect(html).toContain('aria-label="Recap, choose icon"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Core"');
    for (const retired of ["Overview", "Assistant"]) {
      expect(html).not.toContain(retired);
    }
  });

  it("marks Core as the current Section when it is selected", () => {
    const html = renderSidebar("core");

    expect(html).toContain('aria-label="Core, choose icon"');
    expect(html).toContain('aria-label="Recap"');
  });

  it("leaves the selected Section on its icon when icon selection is off", () => {
    localStorage.setItem(
      "nest:settings",
      JSON.stringify({ showTaskMap: false, iconSelection: false }),
    );
    const html = renderSidebar("recap");

    expect(html).toContain('aria-label="Recap"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain("choose icon");
  });

  it("keeps Settings closed at the foot of the Sidebar", () => {
    const html = renderSidebar("recap");
    const nav = html.indexOf('aria-label="Dashboard sections"');
    const settings = html.indexOf('aria-label="Settings"');

    expect(settings).toBeGreaterThan(nav);
    expect(html).toMatch(/aria-label="Settings" aria-expanded="false" aria-controls="[^"]+"/);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('aria-label="Background"');
  });
});

describe("BackgroundView", () => {
  it("shows the live preview, style, tuning, and an idle apply button", () => {
    const html = renderToStaticMarkup(createElement(BackgroundView));

    expect(html).toContain("background-settings__preview");
    expect(html).toContain("Background style");
    expect(html).toContain("Speed");
    expect(html).toContain("Intensity");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Background set<\/button>/);
  });
});

describe("SettingsDialog", () => {
  const renderDialog = (page: "background" | "map" | "icons") =>
    renderToStaticMarkup(
      createElement(SettingsDialog, { page, onPage: vi.fn(), onClose: vi.fn() }),
    );

  it("opens on Background with a close control", () => {
    const html = renderDialog("background");

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Close settings"');
    expect(html).toContain("Background set");
    expect(html).toContain('aria-current="page"');
  });

  it("keeps Map off until it is shown in Tasks", () => {
    const html = renderDialog("map");

    expect(html).toContain("Show in Tasks");
    expect(html).toContain('aria-label="Show Map in Tasks"');
    expect(html).toContain('aria-pressed="true">Off');
  });

  it("starts icon selection on for the Sidebar and Core", () => {
    const html = renderDialog("icons");

    expect(html).toContain("Sidebar and Core");
    expect(html).toContain('aria-label="Choose Sidebar and Core icons"');
    expect(html).toContain('aria-pressed="true">On');
  });
});
