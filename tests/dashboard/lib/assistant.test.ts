import { describe, expect, it } from "vitest";
import {
  readAssistantPane,
  readChatDrafts,
  readPromptDrafts,
  writeAssistantPane,
  writeChatDrafts,
  writePromptDrafts,
} from "../../../src/dashboard/lib/assistant";

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

  it("ignores corrupt or wrongly shaped storage", () => {
    const storage = memory();
    storage.setItem("nest:assistant-chat-drafts", "[");
    storage.setItem("nest:assistant-prompt-drafts", '{"1":{"title":3}}');
    expect(readChatDrafts(storage)).toEqual({});
    expect(readPromptDrafts(storage)).toEqual({});
  });
});
