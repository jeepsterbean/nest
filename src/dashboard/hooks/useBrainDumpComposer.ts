import { useCallback, useState, type KeyboardEvent } from "react";
import { submitBrainDump } from "../../lib/commands";
import {
  isBrainDumpPeelShortcut,
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
  useBrainDumpDraft,
} from "../../lib/brainDumpDraft";
import { useDashboardData } from "../context/DashboardDataContext";
import { useFloatingBrainDumpsContext } from "../context/FloatingBrainDumpsContext";

/** Draft lifecycle for the Core Today composer: edit, save with Cmd/Ctrl+Enter,
 * peel with Shift+Enter. */
export function useBrainDumpComposer() {
  const { mutate } = useDashboardData();
  const { forkToFloating } = useFloatingBrainDumpsContext();
  const [draft, setDraft] = useBrainDumpDraft();
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
    if (submitting || !trimBrainDumpDraft(draft)) return;
    setSubmitting(true);
    const ok = await mutate(() => submitBrainDump(draft.text, draft.tagIds));
    if (ok) {
      setDraft({ text: "", tagIds: [] });
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
    if (isBrainDumpPeelShortcut(keys)) {
      event.preventDefault();
      peelToFloating();
      return;
    }
    if (isBrainDumpSubmitShortcut(keys)) {
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
