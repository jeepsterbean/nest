import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { NoteDraft } from "./noteDraft";
import {
  noteHtmlToPlainText,
  trimNoteHtml,
} from "./noteRichText";
import { readMigratedStorageValue } from "./storageKeyMigration";

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

export type FloatingNote = {
  id: string;
  text: string;
  tagIds: number[];
  color: FloatingStickyColor;
  minimised: boolean;
  /** In the Note Board list. Does not change minimised; drag out to leave. */
  docked: boolean;
  x: number;
  y: number;
  zIndex: number;
  width?: number;
  height?: number;
};

export type FloatingNoteBoard = {
  x: number;
  y: number;
  width: number;
  height: number;
  minimised: boolean;
  zIndex: number;
};

export const FLOATING_NOTE_STORAGE_KEY = "nest:floating-notes";
export const FLOATING_NOTE_BOARD_STORAGE_KEY = "nest:floating-note-board";
// Newest first: floating notes lived under brain-dump names before Notes.
const LEGACY_FLOATING_NOTE_STORAGE_KEYS = [
  "nest:floating-brain-dumps",
  "nest.floating-brain-dumps",
];
const LEGACY_FLOATING_NOTE_BOARD_STORAGE_KEYS = ["nest.floating-note-board"];
export const FLOATING_NOTE_WIDTH = 280;
export const FLOATING_NOTE_HEIGHT = 200;
export const FLOATING_NOTE_PADDING = 16;
export const FLOATING_NOTE_CASCADE = 24;
/** Collapsed note height, used to keep minimised notes inside the board. */
export const FLOATING_NOTE_MINIMISED_HEIGHT = 36;
export const FLOATING_NOTE_LAYER_BASE = 200;
export const FLOATING_NOTE_MIN_WIDTH = 220;
export const FLOATING_NOTE_MIN_HEIGHT = 168;
export const FLOATING_NOTE_MAX_WIDTH = 460;
export const FLOATING_NOTE_MAX_HEIGHT = 460;
export const FLOATING_NOTE_BOARD_MIN_WIDTH = FLOATING_NOTE_MIN_WIDTH;
/** Header plus one row, so an empty expanded board still has a drop well. */
export const FLOATING_NOTE_BOARD_MIN_HEIGHT = 88;

export const DEFAULT_FLOATING_NOTE_BOARD: FloatingNoteBoard = {
  x: FLOATING_NOTE_PADDING,
  y: 64,
  width: FLOATING_NOTE_WIDTH,
  height: 200,
  minimised: false,
  zIndex: 0,
};

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
export function floatingNoteSizeForText(
  text: string,
  viewportWidth = Number.POSITIVE_INFINITY,
  viewportHeight = Number.POSITIVE_INFINITY,
): { width: number; height: number } {
  const lines = noteHtmlToPlainText(text).split("\n");
  const longestLine = Math.max(0, ...lines.map((line) => line.length));
  const maxWidth = Math.min(
    FLOATING_NOTE_MAX_WIDTH,
    viewportWidth - FLOATING_NOTE_PADDING * 2,
  );
  const width = clampRange(
    Math.ceil(longestLine * FLOATING_TEXT_CHAR_WIDTH + FLOATING_TEXT_SIDE_PADDING),
    FLOATING_NOTE_MIN_WIDTH,
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
    FLOATING_NOTE_MIN_HEIGHT,
    Math.min(
      FLOATING_NOTE_MAX_HEIGHT,
      viewportHeight - FLOATING_NOTE_PADDING * 2,
    ),
  );
  return { width, height };
}

export function floatingNoteStackZIndex(zIndex: number) {
  return FLOATING_NOTE_LAYER_BASE + zIndex;
}

export function noteBoardDisplayHeight(board: FloatingNoteBoard) {
  return board.minimised
    ? FLOATING_NOTE_MINIMISED_HEIGHT
    : board.height;
}

