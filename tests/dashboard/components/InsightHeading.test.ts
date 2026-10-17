import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightHeading } from "../../../src/dashboard/components/InsightBoard";
import { DEFAULT_TILE_ICONS } from "../../../src/dashboard/lib/tileIcons";

const headings = [
  { label: "Notes", icon: DEFAULT_TILE_ICONS.notes },
  { label: "Tasks", icon: DEFAULT_TILE_ICONS.tasks },
  { label: "Metrics", icon: DEFAULT_TILE_ICONS.metrics },
  { label: "Phases", icon: DEFAULT_TILE_ICONS.phases },
] as const;

describe("InsightHeading", () => {
  it.each(headings)("places the Section icon beside the $label title", ({ label, icon }) => {
    const html = renderToStaticMarkup(
      createElement(InsightHeading, {
        label,
        icon,
        shown: true,
        alone: false,
        onToggle: () => {},
        onOpen: () => {},
      }),
    );
    expect(html).toMatch(
      new RegExp(
        `<button type="button" class="insight-list__title"[^>]*>[\\s\\S]*<svg[\\s\\S]*${label}</button>`,
      ),
    );
    expect(html).not.toContain("insight-list__count");
  });
});
