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
  deleteAssistantConversation,
  deleteAssistantPrompt,
  listAssistantConversations,
  listAssistantMessages,
  listAssistantPrompts,
  renameAssistantConversation,
  sendAssistantMessage,
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
import { useDashboardData } from "../context/DashboardDataContext";
import {
  ASSISTANT_MODELS,
  ASSISTANT_PANES,
  CHAT_CONFIG_SECTIONS,
  SYSTEM_CONFIG_SECTIONS,
  readAssistantConfig,
  readAssistantPane,
  readChatDrafts,
  readPromptDrafts,
  requestAssistantConfig,
  takeAssistantConfigRequest,
  writeAssistantConfig,
  writeAssistantPane,
  writeChatDrafts,
  writePromptDrafts,
  type AssistantPane,
  type ConfigSection,
  type PromptDraft,
} from "../lib/assistant";
import {
  SIGNALS,
  SIGNAL_LABELS,
  buildAssistantMessage,
  defaultSelection,
  type AssistantConfig,
  type Signal,
} from "../lib/assistantContext";
import {
  LayoutSection,
  SignalSection,
  SystemInstructionsSection,
} from "./AssistantConfigSections";

const NEW_PROMPT_TEXT = "What would you like help with?";

function errorMessage(error: unknown) {
  return String(error).replace(/^assistant error:\s*/i, "");
}

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export function AssistantView({
  chatOnly = false,
  onOpenDashboard,
  onOpenSettings,
}: {
  chatOnly?: boolean;
  onOpenDashboard?: () => void;
  onOpenSettings?: () => void;
}) {
  const dashboardData = useDashboardData();
  const [pane, setPane] = useState<AssistantPane>(() =>
    chatOnly ? "chat" : readAssistantPane(),
  );
  const [prompts, setPrompts] = useState<AssistantPrompt[]>([]);
  const [conversations, setConversations] = useState<AssistantConversation[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [model, setModel] = useState<AssistantModel>("gpt-5.6-luna");
  const [config, setConfig] = useState(readAssistantConfig);
  const [selection, setSelection] = useState(() => defaultSelection(config));
  const [configSection, setConfigSection] = useState<ConfigSection>("dumps");
  const [chatDrafts, setChatDrafts] = useState(readChatDrafts);
  const [promptDrafts, setPromptDrafts] = useState(readPromptDrafts);
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
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
          : null,
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

  // The popup and dashboard each hold a copy of the drafts, and the popup's
  // Config notices leave a section for the dashboard; catch up on window focus.
  useEffect(() => {
    const syncWithOtherWindow = () => {
      setChatDrafts(readChatDrafts());
      const section = chatOnly ? null : takeAssistantConfigRequest();
      if (!section) return;
      writeAssistantPane("config");
      setPane("config");
      setConfigSection(section);
    };
    syncWithOtherWindow();
    window.addEventListener("focus", syncWithOtherWindow);
    return () => window.removeEventListener("focus", syncWithOtherWindow);
  }, [chatOnly]);

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

  const storeConfig = (update: (current: AssistantConfig) => AssistantConfig) => {
    setConfig((current) => {
      const next = update(current);
      writeAssistantConfig(next);
      return next;
    });
  };

  // A new default applies to the chat being composed too, not only the next new chat.
  const setSignalDefault = (signal: Signal, key: string | null) => {
    storeConfig((current) => ({
      ...current,
      signals: { ...current.signals, [signal]: { ...current.signals[signal], defaultOption: key } },
    }));
    setSelection((current) => ({ ...current, [signal]: key }));
  };

  const selectPane = (next: AssistantPane) => {
    writeAssistantPane(next);
    setPane(next);
  };

  const openConfig = (section: ConfigSection) => {
    if (chatOnly) {
      requestAssistantConfig(section);
      onOpenDashboard?.();
      return;
    }
    setConfigSection(section);
    selectPane("config");
  };

  const storeChatDrafts = (
    update: (current: Record<string, string>) => Record<string, string>,
  ) => {
    setChatDrafts(() => {
      // Start from storage, not this window's copy, so drafts saved by the
      // other window survive.
      const next = update(readChatDrafts());
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
    setSelection(defaultSelection(config));
    setError(null);
  };

  const selectConversation = (id: number) => {
    if (sending) return;
    setSelectedConversationId(id);
    setError(null);
  };

  const selectPrompt = (id: number) => {
    const prompt = prompts.find((item) => item.id === id);
    if (!prompt) return;
    setSelectedPromptId(id);
    storeChatDrafts((current) => ({ ...current, [chatDraftKey]: prompt.instructions }));
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
      !apiKeyConfigured
    ) return;

    setSending(true);
    setPendingUserMessage(content);
    setStreamedResponse("");
    setError(null);
    const outbound = buildAssistantMessage(dashboardData, config, selection, content);
    storeChatDrafts((current) => withoutKey(current, chatDraftKey));
    try {
      const turn = await sendAssistantMessage(
        {
          conversationId: selectedConversationId,
          model,
          content,
          context: outbound === content ? null : outbound,
          systemInstructions: config.systemInstructions.trim() || null,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
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

  const addPrompt = async () => {
    try {
      const created = await createAssistantPrompt("New prompt", NEW_PROMPT_TEXT);
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
    if (!window.confirm(`Delete “${selectedPrompt.title}”?`)) {
      return;
    }
    try {
      await deleteAssistantPrompt(selectedPrompt.id);
      const next = prompts.filter((prompt) => prompt.id !== selectedPrompt.id);
      setPrompts(next);
      setSelectedPromptId(null);
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
      {!chatOnly && (
        <header className="dash-section__head assistant-head">
          <ViewToggle
            value={pane}
            options={ASSISTANT_PANES}
            label="Assistant pane"
            onChange={selectPane}
          />
        </header>
      )}

      {error && (
        <div className="assistant-error" role="alert">
          <span>{error}</span>
          <button type="button" aria-label="Dismiss error" onClick={() => setError(null)}>
            ×
          </button>
        </div>
      )}

      <div className="assistant-slot" hidden={!chatOnly && pane !== "chat"}>
        <div className="assistant-workspace">
          {!chatOnly && <aside className="assistant-list" aria-label="Past chats">
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
          </aside>}

          <div className="assistant-chat">
            {chatOnly && (
              <div className="assistant-popup-chat-picker">
                <button
                  type="button"
                  className="assistant-new"
                  disabled={sending}
                  onClick={startNewChat}
                >
                  <span aria-hidden="true">{plusIcon}</span>
                  New chat
                </button>
                <MenuSelect
                  value={selectedConversationId === null ? "" : String(selectedConversationId)}
                  options={conversations.map((conversation) => ({
                    value: String(conversation.id),
                    label: conversation.title,
                  }))}
                  placeholder="New chat"
                  ariaLabel="Past chats"
                  onChange={(value) => selectConversation(Number(value))}
                />
              </div>
            )}
            <div className="assistant-chat__toolbar">
              {SIGNALS.map((signal) => {
                const { menu, section } = SIGNAL_LABELS[signal];
                return (
                  <MenuSelect
                    key={signal}
                    value={selection[signal] ?? ""}
                    options={[
                      { value: "", label: menu },
                      ...config.signals[signal].options.map((option) => ({
                        value: option.id,
                        label: `${menu} · ${option.name}`,
                      })),
                    ]}
                    placeholder={menu}
                    ariaLabel={`${section} context`}
                    onChange={(value) => setSelection((current) => ({ ...current, [signal]: value || null }))}
                  />
                );
              })}
            </div>

            <div className="assistant-thread" aria-live="polite">
              {messagesLoading ? (
                <p className="assistant-thread__status">Opening chat…</p>
              ) : messages.length === 0 && pendingUserMessage === null ? (
                <div className="assistant-welcome">
                  <p>What feels stuck?</p>
                  <span>Choose what to share with each message.</span>
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
                    {message.context && (
                      <details className="assistant-message__context">
                        <summary>Context sent</summary>
                        <pre>{message.context}</pre>
                      </details>
                    )}
                    {message.incompleteReason && (
                      <p className="assistant-message__incomplete">
                        Response incomplete: {message.incompleteReason}
                      </p>
                    )}
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
              {!apiKeyConfigured && (onOpenSettings ? (
                <button type="button" className="assistant-composer__notice" onClick={onOpenSettings}>
                  Add an OpenAI API key in Settings
                </button>
              ) : (
                <span className="assistant-composer__notice">Add an OpenAI API key in Settings</span>
              ))}
              {apiKeyConfigured && prompts.length === 0 && (
                <button type="button" className="assistant-composer__notice" onClick={() => openConfig("prompt")}>
                  Create a prompt in Config
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
              <MenuSelect
                value={selectedPromptId === null ? "" : String(selectedPromptId)}
                options={prompts.map((prompt) => ({ value: String(prompt.id), label: prompt.title }))}
                placeholder="Prompt"
                ariaLabel="Prompt"
                className="assistant-composer__prompt"
                onChange={(value) => value && selectPrompt(Number(value))}
              />
              <MenuSelect value={model} options={[...ASSISTANT_MODELS]} placeholder="Choose a model" ariaLabel="OpenAI model" className="assistant-composer__model" onChange={(value) => setModel(value as AssistantModel)} />
              <button type="submit" className="assistant-send" disabled={!canSend} aria-label="Send message">
                {sendIcon}
              </button>
            </form>
          </div>
        </div>
      </div>

      {!chatOnly && <div className="assistant-slot" hidden={pane !== "config"}>
        <div className="assistant-config">
          <aside className="assistant-config__sections" aria-label="Assistant config">
            <strong>Chat</strong>
            <ViewToggle
              value={configSection}
              options={CHAT_CONFIG_SECTIONS}
              label="Chat config"
              onChange={setConfigSection}
            />
            <strong>System</strong>
            <ViewToggle
              value={configSection}
              options={SYSTEM_CONFIG_SECTIONS}
              label="System config"
              onChange={setConfigSection}
            />
          </aside>

          {(SIGNALS as readonly string[]).includes(configSection) && (
            <SignalSection
              key={configSection}
              signal={configSection as Signal}
              config={config}
              storeConfig={storeConfig}
              onDefaultChange={setSignalDefault}
            />
          )}

          {configSection === "system" && (
            <SystemInstructionsSection config={config} storeConfig={storeConfig} />
          )}

          {configSection === "layout" && (
            <LayoutSection config={config} storeConfig={storeConfig} />
          )}

          {configSection === "prompt" && (
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
                    <span>Prompt text</span>
                    <textarea
                      value={promptDraft.instructions}
                      maxLength={12_000}
                      onChange={(event) => updatePromptDraft({ instructions: event.target.value })}
                    />
                  </label>
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
          )}
        </div>
      </div>}
    </section>
  );
}
