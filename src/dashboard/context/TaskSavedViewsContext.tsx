import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { readSavedTaskViews, writeSavedTaskViews, type SavedTaskViewState } from "../lib/taskTableViews";

function useSavedViewsState() {
  const [state, setState] = useState<SavedTaskViewState>(readSavedTaskViews);
  useEffect(() => writeSavedTaskViews(state), [state]);
  return { state, setState };
}
const TaskSavedViewsContext = createContext<ReturnType<typeof useSavedViewsState> | null>(null);

export function TaskSavedViewsProvider({ children }: { children: ReactNode }) {
  const value = useSavedViewsState();
  return <TaskSavedViewsContext.Provider value={value}>{children}</TaskSavedViewsContext.Provider>;
}

export function useTaskSavedViews() {
  const context = useContext(TaskSavedViewsContext);
  if (!context) throw new Error("Task panes require TaskSavedViewsProvider");
  return context;
}
