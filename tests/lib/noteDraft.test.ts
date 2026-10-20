import { describe, expect, it, vi } from "vitest";
import {
  adjacentNoteIndex,
  clearNoteDraftIfUnchanged,
  noteHistoryDirection,
  getNoteDraft,
  historyIndexForDraftRevisionChange,
  isNoteSubmitShortcut,
  setNoteDraft,
  trimNoteDraft,
} from "../../src/lib/noteDraft";

describe("adjacentNoteIndex", () => {
  it("moves between the current draft and at most five saved notes", () => {
    expect(adjacentNoteIndex(-1, 1, 5)).toBe(0);
    expect(adjacentNoteIndex(4, 1, 5)).toBe(4);
    expect(adjacentNoteIndex(0, -1, 5)).toBe(-1);
    expect(adjacentNoteIndex(-1, -1, 5)).toBe(-1);
  });
});

describe("noteHistoryDirection", () => {
  it("maps modified brackets to note history navigation", () => {
    expect(
      noteHistoryDirection({ key: "[", metaKey: true, ctrlKey: false }),
    ).toBe(1);
    expect(
      noteHistoryDirection({ key: "]", metaKey: false, ctrlKey: true }),
    ).toBe(-1);
    expect(
      noteHistoryDirection({ key: "[", metaKey: false, ctrlKey: false }),
    ).toBeNull();
  });
});

const enter = {
  key: "Enter",
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
};

describe("isNoteSubmitShortcut", () => {
  it("submits only modified Enter presses", () => {
    expect(isNoteSubmitShortcut(enter)).toBe(false);
    expect(isNoteSubmitShortcut({ ...enter, metaKey: true })).toBe(true);
    expect(isNoteSubmitShortcut({ ...enter, ctrlKey: true })).toBe(true);
    expect(
      isNoteSubmitShortcut({ ...enter, metaKey: true, isComposing: true }),
    ).toBe(false);
  });
});

describe("trimNoteDraft", () => {
  it("trims the shared body", () => {
    expect(trimNoteDraft({ text: "  Details  ", tagIds: [] })).toBe("Details");
  });
});

