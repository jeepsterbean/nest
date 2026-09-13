import { useRef, useState, type FormEvent } from "react";
import {
  createAssistantPrompt,
  deleteAssistantPrompt,
  updateAssistantPrompt,
  MAX_ASSISTANT_PROMPT_CHARS,
  MAX_ASSISTANT_TITLE_CHARS,
} from "../../lib/commands";
import type { AssistantPrompt, AssistantSystemInstructionVersion } from "../../lib/types";
import type { DashboardData } from "../context/DashboardDataContext";
import { plusIcon, trashIcon, xIcon } from "../components/icons";
import { readPromptDrafts, writePromptDrafts, type PromptDraft } from "../lib/assistant";
import { MenuSelect } from "../components/MenuSelect";
import {
  DEFAULT_TEMPLATE,
  MAX_CONTEXT_DUMPS,
  SAMPLE_MESSAGE,
  SIGNAL_LABELS,
  TASK_GROUPS,
  TEMPLATE_TOKENS,
  buildAssistantMessage,
  defaultSelection,
  describeOption,
  formatSignal,
  messageTimePrefix,
  parseRecentOption,
  parseTaskOption,
  type AssistantConfig,
  type Signal,
  type SignalOption,
  type TaskDetail,
  type TaskGroup,
} from "../lib/assistantContext";
import { formatDate, formatTime } from "../lib/time";

type StoreConfig = (update: (current: AssistantConfig) => AssistantConfig) => void;
const NEW_PROMPT_TEXT = "What would you like help with?";

const TASK_DETAIL_LABELS: Record<keyof TaskDetail, string> = {
  status: "Status",
  scope: "Scope",
  description: "Description",
  blockers: "Blockers",
  parent: "Parent",
  children: "Children",
  value: "Value",
  effort: "Effort",
  workedTime: "Worked time",
  created: "Created",
  updated: "Updated",
};

type RangeUnit = "count" | "minutes";

const UNIT_OPTIONS: Record<Exclude<Signal, "tasks">, { value: RangeUnit; label: string }[]> = {
  dumps: [{ value: "count", label: "dumps" }, { value: "minutes", label: "minutes" }],
  metrics: [{ value: "count", label: "check-ins" }, { value: "minutes", label: "minutes" }],
  // Phase is a window of sessions, so it only has minutes.
  phase: [{ value: "minutes", label: "minutes" }],
};

// Chat reads the dashboard's 30-day history (HISTORY_WINDOW_DAYS): a count option is the newest N
// within it, never older. A day is the widest window worth offering.
const MAX_AMOUNT: Record<RangeUnit, number> = { count: 50, minutes: 24 * 60 };
const maxAmount = (signal: Signal, unit: RangeUnit) =>
  signal === "dumps" && unit === "count" ? MAX_CONTEXT_DUMPS : MAX_AMOUNT[unit];
const MAX_OPTION_NAME = 40;

/** An option being edited; `id` is null until a new option is first saved. */
type OptionDraft = {
  id: string | null;
  name: string;
  amount: string;
  unit: RangeUnit;
  groups: TaskGroup[];
};

function draftFromOption(option: SignalOption): OptionDraft {
  const range = parseRecentOption(option.key);
  return {
    id: option.id,
    name: option.name,
    amount: range ? String("count" in range ? range.count : range.minutes) : "",
    unit: range && "count" in range ? "count" : "minutes",
    groups: parseTaskOption(option.key) ?? [],
  };
}

function draftKey(signal: Signal, draft: OptionDraft) {
  if (signal === "tasks") {
    return TASK_GROUPS.filter((group) => draft.groups.includes(group.key)).map((group) => group.key).join("+") || null;
  }
  if (!/^\d+$/.test(draft.amount.trim())) return null;
  const amount = Number(draft.amount);
  if (amount < 1 || amount > maxAmount(signal, draft.unit)) return null;
  return draft.unit === "count" ? `last:${amount}` : `window:${amount}`;
}

