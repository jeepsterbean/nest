import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  AssistantConversation,
  AssistantMessage,
  AssistantModel,
  AssistantPrompt,
  AssistantStreamEvent,
  AssistantSystemInstructionVersion,
  AssistantTurn,
} from "../types";

export const MAX_ASSISTANT_TITLE_CHARS = 80;
export const MAX_ASSISTANT_PROMPT_CHARS = 12_000;
export const MAX_ASSISTANT_MESSAGE_CHARS = 24_000;

export function assistantApiKeyConfigured(): Promise<boolean> {
  return invoke("assistant_api_key_configured");
}

export function setAssistantApiKey(apiKey: string): Promise<void> {
  return invoke("set_assistant_api_key", { apiKey });
}

export function deleteAssistantApiKey(): Promise<void> {
  return invoke("delete_assistant_api_key");
}

export function listAssistantPrompts(): Promise<AssistantPrompt[]> {
  return invoke("list_assistant_prompts");
}

export function createAssistantPrompt(
  title: string,
  instructions: string,
): Promise<AssistantPrompt> {
  return invoke("create_assistant_prompt", { title, instructions });
}

export function updateAssistantPrompt(
  id: number,
  title: string,
  instructions: string,
): Promise<AssistantPrompt> {
  return invoke("update_assistant_prompt", { id, title, instructions });
}

export function deleteAssistantPrompt(id: number): Promise<void> {
  return invoke("delete_assistant_prompt", { id });
}

export function listAssistantSystemInstructionVersions(): Promise<
  AssistantSystemInstructionVersion[]
> {
  return invoke("list_assistant_system_instruction_versions");
}

export function saveAssistantSystemInstructions(
  instructions: string,
): Promise<AssistantSystemInstructionVersion> {
  return invoke("save_assistant_system_instructions", { instructions });
}

export function listAssistantConversations(): Promise<AssistantConversation[]> {
  return invoke("list_assistant_conversations");
}

export function listAssistantMessages(
  conversationId: number,
): Promise<AssistantMessage[]> {
  return invoke("list_assistant_messages", { conversationId });
}

export function renameAssistantConversation(
  id: number,
  title: string,
): Promise<AssistantConversation> {
  return invoke("rename_assistant_conversation", { id, title });
}

export function deleteAssistantConversation(id: number): Promise<void> {
  return invoke("delete_assistant_conversation", { id });
}

export function sendAssistantMessage(
  input: {
    conversationId: number | null;
    model: AssistantModel;
    content: string;
    sentMessage: string;
    systemInstructions: string | null;
    timezoneOffsetMinutes: number;
  },
  onDelta: (delta: string) => void,
): Promise<AssistantTurn> {
  const onEvent = new Channel<AssistantStreamEvent>();
  onEvent.onmessage = (event) => onDelta(event.delta);
  return invoke("send_assistant_message", { request: input, onEvent });
}
