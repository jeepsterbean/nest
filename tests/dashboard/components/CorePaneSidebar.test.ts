import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/dashboard/hooks/useTileIcons", () => ({
  useTileIcons: () => DEFAULT_TILE_ICONS,
}));

import { CorePaneSidebar } from "../../../src/dashboard/components/CorePaneSidebar";
import { DEFAULT_TILE_ICONS } from "../../../src/dashboard/lib/tileIcons";

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

const renderSidebar = () =>
  renderToStaticMarkup(
    createElement(CorePaneSidebar, { pane: "tasks", onSelectPane: vi.fn() }),
  );

describe("CorePaneSidebar", () => {
  it("turns the selected pane into its icon picker", () => {
    const html = renderSidebar();

    expect(html).toContain('aria-label="Tasks, choose icon"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="Metrics"');
  });

  it("leaves the selected pane on its icon when icon selection is off", () => {
    localStorage.setItem(
      "nest:settings",
      JSON.stringify({ showTaskMap: false, iconSelection: false }),
    );
    const html = renderSidebar();

    expect(html).toContain('aria-label="Tasks"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("section-nav__button--active");
    expect(html).not.toContain("choose icon");
  });
});
