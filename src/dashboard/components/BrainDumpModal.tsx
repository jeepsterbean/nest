import { useEffect, useRef, useState, type FormEvent } from "react";
import { submitBrainDump } from "../../lib/commands";
import { useDashboardData } from "../context/DashboardDataContext";

export function BrainDumpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { mutate } = useDashboardData();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedText = text.trim();
    if (!trimmedText || submitting) return;
    setSubmitting(true);
    const ok = await mutate(() =>
      submitBrainDump(trimmedText, trimmedTitle || null),
    );
    if (ok) {
      setTitle("");
      setText("");
      onClose();
    }
    setSubmitting(false);
  };

  return (
    <div
      className="brain-dump-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        id="brain-dump-composer"
        className="brain-dump-composer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="brain-dump-title"
        onSubmit={onSubmit}
      >
        <div className="brain-dump-composer__head">
          <h2 id="brain-dump-title">Brain dump</h2>
          <button
            type="button"
            className="brain-dump-composer__close"
            onClick={onClose}
            aria-label="Close brain dump"
          >
            ×
          </button>
        </div>
        <input
          type="text"
          className="brain-dump-composer__title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder="Optional title"
          aria-label="Brain dump title"
        />
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          aria-label="Brain dump text"
          rows={8}
        />
        <div className="brain-dump-composer__actions">
          <button
            type="button"
            className="brain-dump-composer__cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="brain-dump-composer__submit"
            disabled={!text.trim() || submitting}
          >
            {submitting ? "Saving..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
