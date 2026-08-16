import { describe, expect, it } from "vitest";
import {
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
} from "../../src/lib/brainDumpDraft";

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
  it("keeps the title attached to the shared body", () => {
    expect(trimBrainDumpDraft({ title: "  Plan  ", text: "  Details  " })).toEqual({
      title: "Plan",
      text: "Details",
    });
  });
});
