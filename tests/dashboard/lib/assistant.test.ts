import { describe, expect, it } from "vitest";
import {
  readAssistantConfig,
  readAssistantPane,
  readChatDrafts,
  readPromptDrafts,
  writeAssistantConfig,
  writeAssistantPane,
  writeChatDrafts,
  writePromptDrafts,
} from "../../../src/dashboard/lib/assistant";
import { DEFAULT_ASSISTANT_CONFIG } from "../../../src/dashboard/lib/assistantContext";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
};

describe("assistant preferences and drafts", () => {
  it("restores the pane and both kinds of draft", () => {
    const storage = memory();
    expect(readAssistantPane(storage)).toBe("chat");
    writeAssistantPane("config", storage);
    writeChatDrafts({ new: "I feel stuck" }, storage);
    writePromptDrafts(
      { "1": { title: "Coach", instructions: "Ask one question." } },
      storage,
    );

    expect(readAssistantPane(storage)).toBe("config");
    expect(readChatDrafts(storage)).toEqual({ new: "I feel stuck" });
    expect(readPromptDrafts(storage)["1"]?.title).toBe("Coach");
  });

  it("keeps Task detail from the older context shape and drops invalid options", () => {
    const storage = memory();
    storage.setItem("nest:assistant-context", JSON.stringify({
      tasks: "active",
      taskDetail: { description: true },
      layout: [],
    }));
    const legacy = readAssistantConfig(storage);
    expect(legacy.taskDetail.description).toBe(true);
    expect(legacy.template).toBe(DEFAULT_ASSISTANT_CONFIG.template);

    writeAssistantConfig({
      ...legacy,
      signals: {
        ...legacy.signals,
        phase: {
          options: [
            { id: "a", name: "Lately", key: "window:45" },
            { id: "b", name: "Count", key: "last:3" },
            { id: "a", name: "Copy", key: "window:45" },
            { id: "c", name: " ", key: "window:10" },
          ],
          defaultOption: "b",
        },
      },
    }, storage);
    expect(readAssistantConfig(storage).signals.phase).toEqual({
      options: [{ id: "a", name: "Lately", key: "window:45" }],
      defaultOption: null,
    });
    expect(readAssistantConfig(storage).icons).toEqual(DEFAULT_ASSISTANT_CONFIG.icons);
  });

  it("keeps a chosen composer icon and ignores unknown keys", () => {
    const storage = memory();
    writeAssistantConfig({
      ...DEFAULT_ASSISTANT_CONFIG,
      icons: { ...DEFAULT_ASSISTANT_CONFIG.icons, dumps: "brain", prompt: "sparkles" },
    }, storage);
    expect(readAssistantConfig(storage).icons.dumps).toBe("brain");
    expect(readAssistantConfig(storage).icons.prompt).toBe("sparkles");

    storage.setItem("nest:assistant-context", JSON.stringify({
      ...DEFAULT_ASSISTANT_CONFIG,
      icons: { dumps: "not-an-icon", prompt: "sparkles" },
    }));
    expect(readAssistantConfig(storage).icons.dumps).toBe(DEFAULT_ASSISTANT_CONFIG.icons.dumps);
    expect(readAssistantConfig(storage).icons.prompt).toBe("sparkles");
  });

  it("keeps a chosen model and falls back on one the API would reject", () => {
    const storage = memory();
    writeAssistantConfig({ ...DEFAULT_ASSISTANT_CONFIG, model: "gpt-5.6-terra" }, storage);
    expect(readAssistantConfig(storage).model).toBe("gpt-5.6-terra");

    storage.setItem("nest:assistant-context", JSON.stringify({
      ...DEFAULT_ASSISTANT_CONFIG,
      model: "gpt-4",
    }));
    expect(readAssistantConfig(storage).model).toBe(DEFAULT_ASSISTANT_CONFIG.model);
  });

  it("ignores corrupt or wrongly shaped storage", () => {
    const storage = memory();
    storage.setItem("nest:assistant-chat-drafts", "[");
    storage.setItem("nest:assistant-prompt-drafts", '{"1":{"title":3}}');
    expect(readChatDrafts(storage)).toEqual({});
    expect(readPromptDrafts(storage)).toEqual({});
  });
});
