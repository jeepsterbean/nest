import { useEffect, useRef, type CSSProperties } from "react";
import { noteStorageToDisplayHtml } from "../../lib/noteRichText";
import type { Note } from "../../lib/types";
import { formatDate, formatTime } from "../lib/time";
import "./SavedNote.css";

export function SavedNote({ note, preview = false }: {
  note: Note;
  /** History preview: a day heading names the date and the caller pins the Tags. */
  preview?: boolean;
}) {
  // History is a static snapshot: unfold lists so all text is readable without controls.
  const html = noteStorageToDisplayHtml(note.text)
    .replace(/<(\/?)details\b[^>]*>/gi, "<$1div>")
    .replace(/<(\/?)summary\b[^>]*>/gi, "<$1p>");

  return (
    <article className="saved-note" aria-label="Saved note">
      <time dateTime={new Date(note.createdAt * 1000).toISOString()}>
        {preview ? "" : `${formatDate(note.createdAt)} · `}{formatTime(note.createdAt)}
      </time>
      <div className="event-note__text" dangerouslySetInnerHTML={{ __html: html }} />
      {!preview && note.tags.length > 0 && (
        <div className="event-note__tags" aria-label="Note tags">
          {note.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}
        </div>
      )}
    </article>
  );
}

export type SavedNotePosition = { x: number; y: number };

export function SavedNotePopover({ note, open, position, onClose }: {
  note: Note;
  open: boolean;
  position: SavedNotePosition | null;
  onClose: () => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideInteraction = (event: PointerEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsideInteraction, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideInteraction, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  if (!open || !position) return null;
  return (
    <div
      ref={popoverRef}
      className="saved-note-popover"
      role="dialog"
      aria-label="Saved note, read only"
      tabIndex={-1}
      style={{ left: position.x + 12, top: position.y } as CSSProperties}
    >
      <SavedNote note={note} />
    </div>
  );
}
