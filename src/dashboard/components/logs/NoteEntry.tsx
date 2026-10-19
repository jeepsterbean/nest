import { useState, type MouseEvent } from "react";
import { noteSummary } from "../../../lib/noteRichText";
import { updateNoteTags } from "../../../lib/commands";
import type { Note } from "../../../lib/types";
import { floatingDraftIcon, tagsIcon } from "../icons";
import { NoteTags } from "../NoteTags";
import { useDashboardData } from "../../context/DashboardDataContext";
import { useFloatingNotesContext } from "../../context/FloatingNotesContext";
import { SavedNotePopover, type SavedNotePosition } from "../SavedNote";

export function NoteEntry({
  note,
  expanded,
  onToggle,
}: {
  note: Note;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { tags, mutate } = useDashboardData();
  const [popoverPosition, setPopoverPosition] = useState<SavedNotePosition | null>(null);
  const { forkToFloating } = useFloatingNotesContext();
  const [editingTags, setEditingTags] = useState(false);
  const [tagDraft, setTagDraft] = useState<number[]>([]);
  const [savingTags, setSavingTags] = useState(false);
  const summary = noteSummary(note.text);

  const startTagEdit = () => {
    setTagDraft(note.tags.map((tag) => tag.id));
    setEditingTags(true);
  };

  const saveTags = async () => {
    setSavingTags(true);
    if (await mutate(() => updateNoteTags(note.id, tagDraft))) {
      setEditingTags(false);
    }
    setSavingTags(false);
  };

  const forkNote = () => {
    forkToFloating({
      text: note.text,
      tagIds: note.tags.map((tag) => tag.id),
    });
  };

  const openNote = (event: MouseEvent<HTMLButtonElement>) => {
    setPopoverPosition({ x: event.clientX, y: event.clientY });
    if (!expanded) onToggle();
  };

  const closeNote = () => {
    setPopoverPosition(null);
    if (expanded) onToggle();
  };

  return (
    <div className="event-note">
      <div className="event-note__head">
        <button
          type="button"
          className="event-note__toggle"
          aria-expanded={expanded}
          aria-haspopup="dialog"
          onClick={openNote}
        >
          <span className="event-note__chevron" aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          {note.tags.length > 0 ? (
            <span className="event-note__inline-tags" aria-label="Note tags">
              {note.tags.map((tag) => (
                <span key={tag.id} title={tag.name}>
                  {tag.name}
                </span>
              ))}
            </span>
          ) : null}
          <span className="event-note__title">{summary}</span>
        </button>
        <button
          type="button"
          className="event-note__edit-title"
          onClick={forkNote}
          aria-label="Fork note as floating draft"
          title="Fork as floating draft"
        >
          {floatingDraftIcon}
        </button>
        <button
          type="button"
          className="event-note__edit-title"
          onClick={startTagEdit}
          aria-label="Edit note tags"
          title="Edit tags"
        >
          {tagsIcon}
        </button>
      </div>
      {editingTags ? (
        <div className="event-note__tag-editor">
          <NoteTags
            tags={tags}
            selectedIds={tagDraft}
            autoOpen
            onChange={setTagDraft}
          />
          <div className="event-note__tag-actions">
            <button type="button" disabled={savingTags} onClick={() => setEditingTags(false)}>
              Cancel
            </button>
            <button type="button" disabled={savingTags} onClick={() => void saveTags()}>
              Save
            </button>
          </div>
        </div>
      ) : null}
      <SavedNotePopover
        note={note}
        open={expanded}
        position={popoverPosition}
        onClose={closeNote}
      />
    </div>
  );
}
