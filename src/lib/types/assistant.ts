export type AssistantModel = "gpt-5.6-luna" | "gpt-5.6-terra";

export type AssistantPrompt = {
  id: number;
  title: string;
  instructions: string;
  createdAt: number;
  updatedAt: number;
};

export type AssistantSystemInstructionVersion = {
  id: number;
  instructions: string;
  savedAt: number;
};

export type AssistantConversation = {
  id: number;
  title: string;
  model: AssistantModel;
  createdAt: number;
  updatedAt: number;
};

export type AssistantMessage = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  sentMessage: string | null;
  systemInstructions: string | null;
  incompleteReason: string | null;
  createdAt: number;
};

export type AssistantTurn = {
  conversation: AssistantConversation;
  userMessage: AssistantMessage;
  assistantMessage: AssistantMessage;
};

export type AssistantStreamEvent = {
  delta: string;
};
