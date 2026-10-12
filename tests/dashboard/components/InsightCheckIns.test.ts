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
  const html = renderToStaticMarkup(createElement(InsightCheckIns, { groups, onOpenMetrics: () => {} }));

  it("shows each Pulse title followed by its check-in count", () => {
    expect(html).toMatch(/>Energy<\/button><span class="insight-row__count">3<\/span>/);
    expect(html).toMatch(/>Focus<\/button><span class="insight-row__count">0<\/span>/);
    expect(html).not.toContain("4.2");
  });

  it("removes expansion and keeps navigation available for empty Pulses", () => {
    expect(html.match(/<button /g)).toHaveLength(2);
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("chevron");
    expect(html).not.toContain("<ul");
  });
});
