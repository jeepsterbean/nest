import { useCallback, useEffect, useRef, useState } from "react";
import {
  createSavedTaskView,
  deleteSavedTaskView,
  RAW_TASK_VIEW_ID,
  overwriteSavedTaskView,
  renameSavedTaskView,
  sameTaskTableQuery,
  type SavedTaskView,
  type SavedTaskViewResult,
  type TaskTableQuery,
} from "../lib/taskTableViews";

import { useTaskSavedViews } from "../context/TaskSavedViewsContext";

export type TaskTableViews = ReturnType<typeof useTaskTableViews>;

/** The Tasks table query plus the saved views it can be loaded from or saved to.
 *  Unsaved edits live only in memory: a reload reopens the selected view as saved. */
export function useTaskTableViews(viewId: string, onSelectionChange: (id: string) => void, loadVersion: number) {
  const { state, setState } = useTaskSavedViews();
  const selected = state.views.find(view => view.id === viewId) ?? state.views[0]!;
  const [query, setQuery] = useState<TaskTableQuery>(() => selected.query);
  const queryRef = useRef(query);
  queryRef.current = query;
  const previous = useRef({ selected, viewId, loadVersion });
  // One effect decides every reset so a selection never resets the query twice.
  useEffect(() => {
    const last = previous.current;
    previous.current = { selected, viewId, loadVersion };
    const reselected = last.viewId !== viewId || last.loadVersion !== loadVersion;
    // Saved changes from another pane refresh clean queries; local drafts stay intact.
    if (reselected || last.selected.id !== selected.id || sameTaskTableQuery(queryRef.current, last.selected.query)) setQuery(selected.query);
  }, [selected, viewId, loadVersion]);
  const edited = !sameTaskTableQuery(selected.query, query);

  const applyResult = useCallback((result: SavedTaskViewResult, selectedId?: string) => {
    if (result.ok) {
      setState((current) => ({ views: result.views, selectedId: selectedId ?? current.selectedId }));
      if (selectedId) onSelectionChange(selectedId);
    }
    return result;
  }, [setState, onSelectionChange]);

  // Switching drops unsaved edits without asking: a few filter changes are quick to redo,
  // and a prompt on every switch would interrupt more than it protects.
  const select = useCallback((view: SavedTaskView) => {
    setState((current) => ({ ...current, selectedId: view.id }));
    onSelectionChange(view.id);
    setQuery(view.query);
  }, [setState, onSelectionChange]);

  const save = () => applyResult(overwriteSavedTaskView(state.views, selected.id, query));
  const revert = () => setQuery(selected.query);

  const create = (name: string) => {
    const result = createSavedTaskView(state.views, query, name);
    return applyResult(result, result.ok ? result.views[result.views.length - 1]!.id : undefined);
  };

  const rename = (id: string, name: string) => applyResult(renameSavedTaskView(state.views, id, name));

  const remove = (id: string) => {
    const views = deleteSavedTaskView(state.views, id);
    setState(current => ({ views, selectedId: current.selectedId === id ? RAW_TASK_VIEW_ID : current.selectedId }));
    if (id === selected.id) select(views.find(view => view.id === RAW_TASK_VIEW_ID)!);
  };

  return { query, setQuery, views: state.views, selected, edited, select, save, revert, create, rename, remove };
}
