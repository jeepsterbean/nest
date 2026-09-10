import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { BrainDumpDraft } from "./brainDumpDraft";
import {
  brainDumpHtmlToPlainText,
  trimBrainDumpHtml,
} from "./brainDumpRichText";

/** Calm paper tints for floating stickies (Nest journal palette). */
export const FLOATING_STICKY_COLORS = [
  { id: "paper", label: "Paper" },
  { id: "blush", label: "Blush" },
  { id: "sage", label: "Sage" },
  { id: "sky", label: "Sky" },
  { id: "lilac", label: "Lilac" },
] as const;

export type FloatingStickyColor = (typeof FLOATING_STICKY_COLORS)[number]["id"];

export const DEFAULT_FLOATING_STICKY_COLOR: FloatingStickyColor = "paper";

export function parseFloatingStickyColor(
  value: unknown,
): FloatingStickyColor {
  if (
    typeof value === "string" &&
    FLOATING_STICKY_COLORS.some((color) => color.id === value)
  ) {
    return value as FloatingStickyColor;
  }
  return DEFAULT_FLOATING_STICKY_COLOR;
}

export type FloatingBrainDump = {
  id: string;
  text: string;
  tagIds: number[];
  color: FloatingStickyColor;
  minimised: boolean;
  x: number;
  y: number;
  zIndex: number;
  width?: number;
  height?: number;
};

export const FLOATING_BRAIN_DUMP_STORAGE_KEY = "nest.floating-brain-dumps";
export const FLOATING_BRAIN_DUMP_WIDTH = 280;
export const FLOATING_BRAIN_DUMP_HEIGHT = 200;
export const FLOATING_BRAIN_DUMP_PADDING = 16;
export const FLOATING_BRAIN_DUMP_CASCADE = 24;
/** Collapsed note height, used to keep minimised notes inside the board. */
export const FLOATING_BRAIN_DUMP_MINIMISED_HEIGHT = 36;
export const FLOATING_BRAIN_DUMP_LAYER_BASE = 200;
export const FLOATING_BRAIN_DUMP_MIN_WIDTH = 220;
export const FLOATING_BRAIN_DUMP_MIN_HEIGHT = 168;
export const FLOATING_BRAIN_DUMP_MAX_WIDTH = 460;
export const FLOATING_BRAIN_DUMP_MAX_HEIGHT = 460;

/** Text metrics of the floating surface: 0.9rem body text at line-height 1.35. */
const FLOATING_TEXT_CHAR_WIDTH = 7.2;
const FLOATING_TEXT_LINE_HEIGHT = 19.5;
/** Header, tag row and text padding: the note space that never holds a line. */
const FLOATING_TEXT_CHROME = 92;
const FLOATING_TEXT_SIDE_PADDING = 24;

function clampRange(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

// ponytail: character counts, not real font metrics — swap in canvas
// measureText if proportional text makes notes visibly mis-sized.
/** Sizes a new note to its text so short notes stay small and long ones open
 * readable, up to a cap that still leaves the board usable. */
export function floatingBrainDumpSizeForText(
  text: string,
  viewportWidth = Number.POSITIVE_INFINITY,
  viewportHeight = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
  const lines = brainDumpHtmlToPlainText(text).split("\n");
  const longestLine = Math.max(0, ...lines.map((line) => line.length));
  const maxWidth = Math.min(
    FLOATING_BRAIN_DUMP_MAX_WIDTH,
    viewportWidth - FLOATING_BRAIN_DUMP_PADDING * 2,
  );
  const width = clampRange(
    Math.ceil(longestLine * FLOATING_TEXT_CHAR_WIDTH + FLOATING_TEXT_SIDE_PADDING),
    FLOATING_BRAIN_DUMP_MIN_WIDTH,
    maxWidth,
  );
  const charsPerLine = Math.max(
    1,
    Math.floor((width - FLOATING_TEXT_SIDE_PADDING) / FLOATING_TEXT_CHAR_WIDTH),
  );
  const wrappedLines = lines.reduce(
    (total, line) => total + Math.max(1, Math.ceil(line.length / charsPerLine)),
    0,
  );
  const height = clampRange(
    Math.ceil(wrappedLines * FLOATING_TEXT_LINE_HEIGHT + FLOATING_TEXT_CHROME),
    FLOATING_BRAIN_DUMP_MIN_HEIGHT,
    Math.min(
      FLOATING_BRAIN_DUMP_MAX_HEIGHT,
      viewportHeight - FLOATING_BRAIN_DUMP_PADDING * 2,
    ),
  );
  return { width, height };
}

export function floatingBrainDumpStackZIndex(zIndex: number) {
  return FLOATING_BRAIN_DUMP_LAYER_BASE + zIndex;
}

/** Notes stay wholly inside the board, so no part can be dragged out of sight. */
export function clampFloatingPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  noteWidth = FLOATING_BRAIN_DUMP_WIDTH,
  noteHeight = FLOATING_BRAIN_DUMP_HEIGHT,
): { x: number; y: number } {
  const min = FLOATING_BRAIN_DUMP_PADDING;
  const maxX = Math.max(min, viewportWidth - noteWidth - min);
  const maxY = Math.max(min, viewportHeight - noteHeight - min);
  return {
    x: Math.min(Math.max(x, min), maxX),
    y: Math.min(Math.max(y, min), maxY),
  };
}

