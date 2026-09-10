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
  useFloatingBrainDumps,
  type FloatingBrainDump,
} from "../../lib/floatingBrainDumps";
import { submitBrainDump } from "../../lib/commands";
import { trimBrainDumpHtml } from "../../lib/brainDumpRichText";
import {
  getBrainDumpDraft,
  setBrainDumpDraft,
  trimBrainDumpDraft,
  type BrainDumpDraft,
} from "../../lib/brainDumpDraft";
import { FloatingBrainDumpsBoard } from "../components/FloatingBrainDumpsBoard";
import { useDashboardData } from "./DashboardDataContext";

type FloatingBrainDumpsContextValue = {
  /** Copy a draft (or saved dump text+tags) into a new unsaved sticky. */
  forkToFloating: (draft: BrainDumpDraft) => boolean;
};

const FloatingBrainDumpsContext =
  createContext<FloatingBrainDumpsContextValue | null>(null);

/**
 * Must wrap content inside `.dashboard` so the sticky board (rendered here)
 * inherits theme tokens like --surface and --dump.
 */
export function FloatingBrainDumpsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { tags, mutate } = useDashboardData();
  const [submitting, setSubmitting] = useState(false);
  const {
    dumps,
    board,
    hidden,
    toggleHidden,
    addDump,
    updateDump,
    removeDump,
    dockDump,
    undockDump,
    updateBoard,
    bringToFront,
    bringBoardToFront,
    reclampToBoard,
  } = useFloatingBrainDumps();

  const handleViewportResize = useCallback(
    (width: number, height: number) => {
      reclampToBoard(width, height);
    },
    [reclampToBoard],
  );

  // This provider wraps the whole dashboard, so anything that changes its
  // context value re-renders every consumer — including the brain dump entries
  // inside the timeline. Reading the notes through a ref keeps the value
  // constant while stickies are typed in.
  const dumpsRef = useRef(dumps);
  dumpsRef.current = dumps;

  const forkToFloating = useCallback(
    (draft: BrainDumpDraft) => {
      const next = createFloatingFromDraft(
        draft,
        dumpsRef.current,
        window.innerWidth,
        window.innerHeight,
      );
      if (!next) return false;
      addDump(next);
      return true;
    },
    [addDump],
  );

  const promoteFloatingDump = useCallback(
    (dump: FloatingBrainDump) => {
      const mainDraft = getBrainDumpDraft();
      const mainEmpty = !trimBrainDumpDraft(mainDraft);
      // Commit the swap synchronously so a rapid second click sees the updated
      // sticky content instead of reusing the pre-swap snapshot.
      flushSync(() => {
        setBrainDumpDraft({ text: dump.text, tagIds: dump.tagIds });
        if (mainEmpty) removeDump(dump.id);
        else {
          updateDump(dump.id, {
            text: mainDraft.text,
            tagIds: mainDraft.tagIds,
          });
        }
      });
    },
    [removeDump, updateDump],
  );

  const submitFloatingDump = useCallback(
    async (dump: FloatingBrainDump) => {
      if (!trimBrainDumpHtml(dump.text) || submitting) return;
      setSubmitting(true);
      const ok = await mutate(() => submitBrainDump(dump.text, dump.tagIds));
      if (ok) removeDump(dump.id);
      setSubmitting(false);
    },
    [mutate, removeDump, submitting],
  );

  const contextValue = useMemo(() => ({ forkToFloating }), [forkToFloating]);

  return (
    <FloatingBrainDumpsContext.Provider value={contextValue}>
      {children}
      <FloatingBrainDumpsBoard
        dumps={dumps}
        board={board}
        tags={tags}
        hidden={hidden}
        onToggleHidden={toggleHidden}
        onTextChange={(id, text) => updateDump(id, { text })}
        onTagsChange={(id, tagIds) => updateDump(id, { tagIds })}
        onColorChange={(id, color) => updateDump(id, { color })}
        onMinimisedChange={(id, minimised) => updateDump(id, { minimised })}
        onPositionChange={(id, x, y) => updateDump(id, { x, y })}
        onSizeChange={(id, width, height) =>
          updateDump(id, { width, height })
        }
        onDock={dockDump}
        onUndock={undockDump}
        onBoardChange={updateBoard}
        onPromote={promoteFloatingDump}
        onRemove={removeDump}
        onSubmit={(dump) => void submitFloatingDump(dump)}
        onBringToFront={bringToFront}
        onBringBoardToFront={bringBoardToFront}
        onViewportResize={handleViewportResize}
      />
    </FloatingBrainDumpsContext.Provider>
  );
}

export function useFloatingBrainDumpsContext() {
  const ctx = useContext(FloatingBrainDumpsContext);
  if (!ctx) {
    throw new Error(
      "useFloatingBrainDumpsContext must be used within FloatingBrainDumpsProvider",
    );
  }
  return ctx;
}
