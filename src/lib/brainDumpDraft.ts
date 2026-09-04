import { useCallback, useEffect, useState } from "react";
import { listBrainDumps } from "./commands";
import { subscribeTauriEvent } from "./tauriListen";
import type { BrainDump } from "./types";

const TEXT_STORAGE_KEY = "nest.brain-dump-draft";
const TAG_IDS_STORAGE_KEY = "nest.brain-dump-draft-tags";
const CHANNEL_NAME = "nest.brain-dump-draft";
const HISTORY_LIMIT = 5;
export type BrainDumpDraft = { text: string; tagIds: number[] };
const EMPTY_DRAFT: BrainDumpDraft = { text: "", tagIds: [] };
const subscribers = new Set<(draft: BrainDumpDraft) => void>();
let channel: BroadcastChannel | null = null;
let listeningForStorage = false;

function readDraft(): BrainDumpDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    const storedIds = JSON.parse(
      window.localStorage.getItem(TAG_IDS_STORAGE_KEY) ?? "[]",
    );
    return {
      text: window.localStorage.getItem(TEXT_STORAGE_KEY) ?? "",
      tagIds: Array.isArray(storedIds)
        ? storedIds.filter((id): id is number => Number.isInteger(id))
        : [],
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

let currentDraft = readDraft();

function storeDraft(draft: BrainDumpDraft) {
  if (typeof window === "undefined") return;
  try {
    if (draft.text) window.localStorage.setItem(TEXT_STORAGE_KEY, draft.text);
    else window.localStorage.removeItem(TEXT_STORAGE_KEY);
    if (draft.tagIds.length) {
      window.localStorage.setItem(TAG_IDS_STORAGE_KEY, JSON.stringify(draft.tagIds));
    } else {
      window.localStorage.removeItem(TAG_IDS_STORAGE_KEY);
    }
  } catch {
    // Keep the in-memory draft working when browser storage is unavailable.
  }
}

function updateDraft(draft: BrainDumpDraft) {
  currentDraft = draft;
  subscribers.forEach((subscriber) => subscriber(draft));
}

function receiveDraft(draft: BrainDumpDraft) {
  updateDraft(draft);
  storeDraft(draft);
}

function startSync() {
  if (!channel && typeof BroadcastChannel !== "undefined") {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<unknown>) => {
        const draft = event.data as Partial<BrainDumpDraft> | null;
        if (typeof draft?.text === "string" && Array.isArray(draft.tagIds)) {
          receiveDraft({
            text: draft.text,
            tagIds: draft.tagIds.filter((id): id is number => Number.isInteger(id)),
          });
        }
      };
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

export function trimBrainDumpDraft(draft: BrainDumpDraft) {
  return draft.text.trim();
}

export function isBrainDumpSubmitShortcut(event: {
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

export function isBrainDumpPeelShortcut(event: {
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

export function adjacentBrainDumpIndex(
  index: number,
  direction: -1 | 1,
  historyLength: number,
) {
  return Math.max(-1, Math.min(index + direction, historyLength - 1));
}

export function brainDumpHistoryDirection(event: {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
}): -1 | 1 | null {
  if (!event.metaKey && !event.ctrlKey) return null;
  if (event.key === "[") return 1;
  if (event.key === "]") return -1;
  return null;
}

export function useRecentBrainDumpHistory(
  draftText: string,
  onError: (error: string) => void,
) {
  const [brainDumps, setBrainDumps] = useState<BrainDump[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const refresh = useCallback(async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const dumps = await listBrainDumps(0, now + 1, HISTORY_LIMIT);
      setBrainDumps(dumps);
    } catch (error) {
      onError(String(error));
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
    return subscribeTauriEvent("data-changed", refresh);
  }, [refresh]);

  useEffect(() => {
    if (historyIndex >= brainDumps.length) setHistoryIndex(-1);
  }, [brainDumps.length, historyIndex]);

  useEffect(() => {
    const navigateHistory = (event: KeyboardEvent) => {
      const direction = brainDumpHistoryDirection(event);
      if (direction === null) return;
      event.preventDefault();
      setHistoryIndex((index) =>
        adjacentBrainDumpIndex(index, direction, brainDumps.length),
      );
    };
    window.addEventListener("keydown", navigateHistory);
    return () => window.removeEventListener("keydown", navigateHistory);
  }, [brainDumps.length]);

  const viewingHistory = historyIndex >= 0;
  const viewingDump = viewingHistory ? brainDumps[historyIndex] ?? null : null;
  return {
    text: viewingDump?.text ?? draftText,
    viewingDump,
    viewingHistory,
    canViewPrevious: historyIndex < brainDumps.length - 1,
    canViewNext: viewingHistory,
    showPrevious: () =>
      setHistoryIndex((index) =>
        adjacentBrainDumpIndex(index, 1, brainDumps.length),
      ),
    showNext: () =>
      setHistoryIndex((index) =>
        adjacentBrainDumpIndex(index, -1, brainDumps.length),
      ),
    refresh,
  };
}

export function useBrainDumpDraft() {
  const [draft, setLocalDraft] = useState(currentDraft);

  useEffect(() => {
    startSync();
    subscribers.add(setLocalDraft);
    receiveDraft(readDraft());
    return () => {
      subscribers.delete(setLocalDraft);
    };
  }, []);

  const setDraft = useCallback(
    (update: BrainDumpDraft | ((draft: BrainDumpDraft) => BrainDumpDraft)) => {
      const next = typeof update === "function" ? update(currentDraft) : update;
      receiveDraft(next);
      channel?.postMessage(next);
    },
    [],
  );

  return [draft, setDraft] as const;
}
