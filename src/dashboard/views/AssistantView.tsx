import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  assistantApiKeyConfigured,
  createAssistantPrompt,
  deleteAssistantApiKey,
  deleteAssistantConversation,
  deleteAssistantPrompt,
  listAssistantConversations,
  listAssistantMessages,
  listAssistantPrompts,
  renameAssistantConversation,
  sendAssistantMessage,
  setAssistantApiKey,
  updateAssistantPrompt,
} from "../../lib/commands";
import type {
  AssistantConversation,
  AssistantMessage,
  AssistantModel,
  AssistantPrompt,
} from "../../lib/types";
import { MenuSelect } from "../components/MenuSelect";
import { ViewToggle } from "../components/ViewToggle";
import {
  editIcon,
  plusIcon,
  sendIcon,
  trashIcon,
} from "../components/icons";
import { useInlineRename } from "../hooks/useInlineRename";
import {
  ASSISTANT_MODELS,
  ASSISTANT_PANES,
  readAssistantPane,
  readChatDrafts,
  readPromptDrafts,
  writeAssistantPane,
  writeChatDrafts,
  writePromptDrafts,
  type AssistantPane,
  type PromptDraft,
} from "../lib/assistant";

const NEW_PROMPT_INSTRUCTIONS =
  "You are a calm, practical thinking partner. Help the user find one clear next step.";

