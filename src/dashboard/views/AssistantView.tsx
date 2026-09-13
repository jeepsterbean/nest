import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  assistantApiKeyConfigured,
  deleteAssistantConversation,
  listAssistantConversations,
  listAssistantMessages,
  listAssistantPrompts,
  renameAssistantConversation,
  sendAssistantMessage,
  MAX_ASSISTANT_MESSAGE_CHARS,
  MAX_ASSISTANT_TITLE_CHARS,
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
  assistantIcon,
  settingsIcon,
  trashIcon,
  xIcon,
} from "../components/icons";
import { subscribeTauriEvent } from "../../lib/tauriListen";
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
  writeAssistantConfig,
  writeAssistantPane,
  writeChatDrafts,
  type AssistantPane,
  type ConfigSection,
} from "../lib/assistant";
import {
  ASSISTANT_HISTORY_CHANGED,
  createAssistantHistoryRefresh,
  shouldApplyAssistantHistory,
} from "../lib/assistantHistory";
import {
  SIGNALS,
  SIGNAL_LABELS,
  adoptConfigDefaults,
  buildAssistantMessage,
  defaultSelection,
  pruneSelection,
  type AssistantConfig,
  type Signal,
} from "../lib/assistantContext";
import {
  LayoutSection,
  PromptSection,
  SignalSection,
  SystemInstructionsSection,
} from "./AssistantConfigSections";

function errorMessage(error: unknown) {
  return String(error);
}

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

