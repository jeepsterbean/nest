import { useCallback, useEffect, useRef, useState } from "react";
import { listNotes } from "./commands";
import { trimNoteHtml } from "./noteRichText";
import { readMigratedStorageValue } from "./storageKeyMigration";
import { subscribeTauriEvent } from "./tauriListen";
import type { Note } from "./types";

const TEXT_STORAGE_KEY = "nest:note-draft";
const TAG_IDS_STORAGE_KEY = "nest:note-draft-tags";
// Read legacy draft keys newest first to preserve unsaved Notes.
const LEGACY_TEXT_STORAGE_KEYS = ["nest:brain-dump-draft", "nest.brain-dump-draft"];
const LEGACY_TAG_IDS_STORAGE_KEYS = [
  "nest:brain-dump-draft-tags",
  "nest.brain-dump-draft-tags",
];
const CHANNEL_NAME = "nest:note-draft";
const HISTORY_LIMIT = 5;
export type NoteDraft = { text: string; tagIds: number[] };
const EMPTY_DRAFT: NoteDraft = { text: "", tagIds: [] };
const subscribers = new Set<(draft: NoteDraft) => void>();
let channel: BroadcastChannel | null = null;
let listeningForStorage = false;

function readDraft(fallback: NoteDraft = EMPTY_DRAFT): NoteDraft {
  if (typeof window === "undefined") return fallback;
  try {
    const storedIds = JSON.parse(
      readMigratedStorageValue(
        window.localStorage,
        TAG_IDS_STORAGE_KEY,
        LEGACY_TAG_IDS_STORAGE_KEYS,
      ) ?? "[]",
    );
    return {
      text: readMigratedStorageValue(
        window.localStorage,
        TEXT_STORAGE_KEY,
        LEGACY_TEXT_STORAGE_KEYS,
      ) ?? "",
      tagIds: Array.isArray(storedIds)
        ? storedIds.filter((id): id is number => Number.isInteger(id))
        : [],
    };
  } catch {
    return fallback;
  }
}

let currentDraft = readDraft();

function storeDraft(draft: NoteDraft) {
  if (typeof window === "undefined") return;
  try {
    if (draft.text) window.localStorage.setItem(TEXT_STORAGE_KEY, draft.text);
    else window.localStorage.removeItem(TEXT_STORAGE_KEY);
    if (draft.tagIds.length) {
      window.localStorage.setItem(TAG_IDS_STORAGE_KEY, JSON.stringify(draft.tagIds));
    } else {
      window.localStorage.removeItem(TAG_IDS_STORAGE_KEY);
    }
    for (const key of [...LEGACY_TEXT_STORAGE_KEYS, ...LEGACY_TAG_IDS_STORAGE_KEYS]) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Keep the in-memory draft working when browser storage is unavailable.
  }
}

function sameDraft(a: NoteDraft, b: NoteDraft) {
  return (
    a.text === b.text &&
    a.tagIds.length === b.tagIds.length &&
    a.tagIds.every((id, index) => id === b.tagIds[index])
  );
}

/** A save finishes while the draft is still editable. Text or Tags typed
 * during that save must stay, so the draft is clearable only when it still
 * matches the snapshot that was submitted. */
export function noteDraftUnchanged(current: NoteDraft, submitted: NoteDraft) {
  return sameDraft(current, submitted);
}

export function clearNoteDraftIfUnchanged(submitted: NoteDraft) {
  // The other window can persist an edit before its sync notification arrives.
  updateDraft(readDraft(currentDraft));
  setNoteDraft((current) =>
    noteDraftUnchanged(current, submitted) ? EMPTY_DRAFT : current,
  );
}

function updateDraft(draft: NoteDraft) {
  // The other window hears each keystroke twice — once on the BroadcastChannel,
  // once on the `storage` event — and notifying twice re-rendered its whole
  // tree for nothing. Only a real change is worth waking subscribers for.
  if (sameDraft(currentDraft, draft)) return;
  currentDraft = draft;
  subscribers.forEach((subscriber) => subscriber(draft));
}

function startSync() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      // A delayed notification must read the latest draft, never write an
      // older snapshot back into storage and reset the typing window's caret.
      channel.onmessage = () => updateDraft(readDraft());
    } catch {
      channel = null;
    }
  }
  if (!listeningForStorage && typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === TEXT_STORAGE_KEY || event.key === TAG_IDS_STORAGE_KEY) {
        updateDraft(readDraft());
      }
    });
    listeningForStorage = true;
  }
}