function OptionEditor({
  signal,
  draft,
  saved,
  onDraftChange,
  onSave,
  onCancel,
}: {
  signal: Signal;
  draft: OptionDraft;
  saved: SignalOption | null;
  onDraftChange: (draft: OptionDraft) => void;
  onSave: (option: Omit<SignalOption, "id">) => void;
  onCancel: () => void;
}) {
  const key = draftKey(signal, draft);
  const name = draft.name.trim();
  const changed = saved === null || saved.name !== name || saved.key !== key;
  const amountError = signal !== "tasks" && draft.amount.trim() !== "" && key === null
    ? `Enter a whole number from 1 to ${maxAmount(signal, draft.unit)}.`
    : null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name && key && changed) onSave({ name, key });
  };

  return (
    <form className="assistant-option-editor" onSubmit={submit}>
      <div className="assistant-config__intro">
        <strong>{saved ? "Edit option" : "New option"}</strong>
      </div>
      <label className="assistant-option-editor__field">
        <span>Name</span>
        <input
          value={draft.name}
          maxLength={MAX_OPTION_NAME}
          onChange={(event) => onDraftChange({ ...draft, name: event.target.value })}
        />
      </label>
      {signal === "tasks" ? (
        <div className="assistant-option-editor__field">
          <span>Include</span>
          <div className="assistant-chips">
            {TASK_GROUPS.map((group) => (
              <label key={group.key}>
                <input
                  type="checkbox"
                  checked={draft.groups.includes(group.key)}
                  onChange={() => onDraftChange({
                    ...draft,
                    groups: draft.groups.includes(group.key)
                      ? draft.groups.filter((item) => item !== group.key)
                      : [...draft.groups, group.key],
                  })}
                />
                {group.label}
              </label>
            ))}
          </div>
        </div>
      ) : (
        <div className="assistant-option-editor__field">
          <span>Covers</span>
          <div className="assistant-option-editor__range">
            Last
            <input
              type="text"
              inputMode="numeric"
              value={draft.amount}
              placeholder="3"
              aria-label="Amount"
              autoFocus={saved === null}
              onChange={(event) => onDraftChange({ ...draft, amount: event.target.value })}
            />
            {UNIT_OPTIONS[signal].length > 1 ? (
              <MenuSelect
                value={draft.unit}
                options={UNIT_OPTIONS[signal]}
                placeholder="Unit"
                ariaLabel="Unit"
                className="assistant-option-editor__unit"
                onChange={(unit) => onDraftChange({ ...draft, unit: unit as RangeUnit })}
              />
            ) : (
              UNIT_OPTIONS[signal][0].label
            )}
          </div>
        </div>
      )}
      {amountError && <p className="assistant-config__warning">{amountError}</p>}
      <div className="assistant-option-editor__actions">
        <button type="button" className="assistant-config__reset" disabled={saved !== null && !changed} onClick={onCancel}>
          {saved ? "Revert" : "Discard"}
        </button>
        <button type="submit" className="btn-accent" disabled={!name || !key || !changed}>
          Save
        </button>
      </div>
    </form>
  );
}

