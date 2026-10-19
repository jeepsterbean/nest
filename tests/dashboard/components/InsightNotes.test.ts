import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightNotes } from "../../../src/dashboard/components/InsightBoard";

const renderNotes = (
  summary: {
    count: number;
    untaggedCount: number;
    tags: { id: number; name: string; count: number }[];
  },
  shown = true,
) =>
  renderToStaticMarkup(
    createElement(InsightNotes, {
      summary,
      icon: "brain",
      shown,
      alone: false,
      onToggle: () => {},
      onOpen: () => {},
    }),
  );

describe("InsightNotes", () => {
  it("places Untagged above Tag counts when any notes have no Tags", () => {
    const html = renderNotes({
      count: 4,
      untaggedCount: 2,
      tags: [
        { id: 1, name: "Work", count: 2 },
        { id: 2, name: "Ideas", count: 1 },
      ],
    });
    expect(html.indexOf("Untagged")).toBeGreaterThan(-1);
    expect(html.indexOf("Untagged")).toBeLessThan(html.indexOf("Work"));
    expect(html).not.toContain("No notes in this period.");
  });

  it("keeps Untagged first even when every note in the range has a Tag", () => {
    const html = renderNotes({
      count: 2,
      untaggedCount: 0,
      tags: [{ id: 1, name: "Work", count: 2 }],
    });
    expect(html.indexOf("Untagged")).toBeGreaterThan(-1);
    expect(html.indexOf("Untagged")).toBeLessThan(html.indexOf("Work"));
    expect(html).toMatch(/Untagged[\s\S]*?>0</);
  });

  it("keeps the heading and drops the list while Notes are hidden", () => {
    const html = renderNotes(
      {
        count: 2,
        untaggedCount: 0,
        tags: [{ id: 1, name: "Work", count: 2 }],
      },
      false,
    );
    expect(html).toContain("Notes");
    expect(html).toContain("Show Notes");
    expect(html).not.toContain("Untagged");
  });

  it("makes the Notes title clickable and leaves Tag rows as summaries", () => {
    const html = renderNotes({
      count: 2,
      untaggedCount: 0,
      tags: [{ id: 1, name: "Work", count: 2 }],
    });
    expect(html).toContain('class="insight-list__title"');
    expect(html).toMatch(
      /<button type="button" class="insight-list__title"[^>]*>[\s\S]*Notes<\/button>/,
    );
    expect(html).not.toMatch(/<h3>[\s\S]*class="insight-list__count"[\s\S]*<\/h3>/);
    expect(html).toContain("lucide-brain");
    expect(html).not.toMatch(/<button[^>]*>Work<\/button>/);
  });
});
