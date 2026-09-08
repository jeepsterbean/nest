import { describe, expect, it } from "vitest";
import {
  adjacentBrainDumpIndex,
  brainDumpHistoryDirection,
  getBrainDumpDraft,
  isBrainDumpSubmitShortcut,
  setBrainDumpDraft,
  trimBrainDumpDraft,
} from "../../src/lib/brainDumpDraft";

describe("adjacentBrainDumpIndex", () => {
  it("moves between the current draft and at most five saved dumps", () => {
    expect(adjacentBrainDumpIndex(-1, 1, 5)).toBe(0);
    expect(adjacentBrainDumpIndex(4, 1, 5)).toBe(4);
    expect(adjacentBrainDumpIndex(0, -1, 5)).toBe(-1);
    expect(adjacentBrainDumpIndex(-1, -1, 5)).toBe(-1);
  });
});

describe("brainDumpHistoryDirection", () => {
  it("maps modified brackets to brain dump history navigation", () => {
    expect(
      brainDumpHistoryDirection({ key: "[", metaKey: true, ctrlKey: false }),
    ).toBe(1);
    expect(
      brainDumpHistoryDirection({ key: "]", metaKey: false, ctrlKey: true }),
    ).toBe(-1);
    expect(
      brainDumpHistoryDirection({ key: "[", metaKey: false, ctrlKey: false }),
    ).toBeNull();
  });
});

const enter = {
  key: "Enter",
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
};

describe("isBrainDumpSubmitShortcut", () => {
  it("submits only modified Enter presses", () => {
    expect(isBrainDumpSubmitShortcut(enter)).toBe(false);
    expect(isBrainDumpSubmitShortcut({ ...enter, metaKey: true })).toBe(true);
    expect(isBrainDumpSubmitShortcut({ ...enter, ctrlKey: true })).toBe(true);
    expect(
      isBrainDumpSubmitShortcut({ ...enter, metaKey: true, isComposing: true }),
    ).toBe(false);
  });
});

describe("trimBrainDumpDraft", () => {
  it("trims the shared body", () => {
    expect(trimBrainDumpDraft({ text: "  Details  ", tagIds: [] })).toBe("Details");
  });
});

describe("setBrainDumpDraft", () => {
  it("ignores writes that change nothing, so listeners stay asleep", () => {
    setBrainDumpDraft({ text: "Ideas", tagIds: [1, 2] });
    const stored = getBrainDumpDraft();

    setBrainDumpDraft({ text: "Ideas", tagIds: [1, 2] });
    expect(getBrainDumpDraft()).toBe(stored);

    setBrainDumpDraft({ text: "Ideas", tagIds: [2, 1] });
    expect(getBrainDumpDraft()).not.toBe(stored);

    setBrainDumpDraft({ text: "", tagIds: [] });
  });
});