export function SignalSection({
  signal,
  config,
  data,
  storeConfig,
  onDefaultChange,
}: {
  signal: Signal;
  config: AssistantConfig;
  data: DashboardData;
  storeConfig: StoreConfig;
  onDefaultChange: (signal: Signal, id: string | null) => void;
}) {
  const { options, defaultOption } = config.signals[signal];
  const [draft, setDraft] = useState<OptionDraft | null>(() => {
    const first = options.find((option) => option.id === defaultOption) ?? options[0];
    return first ? draftFromOption(first) : null;
  });
  const [newName, setNewName] = useState("");
  const saved = options.find((option) => option.id === draft?.id) ?? null;
  const previewKey = draft ? draftKey(signal, draft) : null;
  const now = Math.floor(Date.now() / 1000);
  const output = previewKey ? formatSignal(signal, previewKey, data, config.taskDetail, now) : "";
  const { menu } = SIGNAL_LABELS[signal];

  const storeOptions = (update: (current: SignalOption[]) => SignalOption[]) => storeConfig((current) => ({
    ...current,
    signals: {
      ...current.signals,
      [signal]: { ...current.signals[signal], options: update(current.signals[signal].options) },
    },
  }));

  const startNewOption = (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    const unit = signal === "tasks" ? "minutes" : UNIT_OPTIONS[signal][0].value;
    setDraft({ id: null, name, amount: "", unit, groups: [] });
    setNewName("");
  };

  const saveOption = (fields: Omit<SignalOption, "id">) => {
    const option = { id: saved?.id ?? crypto.randomUUID(), ...fields };
    storeOptions((current) =>
      saved ? current.map((item) => item.id === saved.id ? option : item) : [...current, option],
    );
    setDraft(draftFromOption(option));
  };

  const removeOption = (option: SignalOption) => {
    if (option.id === defaultOption) onDefaultChange(signal, null);
    storeOptions((current) => current.filter((item) => item.id !== option.id));
    if (draft?.id === option.id) setDraft(null);
  };

  return (
    <div className="assistant-signal">
      <div className="assistant-signal__options">
        <ul className="assistant-option-list">
          {options.map((option) => (
            <li
              key={option.id}
              className={option.id === draft?.id ? "assistant-option assistant-option--shown" : "assistant-option"}
            >
              <button
                type="button"
                className="assistant-option__label"
                aria-pressed={option.id === draft?.id}
                onClick={() => setDraft(draftFromOption(option))}
              >
                {option.name}
                <small>{describeOption(signal, option.key)}</small>
              </button>
              <button
                type="button"
                className={option.id === defaultOption ? "assistant-option__default assistant-option__default--on" : "assistant-option__default"}
                aria-pressed={option.id === defaultOption}
                title={option.id === defaultOption ? "Stop preselecting this option" : "Preselect this option on new chats"}
                onClick={() => onDefaultChange(signal, option.id === defaultOption ? null : option.id)}
              >
                Default
              </button>
              <button
                type="button"
                className="assistant-option__remove"
                aria-label={`Remove ${option.name}`}
                onClick={() => removeOption(option)}
              >
                ×
              </button>
            </li>
          ))}
          {draft && draft.id === null && (
            <li className="assistant-option assistant-option--shown">
              <span className="assistant-option__label">
                {draft.name.trim() || "Untitled"}
                <small>Not saved</small>
              </span>
            </li>
          )}
        </ul>
        <form className="assistant-option-new" onSubmit={startNewOption}>
          <input
            value={newName}
            maxLength={MAX_OPTION_NAME}
            placeholder="Name a new option"
            aria-label="New option name"
            onChange={(event) => setNewName(event.target.value)}
          />
          <button type="submit" disabled={!newName.trim()}>Add</button>
        </form>
        {signal === "dumps" && (
          <p className="assistant-config__note">
            At most {MAX_CONTEXT_DUMPS} brain dumps go with a message, newest first, however wide the option.
          </p>
        )}

        {draft && (
          <OptionEditor
            key={draft.id ?? "new"}
            signal={signal}
            draft={draft}
            saved={saved}
            onDraftChange={setDraft}
            onSave={saveOption}
            onCancel={() => setDraft(saved ? draftFromOption(saved) : null)}
          />
        )}

        {signal === "tasks" && (
          <div className="assistant-config__group">
            <div className="assistant-config__intro">
              <strong>Task detail</strong>
            </div>
            <div className="assistant-chips">
              {(Object.keys(TASK_DETAIL_LABELS) as (keyof TaskDetail)[]).map((field) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={config.taskDetail[field]}
                    onChange={() => storeConfig((current) => ({
                      ...current,
                      taskDetail: { ...current.taskDetail, [field]: !current.taskDetail[field] },
                    }))}
                  />
                  {TASK_DETAIL_LABELS[field]}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="assistant-config__preview">
        <div className="assistant-config__intro">
          <strong>{draft?.name.trim() ? `${menu} · ${draft.name.trim()}` : "Current records"}</strong>
        </div>
        <pre className="assistant-output">
          {!data.loaded
            ? "Loading current records…"
            : !draft
            ? "Select or add an option to preview it."
            : !previewKey
              ? "Finish configuring this option to preview it."
              : output || "No current records fall in this option, so it sends nothing."}
        </pre>
      </div>
    </div>
  );
}

export function SystemInstructionsSection({
  draft,
  versions,
  onDraftChange,
  onSave,
}: {
  draft: string;
  versions: AssistantSystemInstructionVersion[];
  onDraftChange: (draft: string) => void;
  onSave: () => void;
}) {
  const [selectedVersion, setSelectedVersion] = useState<AssistantSystemInstructionVersion | null>(null);

  return (
    <div className="assistant-system-instructions">
      <aside className="assistant-system-instruction-versions" aria-label="Saved system instructions">
        <strong>Saved</strong>
        {versions.map((version) => (
          <button
            key={version.id}
            type="button"
            className="assistant-system-instruction-versions__item"
            aria-label={`Open system instructions saved ${formatDate(version.savedAt)} at ${formatTime(version.savedAt)}`}
            onClick={() => setSelectedVersion(version)}
          >
            {formatDate(version.savedAt)} · {formatTime(version.savedAt)}
          </button>
        ))}
      </aside>
      <div className="assistant-config__editor assistant-system-instructions__editor">
        <div className="assistant-config__intro">
          <strong>System instructions</strong>
        </div>
        <textarea
          value={draft}
          maxLength={MAX_ASSISTANT_PROMPT_CHARS}
          aria-label="System instructions"
          onChange={(event) => onDraftChange(event.target.value)}
        />
        <button
          type="button"
          className="btn-accent"
          disabled={!draft.trim()}
          onClick={onSave}
        >
          Save
        </button>
      </div>
      {selectedVersion && (
        <aside
          className="assistant-system-instruction-panel"
          aria-label="Saved system instructions"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSelectedVersion(null);
          }}
        >
          <header className="assistant-system-instruction-panel__head">
            <span>{formatDate(selectedVersion.savedAt)} · {formatTime(selectedVersion.savedAt)}</span>
            <button
              type="button"
              aria-label="Close saved system instructions"
              title="Close"
              autoFocus
              onClick={() => setSelectedVersion(null)}
            >
              {xIcon}
            </button>
          </header>
          <pre>{selectedVersion.instructions}</pre>
          <button
            type="button"
            className="btn-accent"
            onClick={() => {
              onDraftChange(selectedVersion.instructions);
              setSelectedVersion(null);
            }}
          >
            Use as draft
          </button>
        </aside>
      )}
    </div>
  );
}

export function PromptSection({
  prompts,
  selectedPromptId,
  onSelectPrompt,
  onPromptsChange,
  onError,
}: {
  prompts: AssistantPrompt[];
  selectedPromptId: number | null;
  onSelectPrompt: (id: number | null) => void;
  onPromptsChange: (prompts: AssistantPrompt[]) => void;
  onError: (error: unknown) => void;
}) {
  const [drafts, setDrafts] = useState(readPromptDrafts);
  const [saving, setSaving] = useState(false);
  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedPromptId) ?? null;
  const draft = selectedPrompt
    ? drafts[String(selectedPrompt.id)] ?? selectedPrompt
    : null;
  const changed = selectedPrompt !== null && draft !== null &&
    (selectedPrompt.title !== draft.title || selectedPrompt.instructions !== draft.instructions);

  const storeDrafts = (update: (current: Record<string, PromptDraft>) => Record<string, PromptDraft>) => {
    setDrafts((current) => {
      const next = update(current);
      writePromptDrafts(next);
      return next;
    });
  };

  const addPrompt = async () => {
    try {
      const created = await createAssistantPrompt("New prompt", NEW_PROMPT_TEXT);
      onPromptsChange([created, ...prompts]);
      onSelectPrompt(created.id);
    } catch (error) {
      onError(error);
    }
  };

  const savePrompt = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedPrompt || !draft) return;
    setSaving(true);
    try {
      const updated = await updateAssistantPrompt(selectedPrompt.id, draft.title, draft.instructions);
      onPromptsChange(prompts.map((prompt) => prompt.id === updated.id ? updated : prompt));
      storeDrafts((current) => {
        const next = { ...current };
        delete next[String(updated.id)];
        return next;
      });
    } catch (error) {
      onError(error);
    } finally {
      setSaving(false);
    }
  };

  const removePrompt = async () => {
    if (!selectedPrompt || !window.confirm(`Delete “${selectedPrompt.title}”?`)) return;
    try {
      await deleteAssistantPrompt(selectedPrompt.id);
      onPromptsChange(prompts.filter((prompt) => prompt.id !== selectedPrompt.id));
      onSelectPrompt(null);
      storeDrafts((current) => {
        const next = { ...current };
        delete next[String(selectedPrompt.id)];
        return next;
      });
    } catch (error) {
      onError(error);
    }
  };

  return (
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
              className={prompt.id === selectedPromptId ? "assistant-prompt-row assistant-prompt-row--active" : "assistant-prompt-row"}
              onClick={() => onSelectPrompt(prompt.id)}
            >
              {drafts[String(prompt.id)]?.title || prompt.title}
            </button>
          ))}
        </div>
      </aside>

      {selectedPrompt && draft ? (
        <form className="assistant-prompt-editor" onSubmit={savePrompt}>
          <label>
            <span>Name</span>
            <input
              value={draft.title}
              maxLength={MAX_ASSISTANT_TITLE_CHARS}
              onChange={(event) => storeDrafts((current) => ({
                ...current,
                [String(selectedPrompt.id)]: { ...draft, title: event.target.value },
              }))}
            />
          </label>
          <label className="assistant-prompt-editor__instructions">
            <span>Prompt text</span>
            <textarea
              value={draft.instructions}
              maxLength={MAX_ASSISTANT_PROMPT_CHARS}
              onChange={(event) => storeDrafts((current) => ({
                ...current,
                [String(selectedPrompt.id)]: { ...draft, instructions: event.target.value },
              }))}
            />
          </label>
          <div className="assistant-prompt-editor__actions">
            <button type="button" className="assistant-delete" onClick={() => void removePrompt()}>
              {trashIcon}
              Delete
            </button>
            <button type="submit" className="btn-accent" disabled={!changed || !draft.title.trim() || !draft.instructions.trim() || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div className="assistant-prompt-empty">
          <p>Create a prompt to shape the assistant.</p>
        </div>
      )}
    </div>
  );
}