export function trimNoteDraft(draft: NoteDraft) {
  return trimNoteHtml(draft.text);
}

export function isNoteSubmitShortcut(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
}) {
  return (
    event.key === "Enter" &&
    !event.isComposing &&
    (event.metaKey || event.ctrlKey)
  );
}

export function isNotePeelShortcut(event: {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  isComposing?: boolean;
}) {
  return (
    event.key === "Enter" &&
    event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.isComposing
  );
}

export function adjacentNoteIndex(
  index: number,
  direction: -1 | 1,
  historyLength: number,
) {
  return Math.max(-1, Math.min(index + direction, historyLength - 1));
}

export function historyIndexForDraftRevisionChange(
  historyIndex: number,
  previousRevision: string,
  nextRevision: string,
) {
  if (previousRevision === nextRevision) return historyIndex;
  return historyIndex < 0 ? historyIndex : -1;
}

export function noteHistoryDirection(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}): -1 | 1 | null {
  if (!event.metaKey && !event.ctrlKey) return null;
  if (event.key === "[") return 1;
  if (event.key === "]") return -1;
  return null;
}

export function useRecentNoteHistory(
  draftText: string,
  onError: (error: string) => void,
  draftRevision = draftText,
) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const lastDraftRevisionRef = useRef(draftRevision);

  const refresh = useCallback(async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      setNotes(await listNotes(0, now + 1, HISTORY_LIMIT));
    } catch (error) {
      onError(String(error));
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
    return subscribeTauriEvent("data-changed", refresh);
  }, [refresh]);

  useEffect(() => {
    if (historyIndex >= notes.length) setHistoryIndex(-1);
  }, [notes.length, historyIndex]);

  useEffect(() => {
    const nextHistoryIndex = historyIndexForDraftRevisionChange(
      historyIndex,
      lastDraftRevisionRef.current,
      draftRevision,
    );
    lastDraftRevisionRef.current = draftRevision;
    if (nextHistoryIndex === historyIndex) return;
    setHistoryIndex(nextHistoryIndex);
  }, [draftRevision]);

  useEffect(() => {
    const navigateHistory = (event: KeyboardEvent) => {
      const direction = noteHistoryDirection(event);
      if (direction === null) return;
      event.preventDefault();
      setHistoryIndex((index) =>
        adjacentNoteIndex(index, direction, notes.length),
      );
    };
    window.addEventListener("keydown", navigateHistory);
    return () => window.removeEventListener("keydown", navigateHistory);
  }, [notes.length]);

  const viewingHistory = historyIndex >= 0;
  const viewingNote = viewingHistory ? notes[historyIndex] ?? null : null;
  return {
    text: viewingNote?.text ?? draftText,
    viewingNote,
    viewingHistory,
    canViewPrevious: historyIndex < notes.length - 1,
    canViewNext: viewingHistory,
    showPrevious: () =>
      setHistoryIndex((index) =>
        adjacentNoteIndex(index, 1, notes.length),
      ),
    showNext: () =>
      setHistoryIndex((index) =>
        adjacentNoteIndex(index, -1, notes.length),
      ),
    stopViewingHistory: () => setHistoryIndex(-1),
    refresh,
  };
}

/** Read the draft without subscribing — for callers that only need its value
 * at call time and would otherwise re-render on every keystroke. */
export function getNoteDraft() {
  return currentDraft;
}

export function setNoteDraft(
  update: NoteDraft | ((draft: NoteDraft) => NoteDraft),
) {
  startSync();
  const next = typeof update === "function" ? update(currentDraft) : update;
  // Identical content is already stored. Writing it again would replace a
  // newer draft the other window stored after this copy was read.
  if (sameDraft(currentDraft, next)) return;
  storeDraft(next);
  updateDraft(next);
  channel?.postMessage(null);
}

export function useNoteDraft() {
  const [draft, setLocalDraft] = useState(currentDraft);

  useEffect(() => {
    startSync();
    subscribers.add(setLocalDraft);
    updateDraft(readDraft());
    return () => {
      subscribers.delete(setLocalDraft);
    };
  }, []);

  return [draft, setNoteDraft] as const;
}
