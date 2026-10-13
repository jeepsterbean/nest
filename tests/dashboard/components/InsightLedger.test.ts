import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightLedger } from "../../../src/dashboard/components/InsightBoard";
import type { InsightTaskCount } from "../../../src/dashboard/lib/insights";

describe("InsightLedger", () => {
  const counts: InsightTaskCount[] = [
    { change: "created", count: 3 },
    { change: "completed", count: 7 },
    { change: "cancelled", count: 0 },
  ];
  const html = renderToStaticMarkup(createElement(InsightLedger, { counts }));

  it("shows each title followed by its count", () => {
    expect(html).toMatch(/>Created<\/span><span class="insight-row__count">3<\/span>/);
    expect(html).toMatch(/>Completed<\/span><span class="insight-row__count">7<\/span>/);
    expect(html).toMatch(/>Cancelled<\/span><span class="insight-row__count">0<\/span>/);
    expect(html).not.toContain("Incomplete");
  });

  it("keeps rows as summaries without clickable titles or expansion", () => {
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("<ul");
  });
});
