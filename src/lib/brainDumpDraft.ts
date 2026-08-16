import { useCallback, useEffect, useState } from "react";

const TEXT_STORAGE_KEY = "nest.brain-dump-draft";
const TITLE_STORAGE_KEY = "nest.brain-dump-draft-title";
const CHANNEL_NAME = "nest.brain-dump-draft";
export type BrainDumpDraft = { title: string; text: string };
const EMPTY_DRAFT: BrainDumpDraft = { title: "", text: "" };
const subscribers = new Set<(draft: BrainDumpDraft) => void>();
let channel: BroadcastChannel | null = null;
let listeningForStorage = false;

function readDraft(): BrainDumpDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try {
    return {
      title: window.localStorage.getItem(TITLE_STORAGE_KEY) ?? "",
      text: window.localStorage.getItem(TEXT_STORAGE_KEY) ?? "",
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

let currentDraft = readDraft();

function storeDraft(draft: BrainDumpDraft) {
  if (typeof window === "undefined") return;
  try {
    if (draft.title) window.localStorage.setItem(TITLE_STORAGE_KEY, draft.title);
    else window.localStorage.removeItem(TITLE_STORAGE_KEY);
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
        if (typeof draft?.title === "string" && typeof draft.text === "string") {
          receiveDraft({ title: draft.title, text: draft.text });
        }
      };
    } catch {
      channel = null;
    }
  }
  if (!listeningForStorage && typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === TEXT_STORAGE_KEY) {
        updateDraft({ ...currentDraft, text: event.newValue ?? "" });
      } else if (event.key === TITLE_STORAGE_KEY) {
        updateDraft({ ...currentDraft, title: event.newValue ?? "" });
      }
    });
    listeningForStorage = true;
  }
}

export function trimBrainDumpDraft(draft: BrainDumpDraft) {
  return {
    title: draft.title.trim() || null,
    text: draft.text.trim(),
  };
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
