import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightCheckIns } from "../../../src/dashboard/components/InsightBoard";
import type { InsightPulseGroup } from "../../../src/dashboard/lib/insights";

const groups: InsightPulseGroup[] = [
  {
    pulseId: 1,
    name: "Energy",
    icon: "activity",
    checkInCount: 3,
    average: 4.2,
    metrics: [],
  },
  {
    pulseId: 2,
    name: "Focus",
    icon: "brain",
    checkInCount: 0,
    average: null,
    metrics: [],
  },
];

describe("InsightCheckIns", () => {
  const html = renderToStaticMarkup(createElement(InsightCheckIns, { groups }));

  it("shows each Pulse title followed by its check-in count", () => {
    expect(html).toMatch(/>Energy<\/span><span class="insight-row__count">3<\/span>/);
    expect(html).toMatch(/>Focus<\/span><span class="insight-row__count">0<\/span>/);
    expect(html).not.toContain("4.2");
  });

  it("keeps Pulse rows as summaries without clickable titles or expansion", () => {
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("chevron");
    expect(html).not.toContain("<ul");
  });
});
