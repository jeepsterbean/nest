import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/dashboard/hooks/useTileIcons", () => ({
  useTileIcons: () => DEFAULT_TILE_ICONS,
}));

import { DashboardSidebar } from "../../../src/dashboard/components/DashboardSidebar";
import { SettingsDialog } from "../../../src/dashboard/components/SettingsOverlay";
import type { Section } from "../../../src/dashboard/lib/sections";
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

const renderSidebar = (section: Section) =>
  renderToStaticMarkup(
    createElement(DashboardSidebar, { section, onSelectSection: vi.fn() }),
  );

describe("DashboardSidebar", () => {
  it("offers Recap, Notes, Tasks, Metrics, and Phases as the Sections", () => {
    const html = renderSidebar("recap");

    expect(html).toContain('aria-label="Recap, choose icon"');
    expect(html).toContain('aria-current="page"');
    const others = ["Notes", "Tasks", "Metrics", "Phases"].map((label) =>
      html.indexOf(`aria-label="${label}"`),
    );
    expect(others).toEqual([...others].sort((a, b) => a - b));
    expect(others[0]).toBeGreaterThan(html.indexOf('aria-label="Recap'));
    for (const retired of ["Overview", "Assistant", "Core"]) {
      expect(html).not.toContain(retired);
    }
  });

  it("marks Tasks as the current Section when it is selected", () => {
    const html = renderSidebar("tasks");

    expect(html).toContain('aria-label="Tasks, choose icon"');
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
  const renderDialog = (page: "background" | "map" | "workStretch" | "icons") =>
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

  it("keeps Work stretch off until it is shown in Calendar", () => {
    const html = renderDialog("workStretch");

    expect(html).toContain("Show in Calendar");
    expect(html).toContain('aria-label="Show Work stretch in Calendar"');
    expect(html).toContain('aria-pressed="true">Off');
  });

  it("starts icon selection on for the Sidebar", () => {
    const html = renderDialog("icons");

    expect(html).toContain('aria-label="Choose Sidebar icons"');
    expect(html).toContain('aria-pressed="true">On');
  });
});
