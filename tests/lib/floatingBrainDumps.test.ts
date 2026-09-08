import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isBrainDumpPeelShortcut,
  isBrainDumpSubmitShortcut,
} from "../../src/lib/brainDumpDraft";
import {
  clampFloatingPosition,
  createFloatingDumpWriter,
  createFloatingFromDraft,
  DEFAULT_FLOATING_STICKY_COLOR,
  FLOATING_BRAIN_DUMP_MIN_VISIBLE,
  FLOATING_BRAIN_DUMP_WIDTH,
  type FloatingBrainDump,
  nextCascadePosition,
  nextZIndex,
  parseFloatingBrainDump,
  parseFloatingStickyColor,
  reclampFloatingDumps,
} from "../../src/lib/floatingBrainDumps";

const enter = {
  key: "Enter",
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  isComposing: false,
};

describe("isBrainDumpPeelShortcut", () => {
  it("peels only on unmodified Shift+Enter", () => {
    expect(isBrainDumpPeelShortcut(enter)).toBe(false);
    expect(isBrainDumpSubmitShortcut(enter)).toBe(false);
    expect(isBrainDumpPeelShortcut({ ...enter, shiftKey: true })).toBe(true);
    expect(
      isBrainDumpPeelShortcut({ ...enter, shiftKey: true, metaKey: true }),
    ).toBe(false);
    expect(
      isBrainDumpPeelShortcut({
        ...enter,
        shiftKey: true,
        isComposing: true,
      }),
    ).toBe(false);
  });
});

describe("clampFloatingPosition", () => {
  it("allows notes to extend past the content column while keeping a sliver visible", () => {
    expect(clampFloatingPosition(0, 0, 400, 300)).toEqual({ x: 0, y: 16 });
    expect(clampFloatingPosition(999, 999, 400, 300)).toEqual({
      x: 400 - FLOATING_BRAIN_DUMP_MIN_VISIBLE,
      y: 300 - FLOATING_BRAIN_DUMP_MIN_VISIBLE,
    });
    expect(clampFloatingPosition(-999, 16, 400, 300)).toEqual({
      x: -FLOATING_BRAIN_DUMP_WIDTH + FLOATING_BRAIN_DUMP_MIN_VISIBLE,
      y: 16,
    });
    expect(clampFloatingPosition(-999, 16, 400, 300, 200)).toEqual({
      x: -200 + FLOATING_BRAIN_DUMP_MIN_VISIBLE,
      y: 16,
    });
  });
});

describe("nextCascadePosition", () => {
  it("offsets each new note and wraps near the viewport edge", () => {
    const first = nextCascadePosition([], 400, 300);
    expect(first).toEqual({ x: 96, y: 120 });

    const second = nextCascadePosition(
      [
        {
          id: "a",
          text: "one",
          tagIds: [],
          color: "paper",
          minimised: false,
          x: first.x,
          y: first.y,
          zIndex: 1,
        },
      ],
      400,
      300,
    );
    expect(second).toEqual({ x: 120, y: 144 });
  });
});

describe("nextZIndex", () => {
  it("returns one above the current top note", () => {
    expect(nextZIndex([])).toBe(1);
    expect(
      nextZIndex([
        {
          id: "a",
          text: "",
          tagIds: [],
          color: "paper",
          minimised: false,
          x: 0,
          y: 0,
          zIndex: 2,
        },
        {
          id: "b",
          text: "",
          tagIds: [],
          color: "sky",
          minimised: false,
          x: 0,
          y: 0,
          zIndex: 5,
        },
      ]),
    ).toBe(6);
  });
});

describe("createFloatingFromDraft", () => {
  it("creates a note from trimmed draft text", () => {
    const dump = createFloatingFromDraft(
      { text: "  Ideas  ", tagIds: [2] },
      [],
      400,
      300,
    );
    expect(dump).toMatchObject({
      text: "  Ideas  ",
      tagIds: [2],
      color: DEFAULT_FLOATING_STICKY_COLOR,
      minimised: false,
      x: 96,
      y: 120,
      zIndex: 1,
    });
    expect(dump?.id).toBeTruthy();
  });

  it("returns null for blank drafts", () => {
    expect(createFloatingFromDraft({ text: "   ", tagIds: [] }, [], 400, 300)).toBeNull();
  });
});

describe("reclampFloatingDumps", () => {
  it("pulls notes that fell fully off-screen back into view", () => {
    const dumps = [
      {
        id: "a",
        text: "note",
        tagIds: [],
        color: "paper" as const,
        minimised: false,
        x: 999,
        y: 999,
        zIndex: 1,
      },
    ];
    expect(reclampFloatingDumps(dumps, 400, 300)[0]).toMatchObject({
      x: 352,
      y: 252,
    });
  });
});

describe("createFloatingDumpWriter", () => {
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

  const note = (id: string): FloatingBrainDump => ({
    id,
    text: "note",
    tagIds: [],
    color: "paper",
    minimised: false,
    x: 0,
    y: 0,
    zIndex: 1,
  });

  const firePagehide = () => listeners.get("pagehide")?.forEach((fn) => fn());

  it("debounces rapid updates into one write", () => {
    const write = vi.fn();
    createFloatingDumpWriter(write, 200).update([note("a")]);
    vi.advanceTimersByTime(199);

    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith([note("a")]);
  });

  it("flushes the latest update synchronously on pagehide", () => {
    const write = vi.fn();
    createFloatingDumpWriter(write, 200).update([note("a")]);
    firePagehide();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith([note("a")]);

    vi.advanceTimersByTime(200);
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("flushes on dispose and stops listening for pagehide", () => {
    const write = vi.fn();
    const writer = createFloatingDumpWriter(write, 200);
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

describe("parseFloatingBrainDump", () => {
  it("rejects malformed stored notes", () => {
    expect(parseFloatingBrainDump(null)).toBeNull();
    expect(parseFloatingBrainDump({ id: 1 })).toBeNull();
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
    expect(parseFloatingBrainDump(base)).toMatchObject({
      color: "paper",
      minimised: false,
    });
    expect(parseFloatingBrainDump({ ...base, color: "lilac" })).toMatchObject({
      color: "lilac",
      minimised: false,
    });
    expect(
      parseFloatingBrainDump({ ...base, minimised: true }),
    ).toMatchObject({
      color: "paper",
      minimised: true,
    });
  });
});