export function nextZIndex(dumps: FloatingBrainDump[]): number {
  if (dumps.length === 0) return 1;
  return Math.max(...dumps.map((dump) => dump.zIndex)) + 1;
}

export function nextCascadePosition(
  dumps: FloatingBrainDump[],
  viewportWidth: number,
  viewportHeight: number,
  noteWidth = FLOATING_BRAIN_DUMP_WIDTH,
  noteHeight = FLOATING_BRAIN_DUMP_HEIGHT,
): { x: number; y: number } {
  const clamp = (x: number, y: number) =>
    clampFloatingPosition(x, y, viewportWidth, viewportHeight, noteWidth, noteHeight);
  const last = dumps[dumps.length - 1];
  if (!last) {
    return clamp(96, 120);
  }
  const maxX = viewportWidth - noteWidth - FLOATING_BRAIN_DUMP_PADDING;
  let x = last.x + FLOATING_BRAIN_DUMP_CASCADE;
  let y = last.y + FLOATING_BRAIN_DUMP_CASCADE;
  if (x > maxX) {
    x = 96;
    y = last.y + FLOATING_BRAIN_DUMP_CASCADE;
  }
  return clamp(x, y);
}

export function reclampFloatingDumps(
  dumps: FloatingBrainDump[],
  viewportWidth: number,
  viewportHeight: number,
): FloatingBrainDump[] {
  return dumps.map((dump) => ({
    ...dump,
    ...clampFloatingPosition(
      dump.x,
      dump.y,
      viewportWidth,
      viewportHeight,
      dump.width ?? FLOATING_BRAIN_DUMP_WIDTH,
      dump.minimised
        ? FLOATING_BRAIN_DUMP_MINIMISED_HEIGHT
        : dump.height ?? FLOATING_BRAIN_DUMP_HEIGHT,
    ),
  }));
}

function positionsChanged(
  before: FloatingBrainDump[],
  after: FloatingBrainDump[],
): boolean {
  return after.some(
    (dump, index) =>
      dump.x !== before[index]?.x || dump.y !== before[index]?.y,
  );
}

export function readFloatingBrainDumps(): FloatingBrainDump[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(
      window.localStorage.getItem(FLOATING_BRAIN_DUMP_STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(stored)) return [];
    return stored
      .map(parseFloatingBrainDump)
      .filter((dump): dump is FloatingBrainDump => dump !== null);
  } catch {
    return [];
  }
}

export function parseFloatingBrainDump(value: unknown): FloatingBrainDump | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string") return null;
  if (typeof record.text !== "string") return null;
  if (!Array.isArray(record.tagIds)) return null;
  const tagIds = record.tagIds.filter(
    (id): id is number => typeof id === "number" && Number.isInteger(id),
  );
  if (
    typeof record.x !== "number" ||
    typeof record.y !== "number" ||
    typeof record.zIndex !== "number"
  ) {
    return null;
  }
  const dump: FloatingBrainDump = {
    id: record.id,
    text: record.text,
    tagIds,
    color: parseFloatingStickyColor(record.color),
    minimised: record.minimised === true,
    x: record.x,
    y: record.y,
    zIndex: record.zIndex,
  };
  if (typeof record.width === "number") dump.width = record.width;
  if (typeof record.height === "number") dump.height = record.height;
  return dump;
}

