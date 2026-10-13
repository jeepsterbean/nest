import { describe, expect, it } from "vitest";
import {
  filledPhaseTotals,
  foldIdleIntoOffline,
  phaseColor,
  phaseIcon,
} from "../../../src/dashboard/lib/period";
import type { Phase } from "../../../src/lib/types";

describe("foldIdleIntoOffline", () => {
  const phases: Phase[] = [
    { id: 1, name: "Doing", icon: "target", color: null, createdAt: 0, inactiveSince: null },
    { id: 4, name: "Offline", icon: "moon", color: null, createdAt: 0, inactiveSince: null },
  ];

  it("adds Idle seconds to Offline", () => {
    expect(
      foldIdleIntoOffline(
        [
          { phaseId: 1, seconds: 10 },
          { phaseId: 4, seconds: 5 },
          { phaseId: null, seconds: 7 },
        ],
        phases,
      ),
    ).toEqual([
      { phaseId: 1, seconds: 10 },
      { phaseId: 4, seconds: 12 },
    ]);
  });
});

describe("filledPhaseTotals", () => {
  const phases: Phase[] = [
    { id: 1, name: "Doing", icon: "target", color: null, createdAt: 0, inactiveSince: null },
    { id: 2, name: "Scoping", icon: "idea", color: null, createdAt: 0, inactiveSince: null },
    { id: 3, name: "Resting", icon: "coffee", color: null, createdAt: 0, inactiveSince: null },
    { id: 4, name: "Offline", icon: "moon", color: null, createdAt: 0, inactiveSince: null },
  ];

  it("keeps missing live Phases as zero", () => {
    expect(filledPhaseTotals([{ phaseId: 1, seconds: 40 }], phases)).toEqual([
      { phaseId: 1, seconds: 40 },
      { phaseId: 2, seconds: 0 },
      { phaseId: 3, seconds: 0 },
      { phaseId: 4, seconds: 0 },
    ]);
  });
});

describe("phase appearance", () => {
  const phases: Phase[] = [
    {
      id: 1,
      name: "Doing",
      icon: "zap",
      color: "#5f8fb8",
      createdAt: 0,
      inactiveSince: null,
    },
    {
      id: 4,
      name: "Offline",
      icon: "moon",
      color: null,
      createdAt: 0,
      inactiveSince: null,
    },
  ];

  it("prefers the stored icon and color", () => {
    expect(phaseIcon(1, phases)).toBe("zap");
    expect(phaseColor(1, phases)).toBe("#5f8fb8");
  });

  it("keeps a stored icon when color is unset", () => {
    expect(phaseIcon(4, phases)).toBe("moon");
    expect(phaseColor(4, phases)).toBeNull();
  });

  it("falls back to name defaults when icon is empty or phase id is null", () => {
    const bare: Phase[] = [
      {
        id: 1,
        name: "Doing",
        icon: "",
        color: null,
        createdAt: 0,
        inactiveSince: null,
      },
    ];
    expect(phaseIcon(1, bare)).toBe("target");
    expect(phaseIcon(null, phases)).toBe("moon");
    expect(phaseColor(null, phases)).toBeNull();
  });
});
