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

  it("leads each Pulse name with its check-in count", () => {
    expect(html).toMatch(/>3<\/span><span class="insight-pulse__name">Energy</);
    expect(html).toMatch(/>0<\/span><span class="insight-pulse__name">Focus</);
    expect(html).toContain("Energy, 3 check-ins");
    expect(html).toContain("Focus, 0 check-ins");
  });
});
