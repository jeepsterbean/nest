import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  createFloatingFromDraft,
  useFloatingBrainDumps,
  type FloatingBrainDump,
} from "../../lib/floatingBrainDumps";
import { submitBrainDump } from "../../lib/commands";
import {
  trimBrainDumpDraft,
  useBrainDumpDraft,
  type BrainDumpDraft,
} from "../../lib/brainDumpDraft";
import { FloatingBrainDumpsBoard } from "../components/FloatingBrainDumpsBoard";
import { useDashboardData } from "./DashboardDataContext";

type FloatingBrainDumpsContextValue = {
  dumps: FloatingBrainDump[];
  addDump: (dump: FloatingBrainDump) => void;
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
  const [brainDumpDraft, setBrainDumpDraft] = useBrainDumpDraft();
  const [submitting, setSubmitting] = useState(false);
  const {
    dumps,
    addDump,
    updateDump,
    removeDump,
    bringToFront,
    reclampToBoard,
  } = useFloatingBrainDumps();

  const handleViewportResize = useCallback(
    (width: number, height: number) => {
      reclampToBoard(width, height);
    },
    [reclampToBoard],
  );

  const forkToFloating = useCallback(
    (draft: BrainDumpDraft) => {
      const next = createFloatingFromDraft(
        draft,
        dumps,
        window.innerWidth,
        window.innerHeight,
      );
      if (!next) return false;
      addDump(next);
      return true;
    },
    [addDump, dumps],
  );

  const promoteFloatingDump = useCallback(
    (dump: FloatingBrainDump) => {
      const mainDraft = brainDumpDraft;
      const mainEmpty = !trimBrainDumpDraft(mainDraft);
      setBrainDumpDraft({ text: dump.text, tagIds: dump.tagIds });
      if (mainEmpty) removeDump(dump.id);
      else updateDump(dump.id, { text: mainDraft.text, tagIds: mainDraft.tagIds });
    },
    [brainDumpDraft, removeDump, setBrainDumpDraft, updateDump],
  );

  const submitFloatingDump = useCallback(
    async (dump: FloatingBrainDump) => {
      const text = dump.text.trim();
      if (!text || submitting) return;
      setSubmitting(true);
      const ok = await mutate(() => submitBrainDump(text, dump.tagIds));
      if (ok) removeDump(dump.id);
      setSubmitting(false);
    },
    [mutate, removeDump, submitting],
  );

  return (
    <FloatingBrainDumpsContext.Provider value={{ dumps, addDump, forkToFloating }}>
      {children}
      <FloatingBrainDumpsBoard
        dumps={dumps}
        tags={tags}
        onTextChange={(id, text) => updateDump(id, { text })}
        onTagsChange={(id, tagIds) => updateDump(id, { tagIds })}
        onColorChange={(id, color) => updateDump(id, { color })}
        onPositionChange={(id, x, y) => updateDump(id, { x, y })}
        onSizeChange={(id, width, height) =>
          updateDump(id, { width, height })
        }
        onPromote={promoteFloatingDump}
        onRemove={removeDump}
        onSubmit={(dump) => void submitFloatingDump(dump)}
        onBringToFront={bringToFront}
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
