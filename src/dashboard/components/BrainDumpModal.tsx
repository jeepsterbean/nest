import { useEffect, useRef, useState, type FormEvent } from "react";
import { submitBrainDump } from "../../lib/commands";
import {
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
  useBrainDumpDraft,
} from "../../lib/brainDumpDraft";
import { useDashboardData } from "../context/DashboardDataContext";

export function BrainDumpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { mutate } = useDashboardData();
  const [draft, setDraft] = useBrainDumpDraft();
  const { title, text } = draft;
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = trimBrainDumpDraft(draft);
    if (!trimmed.text || submitting) return;
    setSubmitting(true);
    const ok = await mutate(() =>
      submitBrainDump(trimmed.text, trimmed.title),
    );
    if (ok) {
      setDraft({ title: "", text: "" });
      onClose();
    }
    setSubmitting(false);
  };

  return (
    <dialog
      ref={dialogRef}
      className="brain-dump-overlay"
      aria-labelledby="brain-dump-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        id="brain-dump-composer"
        className="brain-dump-composer"
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
          onChange={(e) =>
            setDraft((draft) => ({ ...draft, title: e.target.value }))
          }
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
          }}
          placeholder="Optional title"
          aria-label="Brain dump title"
        />
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) =>
            setDraft((draft) => ({ ...draft, text: e.target.value }))
          }
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (
              isBrainDumpSubmitShortcut({
                ...e,
                isComposing: e.nativeEvent.isComposing,
              })
            ) {
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
    </dialog>
  );
}
