import { useState } from "react";

// Collapses the repeated inline-rename routine (task title, metric name, phase
// name): click to edit, Enter/blur commits, Escape cancels. The edit field is
// always cleared on commit; the rename only fires when the trimmed value is
// non-empty and actually changed.
export function useInlineRename(opts: {
  rename: (id: number, next: string) => Promise<unknown>;
  isUnchanged: (id: number, next: string) => boolean;
  mutate: (fn: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const start = (id: number, current: string) => {
    setEditingId(id);
    setDraft(current);
  };

  const cancel = () => setEditingId(null);

  const commit = () => {
    if (editingId === null) return;
    const next = draft.trim();
    const id = editingId;
    setEditingId(null);
    if (!next) return;
    if (opts.isUnchanged(id, next)) return;
    void opts.mutate(() => opts.rename(id, next));
  };

  return { editingId, draft, setDraft, start, commit, cancel };
}
