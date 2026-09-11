import { useEffect, useState, type FormEvent } from "react";
import {
  assistantApiKeyConfigured,
  deleteAssistantApiKey,
  setAssistantApiKey,
} from "../../lib/commands";

export function AssistantSettings() {
  const [apiKey, setApiKey] = useState("");
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void assistantApiKeyConfigured().then(setConfigured).catch((cause: unknown) => setError(String(cause)));
  }, []);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await setAssistantApiKey(apiKey);
      setApiKey("");
      setConfigured(true);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remove the OpenAI API key from the system keychain?")) return;
    try {
      await deleteAssistantApiKey();
      setConfigured(false);
    } catch (cause) {
      setError(String(cause));
    }
  };

  return (
    <div className="settings-pane">
      <form className="assistant-key" onSubmit={(event) => void save(event)}>
        <div>
          <strong>OpenAI key</strong>
          <span>{configured ? "Connected" : "Required for chat"}</span>
        </div>
        <input
          type="password"
          value={apiKey}
          autoComplete="off"
          placeholder={configured ? "Replace API key" : "sk-…"}
          aria-label={configured ? "Replace OpenAI API key" : "OpenAI API key"}
          onChange={(event) => setApiKey(event.target.value)}
        />
        <button type="submit" className="btn-accent" disabled={!apiKey.trim() || saving}>
          {saving ? "Saving…" : configured ? "Replace" : "Save key"}
        </button>
        {configured && <button type="button" className="assistant-key__remove" onClick={() => void remove()}>Remove</button>}
      </form>
      {error && <p className="assistant-config__warning" role="alert">{error}</p>}
    </div>
  );
}