export function LayoutSection({
  config,
  data,
  storeConfig,
}: {
  config: AssistantConfig;
  data: DashboardData;
  storeConfig: StoreConfig;
}) {
  const templateRef = useRef<HTMLTextAreaElement | null>(null);
  const selection = defaultSelection(config);
  const instructions = config.systemInstructions.trim();
  const now = Math.floor(Date.now() / 1000);
  const input = messageTimePrefix(now) +
    buildAssistantMessage(data, config, selection, SAMPLE_MESSAGE, now);

  const insertToken = (token: string) => {
    const field = templateRef.current;
    const start = field?.selectionStart ?? config.template.length;
    const end = field?.selectionEnd ?? start;
    const text = `{${token}}`;
    storeConfig((current) => ({
      ...current,
      template: current.template.slice(0, start) + text + current.template.slice(end),
    }));
    requestAnimationFrame(() => {
      field?.focus();
      field?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  return (
    <div className="assistant-signal">
      <div className="assistant-config__editor">
        <div className="assistant-config__intro">
          <strong>Message template</strong>
        </div>
        <div className="assistant-token-row">
          {TEMPLATE_TOKENS.map((token) => (
            <button key={token} type="button" className="assistant-token" onClick={() => insertToken(token)}>
              {`{${token}}`}
              <span>
                {token === "message"
                  ? "your text"
                  : config.signals[token].options.find((option) => option.id === selection[token])?.name ?? "no default"}
              </span>
            </button>
          ))}
        </div>
        <textarea
          ref={templateRef}
          value={config.template}
          maxLength={4_000}
          aria-label="Message template"
          onChange={(event) => storeConfig((current) => ({ ...current, template: event.target.value }))}
        />
        {!config.template.includes("{message}") && (
          <p className="assistant-config__warning">No {"{message}"} token, so your message is added at the end.</p>
        )}
        <button
          type="button"
          className="assistant-config__reset"
          disabled={config.template === DEFAULT_TEMPLATE}
          onClick={() => storeConfig((current) => ({ ...current, template: DEFAULT_TEMPLATE }))}
        >
          Reset to default
        </button>
      </div>

      <div className="assistant-config__preview">
        <div className="assistant-config__intro">
          <strong>Final output</strong>
        </div>
        <div className="assistant-output-part">
          <span>instructions</span>
          <pre className="assistant-output">{instructions || "Nothing yet."}</pre>
        </div>
        <div className="assistant-output-part">
          <span>input · your message, stamped with the time you send it</span>
          <pre className="assistant-output">{data.loaded ? input : "Loading current records…"}</pre>
        </div>
      </div>
    </div>
  );
}
