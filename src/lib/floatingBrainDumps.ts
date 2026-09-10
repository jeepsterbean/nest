import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { BrainDumpDraft } from "./brainDumpDraft";
import { trimBrainDumpHtml } from "./brainDumpRichText";

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
/** Keep at least this much of a note visible when parked off-screen. */
export const FLOATING_BRAIN_DUMP_MIN_VISIBLE = 48;
export const FLOATING_BRAIN_DUMP_LAYER_BASE = 200;

export function floatingBrainDumpStackZIndex(zIndex: number) {
  return FLOATING_BRAIN_DUMP_LAYER_BASE + zIndex;
}

export function clampFloatingPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  noteWidth = FLOATING_BRAIN_DUMP_WIDTH,
): { x: number; y: number } {
  const minX = -noteWidth + FLOATING_BRAIN_DUMP_MIN_VISIBLE;
  const maxX = viewportWidth - FLOATING_BRAIN_DUMP_MIN_VISIBLE;
  const minY = FLOATING_BRAIN_DUMP_PADDING;
  const maxY = Math.max(
    minY,
    viewportHeight - FLOATING_BRAIN_DUMP_MIN_VISIBLE,
  );
  return {
    x: Math.min(Math.max(x, minX), maxX),
    y: Math.min(Math.max(y, minY), maxY),
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
): { x: number; y: number } {
  const last = dumps[dumps.length - 1];
  if (!last) {
    return clampFloatingPosition(96, 120, viewportWidth, viewportHeight);
  }
  const maxX = viewportWidth - FLOATING_BRAIN_DUMP_MIN_VISIBLE;
  let x = last.x + FLOATING_BRAIN_DUMP_CASCADE;
  let y = last.y + FLOATING_BRAIN_DUMP_CASCADE;
  if (x > maxX) {
    x = 96;
    y = last.y + FLOATING_BRAIN_DUMP_CASCADE;
  }
  return clampFloatingPosition(x, y, viewportWidth, viewportHeight);
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
  const { x, y } = nextCascadePosition(existing, viewportWidth, viewportHeight);
  return {
    id: createFloatingBrainDumpId(),
    text: draft.text,
    tagIds: [...draft.tagIds],
    color: DEFAULT_FLOATING_STICKY_COLOR,
    minimised: false,
    x,
    y,
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
