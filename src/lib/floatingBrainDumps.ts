import {
  useCallback,
  useEffect,
  useState,
} from "react";
import type { BrainDumpDraft } from "./brainDumpDraft";

export type FloatingBrainDump = {
  id: string;
  text: string;
  tagIds: number[];
  x: number;
  y: number;
  zIndex: number;
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
): { x: number; y: number } {
  const minX = -FLOATING_BRAIN_DUMP_WIDTH + FLOATING_BRAIN_DUMP_MIN_VISIBLE;
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
    ...clampFloatingPosition(dump.x, dump.y, viewportWidth, viewportHeight),
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
  return {
    id: record.id,
    text: record.text,
    tagIds,
    x: record.x,
    y: record.y,
    zIndex: record.zIndex,
  };
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
  const text = draft.text.trim();
  if (!text) return null;
  const { x, y } = nextCascadePosition(existing, viewportWidth, viewportHeight);
  return {
    id: createFloatingBrainDumpId(),
    text: draft.text,
    tagIds: [...draft.tagIds],
    x,
    y,
    zIndex: nextZIndex(existing),
  };
}

export function useFloatingBrainDumps() {
  const [dumps, setDumps] = useState<FloatingBrainDump[]>(() =>
    readFloatingBrainDumps(),
  );

  const updateDump = useCallback(
    (id: string, patch: Partial<Omit<FloatingBrainDump, "id">>) => {
      setDumps((current) => {
        const next = current.map((dump) =>
          dump.id === id ? { ...dump, ...patch } : dump,
        );
        writeFloatingBrainDumps(next);
        return next;
      });
    },
    [],
  );

  const removeDump = useCallback((id: string) => {
    setDumps((current) => {
      const next = current.filter((dump) => dump.id !== id);
      writeFloatingBrainDumps(next);
      return next;
    });
  }, []);

  const addDump = useCallback((dump: FloatingBrainDump) => {
    setDumps((current) => {
      const next = [...current, dump];
      writeFloatingBrainDumps(next);
      return next;
    });
  }, []);

  const bringToFront = useCallback((id: string) => {
    setDumps((current) => {
      const zIndex = nextZIndex(current);
      const next = current.map((dump) =>
        dump.id === id ? { ...dump, zIndex } : dump,
      );
      writeFloatingBrainDumps(next);
      return next;
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
        writeFloatingBrainDumps(next);
        return next;
      });
    },
    [],
  );

  return {
    dumps,
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