export function pointInRect(
  x: number,
  y: number,
  rect: { left: number; top: number; right: number; bottom: number },
) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function clampNoteBoardSize(
  width: number,
  height: number,
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  minimised: boolean,
) {
  const maxWidth = Math.max(
    FLOATING_NOTE_BOARD_MIN_WIDTH,
    viewportWidth - x - FLOATING_NOTE_PADDING,
  );
  const minHeight = minimised
    ? FLOATING_NOTE_MINIMISED_HEIGHT
    : FLOATING_NOTE_BOARD_MIN_HEIGHT;
  const maxHeight = minimised
    ? FLOATING_NOTE_MINIMISED_HEIGHT
    : Math.max(
        FLOATING_NOTE_BOARD_MIN_HEIGHT,
        viewportHeight - y - FLOATING_NOTE_PADDING,
      );
  return {
    width: clampRange(width, FLOATING_NOTE_BOARD_MIN_WIDTH, maxWidth),
    height: clampRange(height, minHeight, maxHeight),
  };
}

export function reclampNoteBoard(
  board: FloatingNoteBoard,
  viewportWidth: number,
  viewportHeight: number,
): FloatingNoteBoard {
  const displayHeight = noteBoardDisplayHeight(board);
  const pos = clampFloatingPosition(
    board.x,
    board.y,
    viewportWidth,
    viewportHeight,
    board.width,
    displayHeight,
  );
  const size = clampNoteBoardSize(
    board.width,
    displayHeight,
    pos.x,
    pos.y,
    viewportWidth,
    viewportHeight,
    board.minimised,
  );
  return {
    ...board,
    ...clampFloatingPosition(
      pos.x,
      pos.y,
      viewportWidth,
      viewportHeight,
      size.width,
      displayHeight,
    ),
    width: size.width,
    height: board.minimised ? board.height : size.height,
  };
}

/** Notes stay wholly inside the board, so no part can be dragged out of sight. */
export function clampFloatingPosition(
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
  noteWidth = FLOATING_NOTE_WIDTH,
  noteHeight = FLOATING_NOTE_HEIGHT,
): { x: number; y: number } {
  const min = FLOATING_NOTE_PADDING;
  const maxX = Math.max(min, viewportWidth - noteWidth - min);
  const maxY = Math.max(min, viewportHeight - noteHeight - min);
  return {
    x: Math.min(Math.max(x, min), maxX),
    y: Math.min(Math.max(y, min), maxY),
  };
}

export function clampNoteToViewport(
  note: Pick<FloatingNote, "minimised" | "width" | "height">,
  x: number,
  y: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  return clampFloatingPosition(
    x,
    y,
    viewportWidth,
    viewportHeight,
    note.width ?? FLOATING_NOTE_WIDTH,
    note.minimised
      ? FLOATING_NOTE_MINIMISED_HEIGHT
      : note.height ?? FLOATING_NOTE_HEIGHT,
  );
}

export function nextZIndex(items: { zIndex: number }[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map((item) => item.zIndex)) + 1;
}

export function nextCascadePosition(
  notes: FloatingNote[],
  viewportWidth: number,
  viewportHeight: number,
  noteWidth = FLOATING_NOTE_WIDTH,
  noteHeight = FLOATING_NOTE_HEIGHT,
): { x: number; y: number } {
  const clamp = (x: number, y: number) =>
    clampFloatingPosition(x, y, viewportWidth, viewportHeight, noteWidth, noteHeight);
  const last = notes[notes.length - 1];
  if (!last) {
    return clamp(96, 120);
  }
  const maxX = viewportWidth - noteWidth - FLOATING_NOTE_PADDING;
  let x = last.x + FLOATING_NOTE_CASCADE;
  let y = last.y + FLOATING_NOTE_CASCADE;
  if (x > maxX) {
    x = 96;
    y = last.y + FLOATING_NOTE_CASCADE;
  }
  return clamp(x, y);
}

export function reclampFloatingNotes(
  notes: FloatingNote[],
  viewportWidth: number,
  viewportHeight: number,
): FloatingNote[] {
  return notes.map((note) => {
    if (note.docked) return note;
    return {
      ...note,
      ...clampFloatingPosition(
        note.x,
        note.y,
        viewportWidth,
        viewportHeight,
        note.width ?? FLOATING_NOTE_WIDTH,
        note.minimised
          ? FLOATING_NOTE_MINIMISED_HEIGHT
          : note.height ?? FLOATING_NOTE_HEIGHT,
      ),
    };
  });
}

function positionsChanged(
  before: FloatingNote[],
  after: FloatingNote[],
): boolean {
  return after.some(
    (note, index) =>
      note.x !== before[index]?.x || note.y !== before[index]?.y,
  );
}

