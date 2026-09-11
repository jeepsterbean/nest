import type { AssistantModel } from "../../lib/types";
import {
  DEFAULT_ASSISTANT_CONTEXT,
  type AssistantContextPreferences,
} from "./assistantContext";

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
const CONTEXT_KEY = "nest:assistant-context";

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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function readAssistantContext(
  storage: AssistantStorage = localStorage,
): AssistantContextPreferences {
  try {
    const value: unknown = JSON.parse(storage.getItem(CONTEXT_KEY) ?? "null");
    if (!isObject(value)) return DEFAULT_ASSISTANT_CONTEXT;
    const selection = <T extends string>(key: string, fallback: T, choices: readonly T[]) =>
      typeof value[key] === "string" && choices.includes(value[key] as T) ? value[key] as T : fallback;
    const taskDetail = isObject(value.taskDetail) ? value.taskDetail : null;
    const detail = taskDetail
      ? Object.fromEntries(Object.keys(DEFAULT_ASSISTANT_CONTEXT.taskDetail).map((key) => [key, taskDetail[key] === true]))
      : DEFAULT_ASSISTANT_CONTEXT.taskDetail;
    const layout = Array.isArray(value.layout) ? value.layout.filter((part): part is AssistantContextPreferences["layout"][number] =>
      isObject(part) && Number.isSafeInteger(part.id) &&
      ((part.kind === "block" && ["task", "phase", "dump", "metric", "message"].includes(String(part.block))) ||
        (part.kind === "text" && typeof part.text === "string")),
    ) : [];
    if (layout.filter((part) => part.kind === "block" && part.block === "message").length !== 1) {
      return DEFAULT_ASSISTANT_CONTEXT;
    }
    return {
      tasks: selection("tasks", "none", ["none", "active", "workingNow", "activeUpNext", "activeUpNextBacklog"]),
      phase: selection("phase", "none", ["none", "15m", "30m", "1h"]),
      dumps: selection("dumps", "none", ["none", "last1", "last3", "last5", "15m", "30m", "1h", "3h"]),
      metrics: selection("metrics", "none", ["none", "last1", "last2", "last3", "15m", "30m", "1h"]),
      taskDetail: detail as AssistantContextPreferences["taskDetail"],
      layout,
    };
  } catch {
    return DEFAULT_ASSISTANT_CONTEXT;
  }
}

export function writeAssistantContext(
  preferences: AssistantContextPreferences,
  storage: AssistantStorage = localStorage,
) {
  storage.setItem(CONTEXT_KEY, JSON.stringify(preferences));
}
