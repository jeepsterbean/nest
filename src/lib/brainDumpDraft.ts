import { useCallback, useEffect, useState } from "react";

const TEXT_STORAGE_KEY = "nest.brain-dump-draft";
const CHANNEL_NAME = "nest.brain-dump-draft";
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