describe("setNoteDraft", () => {
  it("moves brain-dump draft values to the note storage keys", async () => {
    const storage = new Map([
      ["nest:brain-dump-draft", "Remember this"],
      ["nest:brain-dump-draft-tags", "[2,3]"],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });
    try {
      vi.resetModules();
      const draft = await import("../../src/lib/noteDraft");

      expect(draft.getNoteDraft()).toEqual({
        text: "Remember this",
        tagIds: [2, 3],
      });
      expect(storage.get("nest:note-draft")).toBe("Remember this");
      expect(storage.get("nest:note-draft-tags")).toBe("[2,3]");
      expect(storage.has("nest:brain-dump-draft")).toBe(false);
      expect(storage.has("nest:brain-dump-draft-tags")).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

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
      const dashboard = await import("../../src/lib/noteDraft");
      dashboard.setNoteDraft({ text: "", tagIds: [] });
      vi.resetModules();
      const popup = await import("../../src/lib/noteDraft");
      popup.setNoteDraft({ text: "", tagIds: [] });
      channels[0].postMessage.mockClear();

      dashboard.setNoteDraft({ text: "First edit", tagIds: [1] });
      const delayedMessage = { data: channels[0].postMessage.mock.calls[0][0] };
      dashboard.setNoteDraft({ text: "Second edit", tagIds: [2] });
      const latest = dashboard.getNoteDraft();
      localStorage.setItem.mockClear();
      localStorage.removeItem.mockClear();

      channels[1].onmessage?.(delayedMessage);
      expect(popup.getNoteDraft()).toEqual(latest);
      storageListeners[0]({ key: "nest:note-draft" });
      expect(dashboard.getNoteDraft()).toBe(latest);
      expect(localStorage.setItem).not.toHaveBeenCalled();
      expect(localStorage.removeItem).not.toHaveBeenCalled();

      popup.setNoteDraft({ text: "Edit from Popup", tagIds: [3] });
      channels[0].onmessage?.(delayedMessage);
      expect(dashboard.getNoteDraft()).toEqual(popup.getNoteDraft());

      popup.setNoteDraft({ text: "", tagIds: [] });
      channels[0].onmessage?.(delayedMessage);
      channels[1].onmessage?.(delayedMessage);
      expect(dashboard.getNoteDraft()).toEqual({ text: "", tagIds: [] });
      expect(popup.getNoteDraft()).toEqual({ text: "", tagIds: [] });
      expect(storage.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it("ignores writes that change nothing, so listeners stay asleep", () => {
    setNoteDraft({ text: "Ideas", tagIds: [1, 2] });
    const stored = getNoteDraft();

    setNoteDraft({ text: "Ideas", tagIds: [1, 2] });
    expect(getNoteDraft()).toBe(stored);

    setNoteDraft({ text: "Ideas", tagIds: [2, 1] });
    expect(getNoteDraft()).not.toBe(stored);

    setNoteDraft({ text: "", tagIds: [] });
  });
});

describe("clearNoteDraftIfUnchanged", () => {
  it.each([
    { text: "New text from Popup", tagIds: [1] },
    { text: "Remember", tagIds: [1, 4] },
  ])("keeps a Popup edit before sync arrives: %j", async (newer) => {
    const storage = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
    const removeItem = vi.fn((key: string) => storage.delete(key));
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem,
        removeItem,
      },
      addEventListener: () => {},
    });
    vi.stubGlobal("BroadcastChannel", undefined);
    try {
      vi.resetModules();
      const dashboard = await import("../../src/lib/noteDraft");
      const submitted = { text: "Remember", tagIds: [1] };
      dashboard.setNoteDraft(submitted);
      vi.resetModules();
      const popup = await import("../../src/lib/noteDraft");
      popup.setNoteDraft(newer);
      expect(dashboard.getNoteDraft()).toEqual(submitted);
      setItem.mockClear();
      removeItem.mockClear();

      dashboard.clearNoteDraftIfUnchanged(submitted);

      expect(dashboard.getNoteDraft()).toEqual(newer);
      expect(popup.getNoteDraft()).toEqual(newer);
      expect(storage.get("nest:note-draft")).toBe(newer.text);
      expect(storage.get("nest:note-draft-tags")).toBe(JSON.stringify(newer.tagIds));
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it("uses the in-memory draft when storage is unavailable", async () => {
    const unavailable = () => { throw new Error("Storage unavailable"); };
    vi.stubGlobal("window", {
      localStorage: { getItem: unavailable, setItem: unavailable, removeItem: unavailable },
      addEventListener: () => {},
    });
    vi.stubGlobal("BroadcastChannel", undefined);
    try {
      vi.resetModules();
      const draft = await import("../../src/lib/noteDraft");
      const submitted = { text: "Remember", tagIds: [1] };
      draft.setNoteDraft(submitted);
      const newer = { text: "Remember this", tagIds: [1] };
      draft.setNoteDraft(newer);
      draft.clearNoteDraftIfUnchanged(submitted);
      expect(draft.getNoteDraft()).toEqual(newer);
      draft.clearNoteDraftIfUnchanged(newer);
      expect(draft.getNoteDraft()).toEqual({ text: "", tagIds: [] });
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it("clears the draft when its text and tags still match the saved snapshot", () => {
    const submitted = { text: "Remember", tagIds: [1, 2] };
    setNoteDraft(submitted);
    clearNoteDraftIfUnchanged(submitted);
    expect(getNoteDraft()).toEqual({ text: "", tagIds: [] });
  });

  it("keeps text typed while the save was in flight", () => {
    const submitted = { text: "Remember", tagIds: [1] };
    setNoteDraft(submitted);
    setNoteDraft({ text: "Remember this", tagIds: [1] });
    clearNoteDraftIfUnchanged(submitted);
    expect(getNoteDraft()).toEqual({ text: "Remember this", tagIds: [1] });
    setNoteDraft({ text: "", tagIds: [] });
  });

  it("keeps a tag change made while the save was in flight", () => {
    const submitted = { text: "Remember", tagIds: [1] };
    setNoteDraft(submitted);
    setNoteDraft({ text: "Remember", tagIds: [1, 4] });
    clearNoteDraftIfUnchanged(submitted);
    expect(getNoteDraft()).toEqual({ text: "Remember", tagIds: [1, 4] });
    setNoteDraft({ text: "", tagIds: [] });
  });

  it("does not write storage again when newer edits should stay", async () => {
    const storage = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => storage.set(key, value));
    const removeItem = vi.fn((key: string) => storage.delete(key));
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem,
        removeItem,
      },
      addEventListener: () => {},
    });
    try {
      vi.resetModules();
      const draft = await import("../../src/lib/noteDraft");
      const submitted = { text: "Remember", tagIds: [1] };
      draft.setNoteDraft(submitted);
      draft.setNoteDraft({ text: "Remember this", tagIds: [1] });
      setItem.mockClear();
      removeItem.mockClear();
      draft.clearNoteDraftIfUnchanged(submitted);
      expect(draft.getNoteDraft()).toEqual({
        text: "Remember this",
        tagIds: [1],
      });
      expect(setItem).not.toHaveBeenCalled();
      expect(removeItem).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
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
