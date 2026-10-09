import { useCallback, useEffect, useState } from "react";
import {
  createSavedTaskView,
  deleteSavedTaskView,
  RAW_TASK_VIEW_ID,
  overwriteSavedTaskView,
  readSavedTaskViews,
  renameSavedTaskView,
  sameTaskTableQuery,
  writeSavedTaskViews,
  type SavedTaskView,
  type SavedTaskViewResult,
  type SavedTaskViewState,
  type TaskTableQuery,
} from "../lib/taskTableViews";

export type TaskTableViews = ReturnType<typeof useTaskTableViews>;

/** The Tasks table query plus the saved views it can be loaded from or saved to.
 *  Unsaved edits live only in memory: a reload reopens the selected view as saved. */
export function useTaskTableViews() {
  const [state, setState] = useState<SavedTaskViewState>(readSavedTaskViews);
  const [query, setQuery] = useState<TaskTableQuery>(
    () => state.views.find((view) => view.id === state.selectedId)!.query,
  );

  useEffect(() => writeSavedTaskViews(state), [state]);

  const selected = state.views.find((view) => view.id === state.selectedId)!;
  const edited = !sameTaskTableQuery(selected.query, query);

  const applyResult = useCallback((result: SavedTaskViewResult, selectedId?: string) => {
    if (result.ok) {
      setState((current) => ({ views: result.views, selectedId: selectedId ?? current.selectedId }));
    }
    return result;
  }, []);

  // Switching drops unsaved edits without asking: a few filter changes are quick to redo,
  // and a prompt on every switch would interrupt more than it protects.
  const select = useCallback((view: SavedTaskView) => {
    setState((current) => ({ ...current, selectedId: view.id }));
    setQuery(view.query);
  }, []);

  const save = () => applyResult(overwriteSavedTaskView(state.views, selected.id, query));
  const revert = () => setQuery(selected.query);

  const create = (name: string) => {
    const result = createSavedTaskView(state.views, query, name);
    return applyResult(result, result.ok ? result.views[result.views.length - 1]!.id : undefined);
  };

  const rename = (id: string, name: string) => applyResult(renameSavedTaskView(state.views, id, name));

  const remove = (id: string) => {
    const views = deleteSavedTaskView(state.views, id);
    if (id !== state.selectedId) {
      setState((current) => ({ ...current, views }));
      return;
    }
    const raw = views.find((view) => view.id === RAW_TASK_VIEW_ID)!;
    setState({ views, selectedId: raw.id });
    setQuery(raw.query);
  };

  return { query, setQuery, views: state.views, selected, edited, select, save, revert, create, rename, remove };
}
