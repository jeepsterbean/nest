import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightBrainDumps } from "../../../src/dashboard/components/InsightBoard";

describe("InsightBrainDumps", () => {
  it("places Untagged above Tag counts when any dumps have no Tags", () => {
    const html = renderToStaticMarkup(
      createElement(InsightBrainDumps, {
        summary: {
          count: 4,
          untaggedCount: 2,
          tags: [
            { id: 1, name: "Work", count: 2 },
            { id: 2, name: "Ideas", count: 1 },
          ],
        },
        shown: true,
        alone: false,
        onToggle: () => {},
      }),
    );
    expect(html.indexOf("Untagged")).toBeGreaterThan(-1);
    expect(html.indexOf("Untagged")).toBeLessThan(html.indexOf("Work"));
    expect(html).not.toContain("No brain dumps in this period.");
  });

  it("keeps Untagged first even when every dump in the range has a Tag", () => {
    const html = renderToStaticMarkup(
      createElement(InsightBrainDumps, {
        summary: {
          count: 2,
          untaggedCount: 0,
          tags: [{ id: 1, name: "Work", count: 2 }],
        },
        shown: true,
        alone: false,
        onToggle: () => {},
      }),
    );
    expect(html.indexOf("Untagged")).toBeGreaterThan(-1);
    expect(html.indexOf("Untagged")).toBeLessThan(html.indexOf("Work"));
    expect(html).toMatch(/Untagged[\s\S]*?>0</);
  });

  it("keeps the heading and drops the list while Brain dumps are hidden", () => {
    const html = renderToStaticMarkup(
      createElement(InsightBrainDumps, {
        summary: {
          count: 2,
          untaggedCount: 0,
          tags: [{ id: 1, name: "Work", count: 2 }],
        },
        shown: false,
        alone: false,
        onToggle: () => {},
      }),
    );
    expect(html).toContain("Brain dumps");
    expect(html).toContain("Show Brain dumps");
    expect(html).not.toContain("Untagged");
  });
});
