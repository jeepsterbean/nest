import type { AssistantModel } from "../../lib/types";

export const ASSISTANT_PANES = [
  { key: "chat", label: "Chat" },
  { key: "config", label: "Config" },
] as const;

export type AssistantPane = (typeof ASSISTANT_PANES)[number]["key"];

export const ASSISTANT_MODELS: readonly {
  value: AssistantModel;
  label: string;
}[] = [
  { value: "gpt-5.6-luna", label: "5.6 Luna" },
  { value: "gpt-5.6-terra", label: "5.6 Terra" },
];

export type PromptDraft = { title: string; instructions: string };

const PANE_KEY = "nest:assistant-pane";
const CHAT_DRAFTS_KEY = "nest:assistant-chat-drafts";
const PROMPT_DRAFTS_KEY = "nest:assistant-prompt-drafts";

type AssistantStorage = Pick<Storage, "getItem" | "setItem">;

export function readAssistantPane(
  storage: AssistantStorage = localStorage,
): AssistantPane {
  return storage.getItem(PANE_KEY) === "config" ? "config" : "chat";
}

export function writeAssistantPane(
  pane: AssistantPane,
  storage: AssistantStorage = localStorage,
) {
  storage.setItem(PANE_KEY, pane);
}

export function readChatDrafts(
  storage: AssistantStorage = localStorage,
): Record<string, string> {
  try {
    const value: unknown = JSON.parse(storage.getItem(CHAT_DRAFTS_KEY) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] =>
        typeof entry[1] === "string"
      ),
    );
  } catch {
    return {};
  }
}

export function writeChatDrafts(
  drafts: Record<string, string>,
  storage: AssistantStorage = localStorage,
) {
  storage.setItem(CHAT_DRAFTS_KEY, JSON.stringify(drafts));
}

export function readPromptDrafts(
  storage: AssistantStorage = localStorage,
): Record<string, PromptDraft> {
  try {
    const value: unknown = JSON.parse(storage.getItem(PROMPT_DRAFTS_KEY) ?? "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, PromptDraft] => {
        const draft = entry[1];
        return typeof draft === "object" &&
          draft !== null &&
          !Array.isArray(draft) &&
          "title" in draft &&
          typeof draft.title === "string" &&
          "instructions" in draft &&
          typeof draft.instructions === "string";
      }),
    );
  } catch {
    return {};
  }
}

export function writePromptDrafts(
  drafts: Record<string, PromptDraft>,
  storage: AssistantStorage = localStorage,
) {
  storage.setItem(PROMPT_DRAFTS_KEY, JSON.stringify(drafts));
}
