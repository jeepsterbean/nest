import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isNotePeelShortcut,
  isNoteSubmitShortcut,
} from "../../src/lib/noteDraft";
import {
  clampNoteToViewport,
  clampFloatingPosition,
  clampNoteBoardSize,
  DEFAULT_FLOATING_NOTE_BOARD,
  floatingNoteSizeForText,
  createFloatingNoteWriter,
  createFloatingFromDraft,
  DEFAULT_FLOATING_STICKY_COLOR,
  FLOATING_NOTE_HEIGHT,
  FLOATING_NOTE_MAX_HEIGHT,
  FLOATING_NOTE_MAX_WIDTH,
  FLOATING_NOTE_MIN_HEIGHT,
  FLOATING_NOTE_MINIMISED_HEIGHT,
  FLOATING_NOTE_MIN_WIDTH,
  FLOATING_NOTE_PADDING,
  FLOATING_NOTE_WIDTH,
  FLOATING_NOTE_BOARD_MIN_HEIGHT,
  FLOATING_NOTE_BOARD_MIN_WIDTH,
  type FloatingNote,
  nextCascadePosition,
  nextZIndex,
  parseFloatingNote,
  parseFloatingNoteBoard,
  parseFloatingStickyColor,
  pointInRect,
  readFloatingNotes,
  readFloatingNoteBoard,
  reclampFloatingNotes,
  reclampNoteBoard,
} from "../../src/lib/floatingNotes";

const enter = {
  key: "Enter",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
};

describe("floating draft storage migration", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("moves floating drafts and Note Board geometry to colon-prefixed keys", () => {
    const note = {
      id: "a",
      text: "note",
      tagIds: [],
      color: "paper",
      minimised: false,
      docked: false,
      x: 16,
      y: 16,
      zIndex: 1,
    };
    const storage = new Map([
      ["nest:floating-brain-dumps", JSON.stringify([note])],
      ["nest.floating-note-board", JSON.stringify(DEFAULT_FLOATING_NOTE_BOARD)],
    ]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    });

    expect(readFloatingNotes()).toEqual([note]);
    expect(readFloatingNoteBoard()).toEqual(DEFAULT_FLOATING_NOTE_BOARD);
    expect(storage.has("nest:floating-notes")).toBe(true);
    expect(storage.has("nest:floating-note-board")).toBe(true);
    expect(storage.has("nest:floating-brain-dumps")).toBe(false);
    expect(storage.has("nest.floating-note-board")).toBe(false);
  });
});

describe("isNotePeelShortcut", () => {
  it("peels only on unmodified Shift+Enter", () => {
    expect(isNotePeelShortcut(enter)).toBe(false);
    expect(isNoteSubmitShortcut(enter)).toBe(false);
    expect(isNotePeelShortcut({ ...enter, shiftKey: true })).toBe(true);
    expect(
      isNotePeelShortcut({ ...enter, shiftKey: true, metaKey: true }),
    ).toBe(false);
    expect(
      isNotePeelShortcut({
        ...enter,
        shiftKey: true,
        isComposing: true,
      }),
    ).toBe(false);
  });
});

describe("clampFloatingPosition", () => {
  it("keeps the whole note inside the board", () => {
    expect(clampFloatingPosition(0, 0, 900, 700)).toEqual({ x: 16, y: 16 });
    expect(clampFloatingPosition(999, 999, 900, 700)).toEqual({
      x: 900 - FLOATING_NOTE_WIDTH - FLOATING_NOTE_PADDING,
      y: 700 - FLOATING_NOTE_HEIGHT - FLOATING_NOTE_PADDING,
    });
    expect(clampFloatingPosition(999, 999, 900, 700, 200, 100)).toEqual({
      x: 900 - 200 - FLOATING_NOTE_PADDING,
      y: 700 - 100 - FLOATING_NOTE_PADDING,
    });
  });

  it("falls back to the top-left padding when the note is larger than the board", () => {
    expect(clampFloatingPosition(200, 200, 100, 100)).toEqual({ x: 16, y: 16 });
  });
});

describe("clampNoteToViewport", () => {
  it("clamps an expanded undock using the restored height, not the row height", () => {
    const note = {
      minimised: false,
      width: 280,
      height: 200,
    };
    expect(clampNoteToViewport(note, 16, 999, 900, 700)).toEqual({
      x: 16,
      y: 700 - 200 - FLOATING_NOTE_PADDING,
    });
  });

  it("clamps a minimised undock to the collapsed height", () => {
    const note = {
      minimised: true,
      width: 280,
      height: 200,
    };
    expect(clampNoteToViewport(note, 16, 999, 900, 700)).toEqual({
      x: 16,
      y: 700 - FLOATING_NOTE_MINIMISED_HEIGHT - FLOATING_NOTE_PADDING,
    });
  });
});