function errorMessage(error: unknown) {
  return String(error).replace(/^assistant error:\s*/i, "");
}

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export function AssistantView() {
  const [pane, setPane] = useState<AssistantPane>(readAssistantPane);
  const [prompts, setPrompts] = useState<AssistantPrompt[]>([]);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [model, setModel] = useState<AssistantModel>("gpt-5.6-luna");
  const [chatDrafts, setChatDrafts] = useState(readChatDrafts);
  const [promptDrafts, setPromptDrafts] = useState(readPromptDrafts);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [savingKey, setSavingKey] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [streamedResponse, setStreamedResponse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const [nextPrompts, nextConversations, keyConfigured] = await Promise.all([
        listAssistantPrompts(),
        listAssistantConversations(),
        assistantApiKeyConfigured(),
      ]);
      setPrompts(nextPrompts);
      setConversations(nextConversations);
      setApiKeyConfigured(keyConfigured);
      setSelectedPromptId((current) =>
        current !== null && nextPrompts.some((prompt) => prompt.id === current)
          ? current
          : nextPrompts[0]?.id ?? null,
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selectedConversationId === null) {
      setMessages([]);
      setMessagesLoading(false);
      return;
    }
    let current = true;
    setMessagesLoading(true);
    void listAssistantMessages(selectedConversationId)
      .then((next) => {
        if (current) setMessages(next);
      })
      .catch((loadError) => {
        if (current) setError(errorMessage(loadError));
      })
      .finally(() => {
        if (current) setMessagesLoading(false);
      });
    return () => {
      current = false;
    };
  }, [selectedConversationId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pendingUserMessage, streamedResponse]);

  const selectedPrompt = useMemo(
    () => prompts.find((prompt) => prompt.id === selectedPromptId) ?? null,
    [prompts, selectedPromptId],
  );
  const selectedConversation = useMemo(
    () =>
      conversations.find((conversation) => conversation.id === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );
  const promptDraft = selectedPrompt
    ? promptDrafts[String(selectedPrompt.id)] ?? {
        title: selectedPrompt.title,
        instructions: selectedPrompt.instructions,
      }
    : null;
  const chatDraftKey = selectedConversationId === null
    ? "new"
    : String(selectedConversationId);
  const chatDraft = chatDrafts[chatDraftKey] ?? "";

  const selectPane = (next: AssistantPane) => {
    writeAssistantPane(next);
    setPane(next);
  };

  const storeChatDrafts = (
    update: (current: Record<string, string>) => Record<string, string>,
  ) => {
    setChatDrafts((current) => {
      const next = update(current);
      writeChatDrafts(next);
      return next;
    });
  };

  const storePromptDrafts = (
    update: (current: Record<string, PromptDraft>) => Record<string, PromptDraft>,
  ) => {
    setPromptDrafts((current) => {
      const next = update(current);
      writePromptDrafts(next);
      return next;
    });
  };

  const rename = useInlineRename({
    rename: async (id, title) => {
      const updated = await renameAssistantConversation(id, title);
      setConversations((current) =>
        current.map((conversation) => conversation.id === id ? updated : conversation),
      );
      return updated;
    },
    isUnchanged: (id, title) =>
      conversations.some(
        (conversation) => conversation.id === id && conversation.title === title,
      ),
    mutate: async (mutation) => {
      try {
        await mutation();
        return true;
      } catch (mutationError) {
        setError(errorMessage(mutationError));
        return false;
      }
    },
  });

  const startNewChat = () => {
    if (sending) return;
    setSelectedConversationId(null);
    setMessages([]);
    setError(null);
  };

  const selectConversation = (id: number) => {
    if (sending) return;
    setSelectedConversationId(id);
    setError(null);
  };

  const removeConversation = async (conversation: AssistantConversation) => {
    if (!window.confirm(`Delete “${conversation.title}”?`)) return;
    try {
      await deleteAssistantConversation(conversation.id);
      setConversations((current) =>
        current.filter((item) => item.id !== conversation.id),
      );
      storeChatDrafts((current) => withoutKey(current, String(conversation.id)));
      if (selectedConversationId === conversation.id) startNewChat();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  };

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault();
    const content = chatDraft.trim();
    if (
      !content ||
      sending ||
      !apiKeyConfigured ||
      (selectedConversation === null && selectedPrompt === null)
    ) return;

    setSending(true);
    setPendingUserMessage(content);
    setStreamedResponse("");
    setError(null);
    storeChatDrafts((current) => withoutKey(current, chatDraftKey));
    try {
      const turn = await sendAssistantMessage(
        {
          conversationId: selectedConversationId,
          promptId: selectedConversation === null ? selectedPrompt?.id ?? null : null,
          model,
          content,
        },
        (delta) => setStreamedResponse((current) => current + delta),
      );
      setMessages((current) => [
        ...current,
        turn.userMessage,
        turn.assistantMessage,
      ]);
      setConversations((current) => [
        turn.conversation,
        ...current.filter((conversation) => conversation.id !== turn.conversation.id),
      ]);
      setSelectedConversationId(turn.conversation.id);
    } catch (sendError) {
      setError(errorMessage(sendError));
      storeChatDrafts((current) => ({ ...current, [chatDraftKey]: content }));
    } finally {
      setPendingUserMessage(null);
      setStreamedResponse("");
      setSending(false);
    }
  };

  const saveApiKey = async (event: FormEvent) => {
    event.preventDefault();
    if (!apiKey.trim()) return;
    setSavingKey(true);
    setError(null);
    try {
      await setAssistantApiKey(apiKey);
      setApiKey("");
      setApiKeyConfigured(true);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSavingKey(false);
    }
  };

  const removeApiKey = async () => {
    if (!window.confirm("Remove the OpenAI API key from the system keychain?")) return;
    try {
      await deleteAssistantApiKey();
      setApiKeyConfigured(false);
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  };

  const addPrompt = async () => {
    try {
      const created = await createAssistantPrompt("New prompt", NEW_PROMPT_INSTRUCTIONS);
      setPrompts((current) => [created, ...current]);
      setSelectedPromptId(created.id);
    } catch (createError) {
      setError(errorMessage(createError));
    }
  };

  const updatePromptDraft = (changes: Partial<PromptDraft>) => {
    if (!selectedPrompt || !promptDraft) return;
    storePromptDrafts((current) => ({
      ...current,
      [String(selectedPrompt.id)]: { ...promptDraft, ...changes },
    }));
  };

  const savePrompt = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPrompt || !promptDraft) return;
    setSavingPrompt(true);
    setError(null);
    try {
      const updated = await updateAssistantPrompt(
        selectedPrompt.id,
        promptDraft.title,
        promptDraft.instructions,
      );
      setPrompts((current) =>
        current.map((prompt) => prompt.id === updated.id ? updated : prompt),
      );
      storePromptDrafts((current) => withoutKey(current, String(updated.id)));
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSavingPrompt(false);
    }
  };

  const removePrompt = async () => {
    if (!selectedPrompt) return;
    if (!window.confirm(`Delete “${selectedPrompt.title}”? Existing chats will keep their copy.`)) {
      return;
    }
    try {
      await deleteAssistantPrompt(selectedPrompt.id);
      const next = prompts.filter((prompt) => prompt.id !== selectedPrompt.id);
      setPrompts(next);
      setSelectedPromptId(next[0]?.id ?? null);
      storePromptDrafts((current) => withoutKey(current, String(selectedPrompt.id)));
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    }
  };

  const promptChanged = selectedPrompt !== null && promptDraft !== null &&
    (selectedPrompt.title !== promptDraft.title ||
      selectedPrompt.instructions !== promptDraft.instructions);
  const canSend = apiKeyConfigured &&
    (selectedConversation !== null || selectedPrompt !== null) &&
    chatDraft.trim().length > 0 &&
    !sending;

  return (
    <section className="dash-section dash-section--assistant">
      <header className="dash-section__head assistant-head">
        <ViewToggle
          value={pane}
          options={ASSISTANT_PANES}
          label="Assistant pane"
          onChange={selectPane}
        />
      </header>

      {error && (
        <div className="assistant-error" role="alert">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <div className="assistant-slot" hidden={pane !== "chat"}>
        <div className="assistant-workspace">
          <aside className="assistant-list" aria-label="Past chats">
            <button
              type="button"
              className="assistant-new"
              disabled={sending}
              onClick={startNewChat}
            >
              <span aria-hidden="true">{plusIcon}</span>
              New chat
            </button>
            <div className="assistant-list__scroll">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={
                    conversation.id === selectedConversationId
                      ? "assistant-chat-row assistant-chat-row--active"
                      : "assistant-chat-row"
                  }
                >
                  {rename.editingId === conversation.id ? (
                    <input
                      autoFocus
                      className="assistant-chat-row__input"
                      aria-label="Chat title"
                      value={rename.draft}
                      maxLength={80}
                      onChange={(event) => rename.setDraft(event.target.value)}
                      onBlur={rename.commit}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") rename.commit();
                        if (event.key === "Escape") rename.cancel();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="assistant-chat-row__title"
                      disabled={sending}
                      onClick={() => selectConversation(conversation.id)}
                    >
                      {conversation.title}
                    </button>
                  )}
                  <button
                    type="button"
                    className="assistant-row-action"
                    aria-label={`Rename ${conversation.title}`}
                    title="Rename chat"
                    disabled={sending}
                    onClick={() => rename.start(conversation.id, conversation.title)}
                  >
                    {editIcon}
                  </button>
                  <button
                    type="button"
                    className="assistant-row-action assistant-row-action--delete"
                    aria-label={`Delete ${conversation.title}`}
                    title="Delete chat"
                    disabled={sending}
                    onClick={() => void removeConversation(conversation)}
                  >
                    {trashIcon}
                  </button>
                </div>
              ))}
              {!loading && conversations.length === 0 && (
                <p className="assistant-list__empty">Your chats will gather here.</p>
              )}
            </div>
          </aside>

          <div className="assistant-chat">
            <div className="assistant-chat__toolbar">
              {selectedConversation ? (
                <>
                  <span className="assistant-chat__prompt">{selectedConversation.promptTitle}</span>
                  <span className="assistant-chat__model">
                    {ASSISTANT_MODELS.find((option) => option.value === selectedConversation.model)?.label}
                  </span>
                </>
              ) : (
                <>
                  <MenuSelect
                    value={selectedPromptId === null ? "" : String(selectedPromptId)}
                    options={prompts.map((prompt) => ({
                      value: String(prompt.id),
                      label: prompt.title,
                    }))}
                    placeholder="Choose a prompt"
                    ariaLabel="System prompt"
                    className="assistant-chat__select"
                    onChange={(value) => setSelectedPromptId(Number(value))}
                  />
                  <MenuSelect
                    value={model}
                    options={[...ASSISTANT_MODELS]}
                    placeholder="Choose a model"
                    ariaLabel="OpenAI model"
                    className="assistant-chat__model-select"
                    onChange={(value) => setModel(value as AssistantModel)}
                  />
                </>
              )}
            </div>

            <div className="assistant-thread" aria-live="polite">
              {messagesLoading ? (
                <p className="assistant-thread__status">Opening chat…</p>
              ) : messages.length === 0 && pendingUserMessage === null ? (
                <div className="assistant-welcome">
                  <p>What feels stuck?</p>
                  <span>The assistant can see your current Active Tasks.</span>
                </div>
              ) : (
                messages.map((message) => (
                  <article
                    key={message.id}
                    className={`assistant-message assistant-message--${message.role}`}
                  >
                    <span className="assistant-message__role">
                      {message.role === "assistant" ? "Assistant" : "You"}
                    </span>
                    <div>{message.content}</div>
                  </article>
                ))
              )}
              {pendingUserMessage && (
                <article className="assistant-message assistant-message--user">
                  <span className="assistant-message__role">You</span>
                  <div>{pendingUserMessage}</div>
                </article>
              )}
              {sending && (
                <article className="assistant-message assistant-message--assistant assistant-message--streaming">
                  <span className="assistant-message__role">Assistant</span>
                  <div>{streamedResponse || <span className="assistant-thinking">Thinking…</span>}</div>
                </article>
              )}
              <div ref={threadEndRef} />
            </div>

            <form className="assistant-composer" onSubmit={submitMessage}>
              {!apiKeyConfigured && (
                <button type="button" className="assistant-composer__notice" onClick={() => selectPane("config")}>
                  Add an OpenAI API key in Config
                </button>
              )}
              {apiKeyConfigured && prompts.length === 0 && selectedConversation === null && (
                <button type="button" className="assistant-composer__notice" onClick={() => selectPane("config")}>
                  Create a system prompt in Config
                </button>
              )}
              <textarea
                value={chatDraft}
                rows={1}
                maxLength={24_000}
                placeholder="Message Assistant"
                aria-label="Message Assistant"
                disabled={sending}
                onChange={(event) => {
                  const value = event.target.value;
                  storeChatDrafts((current) => ({ ...current, [chatDraftKey]: value }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />
              <button type="submit" className="assistant-send" disabled={!canSend} aria-label="Send message">
                {sendIcon}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="assistant-slot" hidden={pane !== "config"}>
        <div className="assistant-config">
          <form className="assistant-key" onSubmit={saveApiKey}>
            <div>
              <strong>OpenAI key</strong>
              <span>
                {apiKeyConfigured ? "Connected · saved in your system keychain" : "Required for chat"}
              </span>
            </div>
            <input
              type="password"
              value={apiKey}
              autoComplete="off"
              placeholder={apiKeyConfigured ? "Replace API key" : "sk-…"}
              aria-label={apiKeyConfigured ? "Replace OpenAI API key" : "OpenAI API key"}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <button type="submit" className="btn-accent" disabled={!apiKey.trim() || savingKey}>
              {savingKey ? "Saving…" : apiKeyConfigured ? "Replace" : "Save key"}
            </button>
            {apiKeyConfigured && (
              <button type="button" className="assistant-key__remove" onClick={() => void removeApiKey()}>
                Remove
              </button>
            )}
          </form>
          <p className="assistant-privacy">
            Each message sends this chat and your current Active Tasks to OpenAI. Chat history stays in Nest.
          </p>

          <div className="assistant-prompt-workspace">
            <aside className="assistant-list assistant-prompt-list" aria-label="System prompts">
              <button type="button" className="assistant-new" onClick={() => void addPrompt()}>
                <span aria-hidden="true">{plusIcon}</span>
                New prompt
              </button>
              <div className="assistant-list__scroll">
                {prompts.map((prompt) => (
                  <button
                    key={prompt.id}
                    type="button"
                    className={
                      prompt.id === selectedPromptId
                        ? "assistant-prompt-row assistant-prompt-row--active"
                        : "assistant-prompt-row"
                    }
                    onClick={() => setSelectedPromptId(prompt.id)}
                  >
                    {promptDrafts[String(prompt.id)]?.title || prompt.title}
                  </button>
                ))}
              </div>
            </aside>

            {selectedPrompt && promptDraft ? (
              <form className="assistant-prompt-editor" onSubmit={savePrompt}>
                <label>
                  <span>Name</span>
                  <input
                    value={promptDraft.title}
                    maxLength={80}
                    onChange={(event) => updatePromptDraft({ title: event.target.value })}
                  />
                </label>
                <label className="assistant-prompt-editor__instructions">
                  <span>System prompt</span>
                  <textarea
                    value={promptDraft.instructions}
                    maxLength={12_000}
                    onChange={(event) => updatePromptDraft({ instructions: event.target.value })}
                  />
                </label>
                <p>Current Active Tasks are included automatically.</p>
                <div className="assistant-prompt-editor__actions">
                  <button type="button" className="assistant-delete" onClick={() => void removePrompt()}>
                    {trashIcon}
                    Delete
                  </button>
                  <button
                    type="submit"
                    className="btn-accent"
                    disabled={!promptChanged || !promptDraft.title.trim() || !promptDraft.instructions.trim() || savingPrompt}
                  >
                    {savingPrompt ? "Saving…" : "Save"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="assistant-prompt-empty">
                <p>Create a prompt to shape the assistant.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
