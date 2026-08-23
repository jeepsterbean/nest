import { useCallback, useEffect, useState } from "react";
import { listBrainDumps } from "./commands";
import { subscribeTauriEvent } from "./tauriListen";
import type { BrainDump } from "./types";

const TEXT_STORAGE_KEY = "nest.brain-dump-draft";
const CHANNEL_NAME = "nest.brain-dump-draft";
const HISTORY_LIMIT = 5;
export type BrainDumpDraft = { text: string };
const EMPTY_DRAFT: BrainDumpDraft = { text: "" };
const subscribers = new Set<(draft: BrainDumpDraft) => void>();
let channel: BroadcastChannel | null = null;
let listeningForStorage = false;

function readDraft(): BrainDumpDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    return { text: window.localStorage.getItem(TEXT_STORAGE_KEY) ?? "" };
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
        if (typeof draft?.text === "string") {
          receiveDraft({ text: draft.text });
        }
      };
    } catch {
      channel = null;
    }
  }
  if (!listeningForStorage && typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === TEXT_STORAGE_KEY) {
        updateDraft({ text: event.newValue ?? "" });
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
      const dumps = await listBrainDumps(0, now + 1);
      setBrainDumps(dumps.slice(0, HISTORY_LIMIT));
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
  return {
    text: viewingHistory
      ? (brainDumps[historyIndex]?.text ?? draftText)
      : draftText,
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
