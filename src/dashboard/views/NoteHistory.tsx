import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { updateNoteTags } from "../../lib/commands";
import type { Note } from "../../lib/types";
import { trimNoteDraft } from "../../lib/noteDraft";
import { NoteTags } from "../components/NoteTags";
import { NoteFilters } from "../components/NoteFilters";
import { NoteSurface } from "../components/NoteSurface";
import { floatingDraftIcon } from "../components/icons";
import {
  SavedNote,
  SavedNotePopover,
  type SavedNotePosition,
} from "../components/SavedNote";
import { useDashboardData } from "../context/DashboardDataContext";
import { useFloatingNotesContext } from "../context/FloatingNotesContext";
import { filterNoteHistory } from "../lib/noteHistory";
import { dayLabel, formatTime, startOfDayMs } from "../lib/time";
import { selectedDayMs as resolveSelectedDayMs, singleDayPicker, stepSelectedDay } from "../lib/dateNavigation";
import { useNoteComposer } from "../hooks/useNoteComposer";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useNotesForDay } from "../hooks/useNotesForDay";

function PeelToStickyButton({
  className,
  disabled = false,
  onClick,
}: {
  className?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={className}
      aria-label="Make note a floating draft"
      title="Make floating draft"
      disabled={disabled}
      onClick={onClick}
    >
      {floatingDraftIcon}
    </button>
  );
}

function NoteTodayComposer() {
  const { tags } = useDashboardData();
  const composer = useNoteComposer();
  const nowMs = useCurrentTime();
  const nowSec = Math.floor(nowMs / 1000);

  return (
    <div className="note-history__item note-history__item--composer">
      <NoteSurface
        layout="panel"
        className="note-surface--anchored"
        text={composer.draft.text}
        tagIds={composer.draft.tagIds}
        tags={tags}
        textareaLabel="Note"
        headerStart={
          <time
            className="note-history-controls__submitted"
            dateTime={new Date(nowMs).toISOString()}
            aria-label="Current time"
          >
            {formatTime(nowSec)}
          </time>
        }
        headerEnd={
          <div className="note-history-controls">
            <PeelToStickyButton
              disabled={!trimNoteDraft(composer.draft)}
              onClick={composer.peelToFloating}
            />
          </div>
        }
        onTextChange={composer.setText}
        onTagsChange={composer.setTagIds}
        dismissPopupsOnOutsideInteraction
        onKeyDown={(event) => composer.handleShortcutKeyDown(event)}
      />
    </div>
  );
}

export function NoteHistory({ sectionSidebar, visible }: {
  sectionSidebar: HTMLElement | null;
  visible: boolean;
}) {
  const { tags, mutate } = useDashboardData();
  const { forkToFloating } = useFloatingNotesContext();
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [tagId, setTagId] = useState("");
  const [openedNote, setOpenedNote] = useState<{
    note: Note;
    position: SavedNotePosition;
  } | null>(null);
  const nowMs = useCurrentTime();
  const selectedDayMs = resolveSelectedDayMs(anchorMs, nowMs);
  const todayMs = startOfDayMs(nowMs / 1000);
  const isToday = selectedDayMs === todayMs;
  const { notes: loadedNotes, loaded } = useNotesForDay(selectedDayMs, nowMs);
  const dayNotes = useMemo(
    () => filterNoteHistory(loadedNotes, selectedDayMs, ""),
    [loadedNotes, selectedDayMs],
  );
  const notes = useMemo(
    () => filterNoteHistory(dayNotes, selectedDayMs, tagId),
    [dayNotes, selectedDayMs, tagId],
  );
  const selectedLabel = dayLabel(selectedDayMs / 1000, nowMs);
  const showGrid = isToday || notes.length > 0;
  const showEmpty = notes.length === 0 && (!isToday || Boolean(tagId) || !loaded);

  const openNote = (note: Note, event: MouseEvent<HTMLElement>) => {
    setOpenedNote({ note, position: { x: event.clientX, y: event.clientY } });
  };

  const openNoteFromKeyboard = (note: Note, event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setOpenedNote({ note, position: { x: rect.right, y: rect.top + rect.height / 2 } });
  };

  return (
    <div className="note-history">
      <NoteFilters
        sectionSidebar={sectionSidebar}
        visible={visible}
        notes={dayNotes}
        loaded={loaded}
        dayLabel={selectedLabel}
        onPreviousDay={() => setAnchorMs((current) => stepSelectedDay(current, -1, nowMs))}
        onNextDay={() => setAnchorMs((current) => stepSelectedDay(current, 1, nowMs))}
        canGoNext={selectedDayMs < todayMs}
        onToday={() => setAnchorMs(null)}
        dayPicker={singleDayPicker(selectedDayMs, nowMs, setAnchorMs)}
        tagId={tagId}
        onTagChange={setTagId}
      />
      {showGrid && (
        <section className="note-history__day" aria-label={selectedLabel}>
          <div className="note-history__grid">
            {isToday ? <NoteTodayComposer /> : null}
            {notes.map((note, index) => (
              <div
                key={note.id}
                className={`note-history__item${
                  isToday && index < 3 ? " note-history__item--wide" : ""
                }`}
              >
                <PeelToStickyButton
                  className="event-note__edit-title note-history__peel"
                  onClick={() =>
                    forkToFloating({
                      text: note.text,
                      tagIds: note.tags.map((tag) => tag.id),
                    })
                  }
                />
                <div
                  className="note-history__open"
                  role="button"
                  tabIndex={0}
                  aria-label="Open saved note"
                  onClick={(event) => openNote(note, event)}
                  onKeyDown={(event) => openNoteFromKeyboard(note, event)}
                >
                  <SavedNote note={note} preview />
                </div>
                <NoteTags
                  tags={tags}
                  selectedIds={note.tags.map((tag) => tag.id)}
                  selectedOnly
                  onChange={(tagIds) => void mutate(() => updateNoteTags(note.id, tagIds))}
                />
              </div>
            ))}
          </div>
        </section>
      )}
      {openedNote && (
        <SavedNotePopover
          note={openedNote.note}
          open
          position={openedNote.position}
          onClose={() => setOpenedNote(null)}
        />
      )}
      {showEmpty && <p className="empty-state" role="status">
        {loaded ? "No notes on this day with these tags." : "Loading notes…"}
      </p>}
    </div>
  );
}
