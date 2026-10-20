import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import {
  createFloatingFromDraft,
  useFloatingNotes,
  type FloatingNote,
} from "../../lib/floatingNotes";
import { submitNote } from "../../lib/commands";
import { trimNoteHtml } from "../../lib/noteRichText";
import {
  getNoteDraft,
  setNoteDraft,
  trimNoteDraft,
  type NoteDraft,
} from "../../lib/noteDraft";
import { FloatingNoteBoard } from "../components/FloatingNoteBoard";
import { useDashboardData } from "./DashboardDataContext";

type FloatingNotesContextValue = {
  /** Copy a draft (or saved note text+tags) into a new unsaved sticky. */
  forkToFloating: (draft: NoteDraft) => boolean;
};

const FloatingNotesContext =
  createContext<FloatingNotesContextValue | null>(null);

/**
 * Must wrap content inside `.dashboard` so the sticky board (rendered here)
 * inherits theme tokens like --surface and --note.
 */
export function FloatingNotesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { tags, mutate } = useDashboardData();
  const [submitting, setSubmitting] = useState(false);
  const {
    notes,
    board,
    hidden,
    toggleHidden,
    addNote,
    updateNote,
    removeNote,
    removeUnchangedNote,
    dockNote,
    undockNote,
    updateBoard,
    bringToFront,
    bringBoardToFront,
    reclampToBoard,
  } = useFloatingNotes();

  const handleViewportResize = useCallback(
    (width: number, height: number) => {
      reclampToBoard(width, height);
    },
    [reclampToBoard],
  );

  // This provider wraps the whole dashboard, so anything that changes its
  // context value re-renders every consumer — including the note entries
  // inside the timeline. Reading the notes through a ref keeps the value
  // constant while stickies are typed in.
  const notesRef = useRef(notes);
  notesRef.current = notes;

  const forkToFloating = useCallback(
    (draft: NoteDraft) => {
      const next = createFloatingFromDraft(
        draft,
        notesRef.current,
        window.innerWidth,
        window.innerHeight,
      );
      if (!next) return false;
      addNote(next);
      return true;
    },
    [addNote],
  );

  const promoteFloatingNote = useCallback(
    (note: FloatingNote) => {
      const mainDraft = getNoteDraft();
      const mainEmpty = !trimNoteDraft(mainDraft);
      // Commit the swap synchronously so a rapid second click sees the updated
      // sticky content instead of reusing the pre-swap snapshot.
      flushSync(() => {
        setNoteDraft({ text: note.text, tagIds: note.tagIds });
        if (mainEmpty) removeNote(note.id);
        else {
          updateNote(note.id, {
            text: mainDraft.text,
            tagIds: mainDraft.tagIds,
          });
        }
      });
    },
    [removeNote, updateNote],
  );

  const submitFloatingNote = useCallback(
    async (note: FloatingNote) => {
      const submitted = { text: note.text, tagIds: [...note.tagIds] };
      if (!trimNoteHtml(submitted.text) || submitting) return;
      setSubmitting(true);
      const ok = await mutate(() =>
        submitNote(submitted.text, submitted.tagIds),
      );
      if (ok) removeUnchangedNote(note.id, submitted);
      setSubmitting(false);
    },
    [mutate, removeUnchangedNote, submitting],
  );

  const contextValue = useMemo(() => ({ forkToFloating }), [forkToFloating]);

  return (
    <FloatingNotesContext.Provider value={contextValue}>
      {children}
      <FloatingNoteBoard
        notes={notes}
        board={board}
        tags={tags}
        hidden={hidden}
        onToggleHidden={toggleHidden}
        onTextChange={(id, text) => updateNote(id, { text })}
        onTagsChange={(id, tagIds) => updateNote(id, { tagIds })}
        onColorChange={(id, color) => updateNote(id, { color })}
        onMinimisedChange={(id, minimised) => updateNote(id, { minimised })}
        onPositionChange={(id, x, y) => updateNote(id, { x, y })}
        onSizeChange={(id, width, height) =>
          updateNote(id, { width, height })
        }
        onDock={dockNote}
        onUndock={undockNote}
        onBoardChange={updateBoard}
        onPromote={promoteFloatingNote}
        onRemove={removeNote}
        onSubmit={(note) => void submitFloatingNote(note)}
        onBringToFront={bringToFront}
        onBringBoardToFront={bringBoardToFront}
        onViewportResize={handleViewportResize}
      />
    </FloatingNotesContext.Provider>
  );
}

export function useFloatingNotesContext() {
  const ctx = useContext(FloatingNotesContext);
  if (!ctx) {
    throw new Error(
      "useFloatingNotesContext must be used within FloatingNotesProvider",
    );
  }
  return ctx;
}