export function readFloatingNotes(): FloatingNote[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(
      readMigratedStorageValue(
        window.localStorage,
        FLOATING_NOTE_STORAGE_KEY,
        LEGACY_FLOATING_NOTE_STORAGE_KEYS,
      ) ?? "[]",
    );
    if (!Array.isArray(stored)) return [];
    return stored
      .map(parseFloatingNote)
      .filter((note): note is FloatingNote => note !== null);
  } catch {
    return [];
  }
}

export function parseFloatingNote(value: unknown): FloatingNote | null {
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
  const note: FloatingNote = {
    id: record.id,
    text: record.text,
    tagIds,
    color: parseFloatingStickyColor(record.color),
    minimised: record.minimised === true,
    docked: record.docked === true,
    x: record.x,
    y: record.y,
    zIndex: record.zIndex,
  };
  if (typeof record.width === "number") note.width = record.width;
  if (typeof record.height === "number") note.height = record.height;
  return note;
}

export function writeFloatingNotes(notes: FloatingNote[]) {
  if (typeof window === "undefined") return;
  try {
    if (notes.length) {
      window.localStorage.setItem(
        FLOATING_NOTE_STORAGE_KEY,
        JSON.stringify(notes),
      );
    } else {
      window.localStorage.removeItem(FLOATING_NOTE_STORAGE_KEY);
    }
    for (const key of LEGACY_FLOATING_NOTE_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Keep in-memory state working when storage is unavailable.
  }
}

export function parseFloatingNoteBoard(value: unknown): FloatingNoteBoard | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.x !== "number" ||
    typeof record.y !== "number" ||
    typeof record.width !== "number" ||
    typeof record.height !== "number" ||
    typeof record.zIndex !== "number"
  ) {
    return null;
  }
  return {
    x: record.x,
    y: record.y,
    width: record.width,
    height: record.height,
    minimised: record.minimised === true,
    zIndex: record.zIndex,
  };
}

export function readFloatingNoteBoard(): FloatingNoteBoard {
  if (typeof window === "undefined") return DEFAULT_FLOATING_NOTE_BOARD;
  try {
    const stored = readMigratedStorageValue(
      window.localStorage,
      FLOATING_NOTE_BOARD_STORAGE_KEY,
      LEGACY_FLOATING_NOTE_BOARD_STORAGE_KEYS,
    );
    if (!stored) return DEFAULT_FLOATING_NOTE_BOARD;
    return parseFloatingNoteBoard(JSON.parse(stored)) ?? DEFAULT_FLOATING_NOTE_BOARD;
  } catch {
    return DEFAULT_FLOATING_NOTE_BOARD;
  }
}

export function writeFloatingNoteBoard(board: FloatingNoteBoard) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FLOATING_NOTE_BOARD_STORAGE_KEY,
      JSON.stringify(board),
    );
    for (const key of LEGACY_FLOATING_NOTE_BOARD_STORAGE_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Keep in-memory state working when storage is unavailable.
  }
}

/** Debounces localStorage writes but flushes synchronously on pagehide/unmount,
 * since a clean dashboard close hides the webview without unmounting it. */
export function createFloatingNoteWriter<T>(
  write: (value: T) => void,
  delayMs = 200,
) {
  let latest: T | undefined;
  let timeout: ReturnType<typeof window.setTimeout> | undefined;

  const flush = () => {
    if (timeout !== undefined) window.clearTimeout(timeout);
    timeout = undefined;
    if (latest !== undefined) write(latest);
  };

  window.addEventListener("pagehide", flush);

  return {
    update(value: T) {
      latest = value;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(flush, delayMs);
    },
    dispose() {
      window.removeEventListener("pagehide", flush);
      flush();
    },
  };
}