describe("floatingNoteSizeForText", () => {
  it("keeps a short note at the minimum size", () => {
    expect(floatingNoteSizeForText("Buy milk")).toEqual({
      width: FLOATING_NOTE_MIN_WIDTH,
      height: FLOATING_NOTE_MIN_HEIGHT,
    });
  });

  it("grows with the text and stops at the cap", () => {
    const medium = floatingNoteSizeForText(
      Array.from({ length: 10 }, () => "a line of thought").join("\n"),
    );
    expect(medium.height).toBeGreaterThan(FLOATING_NOTE_MIN_HEIGHT);
    expect(medium.height).toBeLessThan(FLOATING_NOTE_MAX_HEIGHT);

    expect(floatingNoteSizeForText("x".repeat(20000))).toEqual({
      width: FLOATING_NOTE_MAX_WIDTH,
      height: FLOATING_NOTE_MAX_HEIGHT,
    });
  });

  it("never exceeds the board", () => {
    const size = floatingNoteSizeForText("x".repeat(20000), 300, 260);
    expect(size).toEqual({ width: 268, height: 228 });
  });
});

describe("nextCascadePosition", () => {
  it("offsets each new note and wraps near the viewport edge", () => {
    const first = nextCascadePosition([], 900, 700);
    expect(first).toEqual({ x: 96, y: 120 });

    const second = nextCascadePosition(
      [
        {
          id: "a",
          text: "one",
          tagIds: [],
          color: "paper",
          minimised: false,
          docked: false,
          x: first.x,
          y: first.y,
          zIndex: 1,
        },
      ],
      900,
      700,
    );
    expect(second).toEqual({ x: 120, y: 144 });
  });
});

describe("nextZIndex", () => {
  it("returns one above the current top note", () => {
    expect(nextZIndex([])).toBe(1);
    expect(
      nextZIndex([{ zIndex: 2 }, { zIndex: 5 }]),
    ).toBe(6);
  });
});

describe("createFloatingFromDraft", () => {
  it("creates a note from trimmed draft text", () => {
    const note = createFloatingFromDraft(
      { text: "  Ideas  ", tagIds: [2] },
      [],
      900,
      700,
    );
    expect(note).toMatchObject({
      text: "  Ideas  ",
      tagIds: [2],
      color: DEFAULT_FLOATING_STICKY_COLOR,
      minimised: false,
      docked: false,
      x: 96,
      y: 120,
      zIndex: 1,
    });
    expect(note?.id).toBeTruthy();
  });

  it("returns null for blank drafts", () => {
    expect(createFloatingFromDraft({ text: "   ", tagIds: [] }, [], 900, 700)).toBeNull();
  });
});

describe("reclampFloatingNotes", () => {
  it("pulls notes that fell fully off-screen back into view", () => {
    const notes = [
      {
        id: "a",
        text: "note",
        tagIds: [],
        color: "paper" as const,
        minimised: false,
        docked: false,
        x: 999,
        y: 999,
        zIndex: 1,
      },
    ];
    expect(reclampFloatingNotes(notes, 900, 700)[0]).toMatchObject({
      x: 900 - FLOATING_NOTE_WIDTH - FLOATING_NOTE_PADDING,
      y: 700 - FLOATING_NOTE_HEIGHT - FLOATING_NOTE_PADDING,
    });
  });

  it("leaves docked notes where they were stored", () => {
    const notes = [
      {
        id: "a",
        text: "note",
        tagIds: [],
        color: "paper" as const,
        minimised: false,
        docked: true,
        x: 999,
        y: 999,
        zIndex: 1,
      },
    ];
    expect(reclampFloatingNotes(notes, 900, 700)[0]).toMatchObject({
      x: 999,
      y: 999,
    });
  });
});

