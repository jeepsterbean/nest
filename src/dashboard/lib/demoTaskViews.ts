import { normalizeTaskTableLayout } from "./taskTable";
import {
  DEFAULT_TASK_TABLE_QUERY,
  MAX_SAVED_TASK_VIEWS,
  readSavedTaskViews,
  writeSavedTaskViews,
  type SavedTaskView,
} from "./taskTableViews";

const DEMO_OPEN_TASKS_SEEDED_KEY = "nest:demo-open-tasks-seeded";

const OPEN_TASKS_VIEW: SavedTaskView = {
  id: "demo-open-tasks",
  name: "Open tasks",
  query: {
    ...DEFAULT_TASK_TABLE_QUERY,
    statuses: ["backlog", "up_next", "active"],
    sort: [{ column: "status", direction: "descending" }],
    columns: normalizeTaskTableLayout({
      order: ["status", "title", "scope", "value", "effort", "updated", "parent", "workedTime", "created", "closed"],
      widths: { status: 224, title: 484, scope: 192, value: 90, effort: 96, updated: 198 },
      hidden: ["parent", "workedTime", "created", "closed"],
    }),
  },
};

export function readDemoTaskViews(storage: Storage = localStorage) {
  const state = readSavedTaskViews(storage);
  // Seed once so later demo edits, including deleting this view, persist.
  if (storage.getItem(DEMO_OPEN_TASKS_SEEDED_KEY)) return state;
  if (state.views.length >= MAX_SAVED_TASK_VIEWS) return state;
  const existing = state.views.find((view) => view.name.toLowerCase() === OPEN_TASKS_VIEW.name.toLowerCase());
  const seeded = {
    views: existing ? state.views : [...state.views, OPEN_TASKS_VIEW],
    selectedId: existing?.id ?? OPEN_TASKS_VIEW.id,
  };
  writeSavedTaskViews(seeded, storage);
  storage.setItem(DEMO_OPEN_TASKS_SEEDED_KEY, "true");
  return seeded;
}