export function createFloatingNoteId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `floating-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createFloatingFromDraft(
  draft: NoteDraft,
  existing: FloatingNote[],
  viewportWidth: number,
  viewportHeight: number,
): FloatingNote | null {
  const text = trimNoteHtml(draft.text);
  if (!text) return null;
  const { width, height } = floatingNoteSizeForText(
    draft.text,
    viewportWidth,
    viewportHeight,
  );
  const { x, y } = nextCascadePosition(
    existing.filter((note) => !note.docked),
    viewportWidth,
    viewportHeight,
    width,
    height,
  );
  return {
    id: createFloatingNoteId(),
    text: draft.text,
    tagIds: [...draft.tagIds],
    color: DEFAULT_FLOATING_STICKY_COLOR,
    minimised: false,
    docked: false,
    x,
    y,
    width,
    height,
    zIndex: nextZIndex(existing),
  };
}

export function useFloatingNotes() {
  const [notes, setNotes] = useState<FloatingNote[]>(() =>
    readFloatingNotes(),
  );
  const [board, setBoard] = useState<FloatingNoteBoard>(readFloatingNoteBoard);
  const [hidden, setHidden] = useState(false);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const boardRef = useRef(board);
  boardRef.current = board;
  const writerRef = useRef<ReturnType<
    typeof createFloatingNoteWriter<FloatingNote[]>
  > | null>(null);
  const boardWriterRef = useRef<ReturnType<
    typeof createFloatingNoteWriter<FloatingNoteBoard>
  > | null>(null);
  if (!writerRef.current) {
    writerRef.current = createFloatingNoteWriter(writeFloatingNotes);
  }
  if (!boardWriterRef.current) {
    boardWriterRef.current = createFloatingNoteWriter(writeFloatingNoteBoard);
  }

  useEffect(() => {
    writerRef.current!.update(notes);
  }, [notes]);

  useEffect(() => {
    boardWriterRef.current!.update(board);
  }, [board]);

  useEffect(
    () => () => {
      writerRef.current!.dispose();
      boardWriterRef.current!.dispose();
    },
    [],
  );

  const updateNote = useCallback(
    (id: string, patch: Partial<Omit<FloatingNote, "id">>) => {
      setNotes((current) =>
        current.map((note) =>
          note.id === id ? { ...note, ...patch } : note,
        ),
      );
    },
    [],
  );

  const removeNote = useCallback((id: string) => {
    setNotes((current) => current.filter((note) => note.id !== id));
  }, []);

  const addNote = useCallback((note: FloatingNote) => {
    setNotes((current) => [
      ...current,
      {
        ...note,
        zIndex: nextZIndex([...current, boardRef.current]),
      },
    ]);
    // A new sticky must never land in the void: creating one reveals free notes.
    setHidden(false);
  }, []);

  const dockNote = useCallback((id: string) => {
    setNotes((current) =>
      current.map((note) =>
        note.id === id ? { ...note, docked: true } : note,
      ),
    );
  }, []);

  const undockNote = useCallback((id: string, x: number, y: number) => {
    setNotes((current) => {
      const zIndex = nextZIndex([...current, boardRef.current]);
      return current.map((note) => {
        if (note.id !== id) return note;
        const pos = clampNoteToViewport(
          note,
          x,
          y,
          window.innerWidth,
          window.innerHeight,
        );
        return { ...note, docked: false, ...pos, zIndex };
      });
    });
  }, []);

  const updateBoard = useCallback((patch: Partial<FloatingNoteBoard>) => {
    setBoard((current) => ({ ...current, ...patch }));
  }, []);

  const toggleHidden = useCallback(() => {
    setHidden((isHidden) => !isHidden);
  }, []);

  const bringToFront = useCallback((id: string) => {
    setNotes((current) => {
      const zIndex = nextZIndex([...current, boardRef.current]);
      return current.map((note) =>
        note.id === id ? { ...note, zIndex } : note,
      );
    });
  }, []);

  const bringBoardToFront = useCallback(() => {
    setBoard((current) => ({
      ...current,
      zIndex: nextZIndex([...notesRef.current, current]),
    }));
  }, []);

  const reclampToBoard = useCallback(
    (viewportWidth: number, viewportHeight: number) => {
      if (viewportWidth <= 0 || viewportHeight <= 0) return;
      setNotes((current) => {
        const next = reclampFloatingNotes(
          current,
          viewportWidth,
          viewportHeight,
        );
        if (!positionsChanged(current, next)) return current;
        return next;
      });
      setBoard((current) => {
        const next = reclampNoteBoard(current, viewportWidth, viewportHeight);
        if (
          next.x === current.x &&
          next.y === current.y &&
          next.width === current.width &&
          next.height === current.height
        ) {
          return current;
        }
        return next;
      });
    },
    [],
  );

  return {
    notes,
    board,
    hidden,
    toggleHidden,
    addNote,
    updateNote,
    removeNote,
    dockNote,
    undockNote,
    updateBoard,
    bringToFront,
    bringBoardToFront,
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
