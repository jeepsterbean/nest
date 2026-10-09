import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/dashboard/hooks/useTileIcons", () => ({
  useTileIcons: () => DEFAULT_TILE_ICONS,
}));

import { DashboardSidebar } from "../../../src/dashboard/components/DashboardSidebar";
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

const renderSidebar = (view: "calendar" | "core") =>
  renderToStaticMarkup(
    createElement(DashboardSidebar, { view, onSelectView: vi.fn() }),
  );

describe("DashboardSidebar", () => {
  it("offers Calendar and Core as the only Sections", () => {
    const html = renderSidebar("calendar");

    expect(html).toContain('aria-label="Calendar, choose icon"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Core"');
    for (const retired of ["Overview", "Assistant", "Settings"]) {
      expect(html).not.toContain(retired);
    }
  });

  it("marks Core as the current Section when it is selected", () => {
    const html = renderSidebar("core");

    expect(html).toContain('aria-label="Core, choose icon"');
    expect(html).toContain('aria-label="Calendar"');
  });

  it("keeps Background as a closed panel toggle after the Sections", () => {
    const html = renderSidebar("calendar");
    const nav = html.indexOf('aria-label="Dashboard sections"');
    const background = html.indexOf('aria-label="Background"');

    expect(background).toBeGreaterThan(nav);
    expect(html).toMatch(/aria-label="Background" aria-expanded="false" aria-controls="[^"]+"/);
    expect(html).not.toContain('role="dialog"');
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
