import { describe, expect, it, vi } from "vitest";
import {
  adjacentBrainDumpIndex,
  brainDumpHistoryDirection,
  getBrainDumpDraft,
  historyIndexForDraftRevisionChange,
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
  it("reads the latest stored draft when cross-window notifications arrive late", async () => {
    const storage = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
      removeItem: vi.fn((key: string) => storage.delete(key)),
    };
    const channels: MockChannel[] = [];
    const storageListeners: ((event: { key: string }) => void)[] = [];
    class MockChannel {
      onmessage?: (event: { data: unknown }) => void;
      postMessage = vi.fn();
      constructor() { channels.push(this); }
    }
    vi.stubGlobal("window", {
      localStorage,
      addEventListener: (type: string, listener: (event: { key: string }) => void) => {
        if (type === "storage") storageListeners.push(listener);
      },
    });
    vi.stubGlobal("BroadcastChannel", MockChannel);
    try {
      vi.resetModules();
      const dashboard = await import("../../src/lib/brainDumpDraft");
      dashboard.setBrainDumpDraft({ text: "", tagIds: [] });
      vi.resetModules();
      const popup = await import("../../src/lib/brainDumpDraft");
      popup.setBrainDumpDraft({ text: "", tagIds: [] });
      channels[0].postMessage.mockClear();

      dashboard.setBrainDumpDraft({ text: "First edit", tagIds: [1] });
      const delayedMessage = { data: channels[0].postMessage.mock.calls[0][0] };
      dashboard.setBrainDumpDraft({ text: "Second edit", tagIds: [2] });
      const latest = dashboard.getBrainDumpDraft();
      localStorage.setItem.mockClear();
      localStorage.removeItem.mockClear();

      channels[1].onmessage?.(delayedMessage);
      expect(popup.getBrainDumpDraft()).toEqual(latest);
      storageListeners[0]({ key: "nest.brain-dump-draft" });
      expect(dashboard.getBrainDumpDraft()).toBe(latest);
      expect(localStorage.setItem).not.toHaveBeenCalled();
      expect(localStorage.removeItem).not.toHaveBeenCalled();

      popup.setBrainDumpDraft({ text: "Edit from Popup", tagIds: [3] });
      channels[0].onmessage?.(delayedMessage);
      expect(dashboard.getBrainDumpDraft()).toEqual(popup.getBrainDumpDraft());

      popup.setBrainDumpDraft({ text: "", tagIds: [] });
      channels[0].onmessage?.(delayedMessage);
      channels[1].onmessage?.(delayedMessage);
      expect(dashboard.getBrainDumpDraft()).toEqual({ text: "", tagIds: [] });
      expect(popup.getBrainDumpDraft()).toEqual({ text: "", tagIds: [] });
      expect(storage.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

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

describe("historyIndexForDraftRevisionChange", () => {
  it("keeps browsing history while the revision is unchanged", () => {
    expect(historyIndexForDraftRevisionChange(1, "draft-a", "draft-a")).toBe(1);
    expect(historyIndexForDraftRevisionChange(-1, "draft-a", "draft-a")).toBe(-1);
  });

  it("returns to the live draft only when the underlying revision changes", () => {
    expect(historyIndexForDraftRevisionChange(1, "draft-a", "draft-b")).toBe(-1);
    expect(historyIndexForDraftRevisionChange(-1, "draft-a", "draft-b")).toBe(-1);
  });
});
