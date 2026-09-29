export const BRAIN_DUMP_PANES = [
  { key: "history", label: "History" },
  { key: "tags", label: "Tags" },
] as const;

export type BrainDumpPane = (typeof BRAIN_DUMP_PANES)[number]["key"];

const BRAIN_DUMP_PANE_KEY = "nest:brain-dump-pane";

type PaneStorage = Pick<Storage, "getItem" | "setItem">;

const isBrainDumpPane = (value: string | null): value is BrainDumpPane =>
  BRAIN_DUMP_PANES.some((pane) => pane.key === value);

/** History is the default Brain dump pane. An unknown stored value falls back. */
export const readBrainDumpPane = (
  storage: PaneStorage = localStorage,
): BrainDumpPane => {
  const stored = storage.getItem(BRAIN_DUMP_PANE_KEY);
  return isBrainDumpPane(stored) ? stored : "history";
};

export const writeBrainDumpPane = (
  key: BrainDumpPane,
  storage: PaneStorage = localStorage,
) => {
  storage.setItem(BRAIN_DUMP_PANE_KEY, key);
};
