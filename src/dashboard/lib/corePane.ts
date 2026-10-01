export const CORE_PANES = [
  { key: "brainDump", label: "Brain dump" },
  { key: "tasks", label: "Tasks" },
  { key: "metrics", label: "Metrics" },
  { key: "phases", label: "Phases" },
] as const;

export type CorePane = (typeof CORE_PANES)[number]["key"];

export type CorePaneControls = {
  pane: CorePane;
  onSelectPane: (pane: CorePane) => void;
};

const CORE_PANE_KEY = "nest:core-pane";

type PaneStorage = Pick<Storage, "getItem" | "setItem">;

const isCorePane = (value: string | null): value is CorePane =>
  CORE_PANES.some((pane) => pane.key === value);

/** Brain dump is the default Core pane. An unknown stored value falls back. */
export const readCorePane = (storage: PaneStorage = localStorage): CorePane => {
  const stored = storage.getItem(CORE_PANE_KEY);
  return isCorePane(stored) ? stored : "brainDump";
};

export const writeCorePane = (
  key: CorePane,
  storage: PaneStorage = localStorage,
) => {
  storage.setItem(CORE_PANE_KEY, key);
};
