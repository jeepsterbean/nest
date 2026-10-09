import { describe, expect, it } from "vitest";
import {
  phaseMeaning,
  phasesInGuideOrder,
} from "../../../src/dashboard/lib/phaseGuide";
import type { Phase } from "../../../src/lib/types";

const phase = (id: number, name: string): Phase => ({
  id,
  name,
  icon: "circle",
  color: null,
  createdAt: 0,
  inactiveSince: null,
});

describe("phasesInGuideOrder", () => {
  it("lists Phases as Doing, Scoping, Resting, Offline", () => {
    const phases = ["Scoping", "Offline", "Resting", "Doing"].map((name, i) =>
      phase(i + 1, name),
    );
    expect(phasesInGuideOrder(phases).map((p) => p.name)).toEqual([
      "Doing",
      "Scoping",
      "Resting",
      "Offline",
    ]);
  });

  it("keeps an unguided Phase after the guided ones", () => {
    const phases = [phase(1, "Custom"), phase(2, "Doing")];
    expect(phasesInGuideOrder(phases).map((p) => p.name)).toEqual([
      "Doing",
      "Custom",
    ]);
  });
});

describe("phaseMeaning", () => {
  it("has no meaning for an unguided Phase", () => {
    expect(phaseMeaning("Custom")).toBeNull();
  });
});
