import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightBrainDumps } from "../../../src/dashboard/components/InsightBoard";

const renderDumps = (
  summary: {
    count: number;
    untaggedCount: number;
    tags: { id: number; name: string; count: number }[];
  },
  shown = true,
) =>
  renderToStaticMarkup(
    createElement(InsightBrainDumps, {
      summary,
      icon: "brain",
      shown,
      alone: false,
      onToggle: () => {},
      onOpen: () => {},
    }),
  );

describe("InsightBrainDumps", () => {
  it("places Untagged above Tag counts when any dumps have no Tags", () => {
    const html = renderDumps({
      count: 4,
      untaggedCount: 2,
      tags: [
        { id: 1, name: "Work", count: 2 },
        { id: 2, name: "Ideas", count: 1 },
      ],
    });
    expect(html.indexOf("Untagged")).toBeGreaterThan(-1);
    expect(html.indexOf("Untagged")).toBeLessThan(html.indexOf("Work"));
    expect(html).not.toContain("No brain dumps in this period.");
  });

  it("keeps Untagged first even when every dump in the range has a Tag", () => {
    const html = renderDumps({
      count: 2,
      untaggedCount: 0,
      tags: [{ id: 1, name: "Work", count: 2 }],
    });
    expect(html.indexOf("Untagged")).toBeGreaterThan(-1);
    expect(html.indexOf("Untagged")).toBeLessThan(html.indexOf("Work"));
    expect(html).toMatch(/Untagged[\s\S]*?>0</);
  });

  it("keeps the heading and drops the list while Brain dumps are hidden", () => {
    const html = renderDumps(
      {
        count: 2,
        untaggedCount: 0,
        tags: [{ id: 1, name: "Work", count: 2 }],
      },
      false,
    );
    expect(html).toContain("Brain dumps");
    expect(html).toContain("Show Brain dumps");
    expect(html).not.toContain("Untagged");
  });

  it("makes the Brain dumps title clickable and leaves Tag rows as summaries", () => {
    const html = renderDumps({
      count: 2,
      untaggedCount: 0,
      tags: [{ id: 1, name: "Work", count: 2 }],
    });
    expect(html).toContain('class="insight-list__title"');
    expect(html).toMatch(
      /<button type="button" class="insight-list__title"[^>]*>[\s\S]*Brain dumps<\/button>/,
    );
    expect(html).not.toMatch(/<h3>[\s\S]*class="insight-list__count"[\s\S]*<\/h3>/);
    expect(html).toContain("lucide-brain");
    expect(html).not.toMatch(/<button[^>]*>Work<\/button>/);
  });
});
