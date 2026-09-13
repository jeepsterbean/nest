import type { AssistantConversation, AssistantMessage } from "../../lib/types";

export const ASSISTANT_HISTORY_CHANGED = "assistant-history-changed";

export type AssistantHistoryState = {
  conversations: AssistantConversation[];
  selectedConversationId: number | null;
  messages: AssistantMessage[];
};

export type AssistantHistoryCursor = {
  selectedConversationId: number | null;
  sending: boolean;
};

export function isMissingAssistantConversation(error: unknown) {
  return String(error).includes("not found: assistant conversation");
}

/**
 * A refresh that started before this window finished a send or changed
 * chats must not replace the thread now on screen. Rust emits
 * `assistant-history-changed` before `send_assistant_message` returns, so
 * that in-flight list can resolve after the reply is already shown.
 */
export function shouldApplyAssistantHistory(
  started: AssistantHistoryCursor,
  current: AssistantHistoryCursor,
) {
  const sameSelection = started.selectedConversationId === current.selectedConversationId;
  return {
    selection: sameSelection,
    messages: sameSelection && !started.sending && !current.sending,
  };
}

/**
 * Reloads the saved-chat list and the open thread. Later calls win; an
 * in-flight send keeps local messages so streaming output is not replaced.
 * Selection stays whoever this window already had, unless that chat was
 * deleted. The caller still uses `shouldApplyAssistantHistory` so a result
 * started mid-send cannot wipe the thread after the send lands.
 */
export function createAssistantHistoryRefresh(load: {
  listConversations: () => Promise<AssistantConversation[]>;
  listMessages: (conversationId: number) => Promise<AssistantMessage[]>;
}) {
  let generation = 0;

  return async function refreshAssistantHistory(current: {
    selectedConversationId: number | null;
    sending: boolean;
    messages: AssistantMessage[];
  }): Promise<AssistantHistoryState | null> {
    const request = ++generation;
    const conversations = await load.listConversations();
    if (request !== generation) return null;

    const selected = current.selectedConversationId;
    if (selected === null) {
      return { conversations, selectedConversationId: null, messages: [] };
    }
    if (!conversations.some((conversation) => conversation.id === selected)) {
      return { conversations, selectedConversationId: null, messages: [] };
    }
    if (current.sending) {
      return {
        conversations,
        selectedConversationId: selected,
        messages: current.messages,
      };
    }

    try {
      const messages = await load.listMessages(selected);
      if (request !== generation) return null;
      return { conversations, selectedConversationId: selected, messages };
    } catch (error) {
      if (request !== generation) return null;
      if (isMissingAssistantConversation(error)) {
        return {
          conversations: conversations.filter((conversation) => conversation.id !== selected),
          selectedConversationId: null,
          messages: [],
        };
      }
      throw error;
    }
  };
}