export function writeFloatingBrainDumps(dumps: FloatingBrainDump[]) {
  if (typeof window === "undefined") return;
  try {
    if (dumps.length) {
      window.localStorage.setItem(
        FLOATING_BRAIN_DUMP_STORAGE_KEY,
        JSON.stringify(dumps),
      );
    } else {
      window.localStorage.removeItem(FLOATING_BRAIN_DUMP_STORAGE_KEY);
    }
  } catch {
    // Keep in-memory state working when storage is unavailable.
  }
}

/** Debounces localStorage writes but flushes synchronously on pagehide/unmount,
 * since a clean dashboard close hides the webview without unmounting it. */
export function createFloatingDumpWriter(
  write: (dumps: FloatingBrainDump[]) => void,
  delayMs = 200,
) {
  let latest: FloatingBrainDump[] = [];
  let timeout: ReturnType<typeof window.setTimeout> | undefined;

  const flush = () => {
    if (timeout !== undefined) window.clearTimeout(timeout);
    timeout = undefined;
    write(latest);
  };

  window.addEventListener("pagehide", flush);

  return {
    update(dumps: FloatingBrainDump[]) {
      latest = dumps;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(flush, delayMs);
    },
    dispose() {
      window.removeEventListener("pagehide", flush);
      flush();
    },
  };
}

export function createFloatingBrainDumpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `floating-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createFloatingFromDraft(
  draft: BrainDumpDraft,
  existing: FloatingBrainDump[],
  viewportWidth: number,
  viewportHeight: number,
): FloatingBrainDump | null {
  const text = trimBrainDumpHtml(draft.text);
  if (!text) return null;
  const { width, height } = floatingBrainDumpSizeForText(
    draft.text,
    viewportWidth,
    viewportHeight,
  );
  const { x, y } = nextCascadePosition(
    existing,
    viewportWidth,
    viewportHeight,
    width,
    height,
  );
  return {
    id: createFloatingBrainDumpId(),
    text: draft.text,
    tagIds: [...draft.tagIds],
    color: DEFAULT_FLOATING_STICKY_COLOR,
    minimised: false,
    x,
    y,
    width,
    height,
    zIndex: nextZIndex(existing),
  };
}

export function useFloatingBrainDumps() {
  const [dumps, setDumps] = useState<FloatingBrainDump[]>(() =>
    readFloatingBrainDumps(),
  );
  const [hidden, setHidden] = useState(false);
  const writerRef = useRef<ReturnType<typeof createFloatingDumpWriter> | null>(
    null,
  );
  if (!writerRef.current) {
    writerRef.current = createFloatingDumpWriter(writeFloatingBrainDumps);
  }

  useEffect(() => {
    writerRef.current!.update(dumps);
  }, [dumps]);

  useEffect(() => () => writerRef.current!.dispose(), []);

  const updateDump = useCallback(
    (id: string, patch: Partial<Omit<FloatingBrainDump, "id">>) => {
      setDumps((current) =>
        current.map((dump) =>
          dump.id === id ? { ...dump, ...patch } : dump,
        ),
      );
    },
    [],
  );

  const removeDump = useCallback((id: string) => {
    setDumps((current) => current.filter((dump) => dump.id !== id));
  }, []);

  const addDump = useCallback((dump: FloatingBrainDump) => {
    setDumps((current) => [...current, dump]);
    // A new sticky must never land in the void: creating one reveals the board.
    setHidden(false);
  }, []);

  const toggleHidden = useCallback(() => {
    setHidden((isHidden) => !isHidden);
  }, []);

  const bringToFront = useCallback((id: string) => {
    setDumps((current) => {
      const zIndex = nextZIndex(current);
      return current.map((dump) =>
        dump.id === id ? { ...dump, zIndex } : dump,
      );
    });
  }, []);

  const reclampToBoard = useCallback(
    (viewportWidth: number, viewportHeight: number) => {
      if (viewportWidth <= 0 || viewportHeight <= 0) return;
      setDumps((current) => {
        const next = reclampFloatingDumps(
          current,
          viewportWidth,
          viewportHeight,
        );
        if (!positionsChanged(current, next)) return current;
        return next;
      });
    },
    [],
  );

  return {
    dumps,
    hidden,
    toggleHidden,
    addDump,
    updateDump,
    removeDump,
    bringToFront,
    reclampToBoard,
  };
}

export function useViewportSize(onResize: (width: number, height: number) => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const measure = () => {
      onResize(window.innerWidth, window.innerHeight);
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [onResize]);
}