describe("createFloatingNoteWriter", () => {
  let listeners: Map<string, Set<() => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    listeners = new Map();
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      addEventListener: (type: string, listener: () => void) => {
        const handlers = listeners.get(type) ?? new Set();
        handlers.add(listener);
        listeners.set(type, handlers);
      },
      removeEventListener: (type: string, listener: () => void) => {
        listeners.get(type)?.delete(listener);
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const note = (id: string): FloatingNote => ({
    id,
    text: "note",
    tagIds: [],
    color: "paper",
    minimised: false,
    docked: false,
    x: 0,
    y: 0,
    zIndex: 1,
  });

  const firePagehide = () => listeners.get("pagehide")?.forEach((fn) => fn());

  it("debounces rapid updates into one write", () => {
    const write = vi.fn();
    createFloatingNoteWriter(write, 200).update([note("a")]);
    vi.advanceTimersByTime(199);

    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith([note("a")]);
  });

  it("flushes the latest update synchronously on pagehide", () => {
    const write = vi.fn();
    createFloatingNoteWriter(write, 200).update([note("a")]);
    firePagehide();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith([note("a")]);

    vi.advanceTimersByTime(200);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flushes on dispose and stops listening for pagehide", () => {
    const write = vi.fn();
    const writer = createFloatingNoteWriter(write, 200);
    writer.update([note("a")]);
    writer.dispose();

    expect(write).toHaveBeenCalledTimes(1);
    expect(listeners.get("pagehide")?.size).toBe(0);
  });
});

describe("parseFloatingStickyColor", () => {
  it("accepts known ids and falls back to paper", () => {
    expect(parseFloatingStickyColor("sage")).toBe("sage");
    expect(parseFloatingStickyColor("neon")).toBe(DEFAULT_FLOATING_STICKY_COLOR);
    expect(parseFloatingStickyColor(undefined)).toBe(
      DEFAULT_FLOATING_STICKY_COLOR,
    );
  });
});

describe("parseFloatingNote", () => {
  it("rejects malformed stored notes", () => {
    expect(parseFloatingNote(null)).toBeNull();
    expect(parseFloatingNote({ id: 1 })).toBeNull();
  });

  it("defaults missing color to paper and keeps a valid color", () => {
    const base = {
      id: "a",
      text: "note",
      tagIds: [1],
      x: 10,
      y: 20,
      zIndex: 1,
    };
    expect(parseFloatingNote(base)).toMatchObject({
      color: "paper",
      minimised: false,
      docked: false,
    });
    expect(parseFloatingNote({ ...base, color: "lilac" })).toMatchObject({
      color: "lilac",
      minimised: false,
    });
    expect(
      parseFloatingNote({ ...base, minimised: true }),
    ).toMatchObject({
      color: "paper",
      minimised: true,
    });
    expect(
      parseFloatingNote({ ...base, docked: true }),
    ).toMatchObject({
      docked: true,
    });
  });
});

describe("pointInRect", () => {
  it("includes the edge and rejects points outside", () => {
    const rect = { left: 10, top: 20, right: 40, bottom: 50 };
    expect(pointInRect(10, 20, rect)).toBe(true);
    expect(pointInRect(40, 50, rect)).toBe(true);
    expect(pointInRect(9, 30, rect)).toBe(false);
    expect(pointInRect(25, 51, rect)).toBe(false);
  });
});

describe("parseFloatingNoteBoard", () => {
  it("rejects malformed stored boards", () => {
    expect(parseFloatingNoteBoard(null)).toBeNull();
    expect(parseFloatingNoteBoard({ x: 1 })).toBeNull();
  });

  it("reads geometry and defaults minimised off", () => {
    expect(
      parseFloatingNoteBoard({
        x: 16,
        y: 64,
        width: 280,
        height: 200,
        zIndex: 0,
      }),
    ).toEqual({
      x: 16,
      y: 64,
      width: 280,
      height: 200,
      minimised: false,
      zIndex: 0,
    });
    expect(
      parseFloatingNoteBoard({
        ...DEFAULT_FLOATING_NOTE_BOARD,
        minimised: true,
      }),
    ).toMatchObject({ minimised: true });
  });
});

describe("reclampNoteBoard", () => {
  it("keeps a minimised board's stored height while clamping it on screen", () => {
    const next = reclampNoteBoard(
      {
        x: 999,
        y: 999,
        width: 280,
        height: 200,
        minimised: true,
        zIndex: 0,
      },
      900,
      700,
    );
    expect(next.height).toBe(200);
    expect(next.x).toBe(900 - 280 - FLOATING_NOTE_PADDING);
    expect(next.y).toBe(
      700 - FLOATING_NOTE_MINIMISED_HEIGHT - FLOATING_NOTE_PADDING,
    );
  });
});

describe("clampNoteBoardSize", () => {
  it("stops at the minimum expanded size", () => {
    expect(
      clampNoteBoardSize(10, 10, 16, 64, 900, 700, false),
    ).toEqual({
      width: FLOATING_NOTE_BOARD_MIN_WIDTH,
      height: FLOATING_NOTE_BOARD_MIN_HEIGHT,
    });
  });
});
