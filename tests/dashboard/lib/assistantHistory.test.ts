import { describe, expect, it } from "vitest";
import {
  createAssistantHistoryRefresh,
  isMissingAssistantConversation,
  shouldApplyAssistantHistory,
} from "../../../src/dashboard/lib/assistantHistory";
import type { AssistantConversation, AssistantMessage } from "../../../src/lib/types";

const conversation = (
  id: number,
  title = `Chat ${id}`,
): AssistantConversation => ({
  id,
  title,
  model: "gpt-5.6-luna",
  createdAt: id,
  updatedAt: id,
});

const message = (
  id: number,
  conversationId: number,
  content = `Message ${id}`,
): AssistantMessage => ({
  id,
  conversationId,
  role: id % 2 === 0 ? "assistant" : "user",
  content,
  sentMessage: null,
  systemInstructions: null,
  incompleteReason: null,
  createdAt: id,
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
};

describe("assistant history refresh", () => {
  it("adds a chat created in the other window without changing selection", async () => {
    const refresh = createAssistantHistoryRefresh({
      listConversations: async () => [conversation(2, "New from popup"), conversation(1)],
      listMessages: async () => [message(1, 1)],
    });

    await expect(
      refresh({
        selectedConversationId: 1,
        sending: false,
        messages: [message(1, 1)],
      }),
    ).resolves.toEqual({
      conversations: [conversation(2, "New from popup"), conversation(1)],
      selectedConversationId: 1,
      messages: [message(1, 1)],
    });
  });

  it("refreshes the list while this window is on a new chat", async () => {
    const refresh = createAssistantHistoryRefresh({
      listConversations: async () => [conversation(1, "From the dashboard")],
      listMessages: async () => {
        throw new Error("a new chat has no thread to load");
      },
    });

    await expect(
      refresh({
        selectedConversationId: null,
        sending: false,
        messages: [],
      }),
    ).resolves.toEqual({
      conversations: [conversation(1, "From the dashboard")],
      selectedConversationId: null,
      messages: [],
    });
  });

  it("pulls messages added in the other window into the open thread", async () => {
    const refresh = createAssistantHistoryRefresh({
      listConversations: async () => [conversation(1)],
      listMessages: async () => [message(1, 1, "Hello"), message(2, 1, "A next step")],
    });

    await expect(
      refresh({
        selectedConversationId: 1,
        sending: false,
        messages: [message(1, 1, "Hello")],
      }),
    ).resolves.toEqual({
      conversations: [conversation(1)],
      selectedConversationId: 1,
      messages: [message(1, 1, "Hello"), message(2, 1, "A next step")],
    });
  });

  it("renames a chat in the list and leaves this window's selection alone", async () => {
    const refresh = createAssistantHistoryRefresh({
      listConversations: async () => [conversation(2), conversation(1, "Renamed")],
      listMessages: async () => [message(1, 1)],
    });

    const next = await refresh({
      selectedConversationId: 1,
      sending: false,
      messages: [message(1, 1)],
    });
    expect(next?.conversations.find((item) => item.id === 1)?.title).toBe("Renamed");
    expect(next?.selectedConversationId).toBe(1);
  });

  it("clears the open thread when the other window deletes it", async () => {
    const refresh = createAssistantHistoryRefresh({
      listConversations: async () => [conversation(2)],
      listMessages: async () => {
        throw new Error("should not load a deleted chat");
      },
    });

    await expect(
      refresh({
        selectedConversationId: 1,
        sending: false,
        messages: [message(1, 1)],
      }),
    ).resolves.toEqual({
      conversations: [conversation(2)],
      selectedConversationId: null,
      messages: [],
    });
  });

  it("clears selection when the message fetch says the chat is gone", async () => {
    const refresh = createAssistantHistoryRefresh({
      listConversations: async () => [conversation(1)],
      listMessages: async () => {
        throw new Error("not found: assistant conversation 1");
      },
    });

    await expect(
      refresh({
        selectedConversationId: 1,
        sending: false,
        messages: [message(1, 1)],
      }),
    ).resolves.toEqual({
      conversations: [],
      selectedConversationId: null,
      messages: [],
    });
  });

  it("keeps local streaming output and still refreshes the list", async () => {
    const streaming = [message(1, 1, "Just sent")];
    const refresh = createAssistantHistoryRefresh({
      listConversations: async () => [conversation(2, "Other chat"), conversation(1)],
      listMessages: async () => {
        throw new Error("should not replace a streaming thread");
      },
    });

    await expect(
      refresh({
        selectedConversationId: 1,
        sending: true,
        messages: streaming,
      }),
    ).resolves.toEqual({
      conversations: [conversation(2, "Other chat"), conversation(1)],
      selectedConversationId: 1,
      messages: streaming,
    });
  });

  it("discards a slower refresh when a later one has already started", async () => {
    const firstConversations = deferred<AssistantConversation[]>();
    const secondConversations = deferred<AssistantConversation[]>();
    let lists = 0;
    const refresh = createAssistantHistoryRefresh({
      listConversations: () => {
        lists += 1;
        return lists === 1 ? firstConversations.promise : secondConversations.promise;
      },
      listMessages: async (id) => [message(id, id)],
    });

    const first = refresh({
      selectedConversationId: 1,
      sending: false,
      messages: [],
    });
    const second = refresh({
      selectedConversationId: 2,
      sending: false,
      messages: [],
    });

    firstConversations.resolve([conversation(1)]);
    secondConversations.resolve([conversation(2), conversation(1)]);

    await expect(first).resolves.toBeNull();
    await expect(second).resolves.toEqual({
      conversations: [conversation(2), conversation(1)],
      selectedConversationId: 2,
      messages: [message(2, 2)],
    });
  });

  it("recognizes a missing-conversation error from Rust", () => {
    expect(isMissingAssistantConversation("not found: assistant conversation 4")).toBe(true);
    expect(isMissingAssistantConversation("invalid input: chat title cannot be empty")).toBe(false);
  });
});

describe("shouldApplyAssistantHistory", () => {
  it("keeps a thread this window just wrote when the send-time refresh lands late", () => {
    expect(
      shouldApplyAssistantHistory(
        { selectedConversationId: null, sending: true },
        { selectedConversationId: 1, sending: false },
      ),
    ).toEqual({ selection: false, messages: false });
    expect(
      shouldApplyAssistantHistory(
        { selectedConversationId: 1, sending: true },
        { selectedConversationId: 1, sending: false },
      ),
    ).toEqual({ selection: true, messages: false });
  });

  it("still applies a later refresh of the same idle chat", () => {
    expect(
      shouldApplyAssistantHistory(
        { selectedConversationId: 1, sending: false },
        { selectedConversationId: 1, sending: false },
      ),
    ).toEqual({ selection: true, messages: true });
  });

  it("does not apply a refresh after this window moved to another chat", () => {
    expect(
      shouldApplyAssistantHistory(
        { selectedConversationId: 1, sending: false },
        { selectedConversationId: 2, sending: false },
      ),
    ).toEqual({ selection: false, messages: false });
  });
});