export function AssistantView({
  chatOnly = false,
  onOpenSettings,
}: {
  chatOnly?: boolean;
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
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [streamedResponse, setStreamedResponse] = useState("");
  const [openedMessage, setOpenedMessage] = useState<AssistantMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const threadEndRef = useRef<HTMLDivElement | null>(null);
  const selectedConversationIdRef = useRef(selectedConversationId);
  const sendingRef = useRef(sending);
  const messagesRef = useRef(messages);
  const configRef = useRef(config);
  selectedConversationIdRef.current = selectedConversationId;
  sendingRef.current = sending;
  messagesRef.current = messages;
  configRef.current = config;
  const refreshHistory = useRef(
    createAssistantHistoryRefresh({
      listConversations: listAssistantConversations,
      listMessages: listAssistantMessages,
    }),
  ).current;

  const load = useCallback(async () => {
    try {
      const [nextPrompts, keyConfigured] = await Promise.all([
        listAssistantPrompts(),
        assistantApiKeyConfigured(),
      ]);
      setPrompts(nextPrompts);
      setApiKeyConfigured(keyConfigured);
      setSelectedPromptId((current) =>
        current !== null && nextPrompts.some((prompt) => prompt.id === current)
          ? current
          : null,
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    }
  }, []);

  const syncHistory = useCallback(async () => {
    const started = {
      selectedConversationId: selectedConversationIdRef.current,
      sending: sendingRef.current,
    };
    const hasThread = started.selectedConversationId !== null &&
      messagesRef.current.some(
        (message) => message.conversationId === started.selectedConversationId,
      );
    if (started.selectedConversationId !== null && !started.sending && !hasThread) {
      setMessagesLoading(true);
    }
    try {
      const next = await refreshHistory({
        ...started,
        messages: messagesRef.current,
      });
      if (!next) {
        setMessagesLoading(false);
        return;
      }
      const apply = shouldApplyAssistantHistory(started, {
        selectedConversationId: selectedConversationIdRef.current,
        sending: sendingRef.current,
      });
      setConversations(next.conversations);
      if (apply.selection && next.selectedConversationId !== selectedConversationIdRef.current) {
        setSelectedConversationId(next.selectedConversationId);
      }
      if (apply.messages) setMessages(next.messages);
      setLoading(false);
      setMessagesLoading(false);
    } catch (loadError) {
      setError(errorMessage(loadError));
      setLoading(false);
      setMessagesLoading(false);
    }
  }, [refreshHistory]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void syncHistory();
  }, [syncHistory, selectedConversationId]);

  // Drafts and config live in localStorage; saved chats are SQLite. Focus is the
  // backup for all three, because the popup stays mounted while hidden.
  useEffect(() => {
    const syncWithOtherWindow = () => {
      setChatDrafts(readChatDrafts());
      const stored = readAssistantConfig();
      setSelection((current) => adoptConfigDefaults(configRef.current, stored, current));
      setConfig(stored);
      void syncHistory();
    };
    setChatDrafts(readChatDrafts());
    window.addEventListener("focus", syncWithOtherWindow);
    return () => window.removeEventListener("focus", syncWithOtherWindow);
  }, [syncHistory]);

  useEffect(
    () => subscribeTauriEvent(ASSISTANT_HISTORY_CHANGED, () => void syncHistory()),
    [syncHistory],
  );

  // Removing an option in Config leaves this chat pointing at an id that is gone.
  useEffect(() => {
    setSelection((current) => pruneSelection(config, current));
  }, [config]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, pendingUserMessage, streamedResponse]);

  useEffect(() => {
    setOpenedMessage(null);
  }, [selectedConversationId]);

  const chatDraftKey = selectedConversationId === null
    ? "new"
    : String(selectedConversationId);
  const chatDraft = chatDrafts[chatDraftKey] ?? "";
  const configGroup = SYSTEM_CONFIG_SECTIONS.some(({ key }) => key === configSection)
    ? "system"
    : "chat";

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

  const selectConfigGroup = (group: "chat" | "system") => {
    setConfigSection(group === "chat" ? "dumps" : "system");
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
    setOpenedMessage(null);
    setSelectedConversationId(null);
    setMessages([]);
    setSelection(defaultSelection(config));
    setError(null);
  };

  const selectConversation = (id: number) => {
    if (sending) return;
    setOpenedMessage(null);
    const conversation = conversations.find((item) => item.id === id);
    if (conversation) setModel(conversation.model);
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
      !apiKeyConfigured ||
      // Context renders from the loaded history; before it arrives every signal would read as empty.
      !dashboardData.loaded
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
          sentMessage: outbound,
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

  const canSend = apiKeyConfigured &&
    chatDraft.trim().length > 0 &&
    dashboardData.loaded &&
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
                      maxLength={MAX_ASSISTANT_TITLE_CHARS}
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
                const { menu, section, none } = SIGNAL_LABELS[signal];
                return (
                  <MenuSelect
                    key={signal}
                    value={selection[signal] ?? ""}
                    options={[
                      { value: "", label: none },
                      ...config.signals[signal].options.map((option) => ({
                        value: option.id,
                        label: `${menu} · ${option.name}`,
                      })),
                    ]}
                    placeholder={none}
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
                    <div className="assistant-message__head">
                      <span className="assistant-message__role">
                        {message.role === "assistant" ? "Assistant" : "You"}
                      </span>
                      {!chatOnly && message.role === "user" && message.sentMessage && (
                        <button
                          type="button"
                          className="assistant-message__open"
                          aria-label="Open message sent to Assistant"
                          title="Open sent message"
                          onClick={() => setOpenedMessage(message)}
                        >
                          Open
                        </button>
                      )}
                    </div>
                    <div>{message.content}</div>
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

            {openedMessage && (
              <aside
                className="assistant-sent-message"
                aria-label="Message sent to Assistant"
                onKeyDown={(event) => {
                  if (event.key === "Escape") setOpenedMessage(null);
                }}
              >
                <header className="assistant-sent-message__head">
                  <span>Sent to Assistant</span>
                  <button
                    type="button"
                    aria-label="Close sent message"
                    title="Close"
                    autoFocus
                    onClick={() => setOpenedMessage(null)}
                  >
                    {xIcon}
                  </button>
                </header>
                <div className="assistant-sent-message__body">
                  {openedMessage.systemInstructions && (
                    <section>
                      <h2>System instructions</h2>
                      <pre>{openedMessage.systemInstructions}</pre>
                    </section>
                  )}
                  <section>
                    <h2>Message</h2>
                    <pre>{openedMessage.sentMessage}</pre>
                  </section>
                </div>
              </aside>
            )}

            <form className="assistant-composer" onSubmit={submitMessage}>
              {!apiKeyConfigured && (onOpenSettings ? (
                <button type="button" className="assistant-composer__notice" onClick={onOpenSettings}>
                  Add an OpenAI API key in Settings
                </button>
              ) : (
                <span className="assistant-composer__notice">Add an OpenAI API key in Settings</span>
              ))}
              <textarea
                value={chatDraft}
                rows={1}
                maxLength={MAX_ASSISTANT_MESSAGE_CHARS}
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
            <button
              type="button"
              className={configGroup === "chat" ? "assistant-config__group-button assistant-config__group-button--active" : "assistant-config__group-button"}
              aria-label="Chat config"
              aria-pressed={configGroup === "chat"}
              onClick={() => selectConfigGroup("chat")}
            >
              {assistantIcon}
            </button>
            <button
              type="button"
              className={configGroup === "system" ? "assistant-config__group-button assistant-config__group-button--active" : "assistant-config__group-button"}
              aria-label="System config"
              aria-pressed={configGroup === "system"}
              onClick={() => selectConfigGroup("system")}
            >
              {settingsIcon}
            </button>
          </aside>

          <div className="assistant-config__content">
            <header className="assistant-config__tabs">
              <ViewToggle
                value={configSection}
                options={configGroup === "chat" ? CHAT_CONFIG_SECTIONS : SYSTEM_CONFIG_SECTIONS}
                label={`${configGroup} config`}
                onChange={setConfigSection}
              />
            </header>

            {(SIGNALS as readonly string[]).includes(configSection) && (
              <SignalSection
                key={configSection}
                signal={configSection as Signal}
                config={config}
                data={dashboardData}
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
              <PromptSection
                prompts={prompts}
                selectedPromptId={selectedPromptId}
                onSelectPrompt={setSelectedPromptId}
                onPromptsChange={setPrompts}
                onError={(promptError) => setError(errorMessage(promptError))}
              />
            )}
          </div>
        </div>
      </div>}
    </section>
  );
}
