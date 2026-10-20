import { useCallback, useState, type KeyboardEvent } from "react";
import { submitNote } from "../../lib/commands";
import {
  clearNoteDraftIfUnchanged,
  isNotePeelShortcut,
  isNoteSubmitShortcut,
  trimNoteDraft,
  useNoteDraft,
} from "../../lib/noteDraft";
import { useDashboardData } from "../context/DashboardDataContext";
import { useFloatingNotesContext } from "../context/FloatingNotesContext";

/** Draft lifecycle for the Today composer: edit, save with Cmd/Ctrl+Enter,
 * peel with Shift+Enter. */
export function useNoteComposer() {
  const { mutate } = useDashboardData();
  const { forkToFloating } = useFloatingNotesContext();
  const [draft, setDraft] = useNoteDraft();
  const [submitting, setSubmitting] = useState(false);

  const setText = useCallback(
    (text: string) => setDraft((current) => ({ ...current, text })),
    [setDraft],
  );
  const setTagIds = useCallback(
    (tagIds: number[]) => setDraft((current) => ({ ...current, tagIds })),
    [setDraft],
  );

  const submit = async (afterSubmit?: () => Promise<void>) => {
    const submitted = { text: draft.text, tagIds: [...draft.tagIds] };
    if (submitting || !trimNoteDraft(submitted)) return;
    setSubmitting(true);
    const ok = await mutate(() => submitNote(submitted.text, submitted.tagIds));
    if (ok) {
      clearNoteDraftIfUnchanged(submitted);
      await afterSubmit?.();
    }
    setSubmitting(false);
  };

  const peelToFloating = useCallback(() => {
    if (forkToFloating(draft)) setDraft({ text: "", tagIds: [] });
  }, [draft, forkToFloating, setDraft]);

  const handleShortcutKeyDown = (
    event: KeyboardEvent<HTMLElement>,
    afterSubmit?: () => Promise<void>,
  ) => {
    const keys = {
      key: event.key,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      isComposing: event.nativeEvent.isComposing,
    };
    if (isNotePeelShortcut(keys)) {
      event.preventDefault();
      peelToFloating();
      return;
    }
    if (isNoteSubmitShortcut(keys)) {
      event.preventDefault();
      void submit(afterSubmit);
    }
  };

  return {
    draft,
    submitting,
    setText,
    setTagIds,
    submit,
    peelToFloating,
    handleShortcutKeyDown,
  };
}
