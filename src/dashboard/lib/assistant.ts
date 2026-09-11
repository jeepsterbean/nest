import type { AssistantModel } from "../../lib/types";
import {
  DEFAULT_ASSISTANT_CONFIG,
  DEFAULT_TASK_DETAIL,
  SIGNALS,
  isValidOption,
  type AssistantConfig,
  type SignalOption,
  type TaskDetail,
} from "./assistantContext";

export const ASSISTANT_PANES = [
  { key: "chat", label: "Chat" },
  { key: "config", label: "Config" },
] as const;

export type AssistantPane = (typeof ASSISTANT_PANES)[number]["key"];

export const CONFIG_SECTIONS = [
  { key: "dumps", label: "Brain dump" },
  { key: "metrics", label: "Metric" },
  { key: "phase", label: "Phase" },
  { key: "tasks", label: "Tasks" },
  { key: "prompt", label: "Prompt" },
  { key: "system", label: "System instructions" },
  { key: "layout", label: "Layout" },
] as const;

export const SYSTEM_CONFIG_SECTIONS = CONFIG_SECTIONS.filter(({ key }) =>
  key === "system" || key === "layout",
);
export const CHAT_CONFIG_SECTIONS = CONFIG_SECTIONS.filter(
  ({ key }) => !SYSTEM_CONFIG_SECTIONS.some((section) => section.key === key),
);

export type ConfigSection = (typeof CONFIG_SECTIONS)[number]["key"];

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
// Kept from the earlier context-preferences shape so saved Task detail carries over.
const CONFIG_KEY = "nest:assistant-context";

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

/** Each field falls back on its own, so an older stored shape keeps whatever still fits. */
export function readAssistantConfig(
  storage: AssistantStorage = localStorage,
): AssistantConfig {
  try {
    const value: unknown = JSON.parse(storage.getItem(CONFIG_KEY) ?? "null");
    if (!isObject(value)) return DEFAULT_ASSISTANT_CONFIG;
    const storedSignals = isObject(value.signals) ? value.signals : {};
    const signals = Object.fromEntries(SIGNALS.map((signal) => {
      const stored = storedSignals[signal];
      if (!isObject(stored) || !Array.isArray(stored.options)) {
        return [signal, DEFAULT_ASSISTANT_CONFIG.signals[signal]];
      }
      const options: SignalOption[] = [];
      for (const option of stored.options) {
        if (
          isObject(option) &&
          typeof option.id === "string" && option.id !== "" &&
          !options.some((item) => item.id === option.id) &&
          typeof option.name === "string" && option.name.trim() !== "" &&
          typeof option.key === "string" && isValidOption(signal, option.key)
        ) {
          options.push({ id: option.id, name: option.name, key: option.key });
        }
      }
      const defaultOption = options.some((option) => option.id === stored.defaultOption)
        ? stored.defaultOption as string
        : null;
      return [signal, { options, defaultOption }];
    })) as AssistantConfig["signals"];
    const taskDetail = isObject(value.taskDetail) ? value.taskDetail : null;
    return {
      signals,
      taskDetail: taskDetail
        ? Object.fromEntries(Object.keys(DEFAULT_TASK_DETAIL).map((key) => [key, taskDetail[key] === true])) as TaskDetail
        : DEFAULT_TASK_DETAIL,
      systemInstructions: typeof value.systemInstructions === "string"
        ? value.systemInstructions
        : DEFAULT_ASSISTANT_CONFIG.systemInstructions,
      template: typeof value.template === "string" ? value.template : DEFAULT_ASSISTANT_CONFIG.template,
    };
  } catch {
    return DEFAULT_ASSISTANT_CONFIG;
  }
}

export function writeAssistantConfig(
  config: AssistantConfig,
  storage: AssistantStorage = localStorage,
) {
  storage.setItem(CONFIG_KEY, JSON.stringify(config));
}
