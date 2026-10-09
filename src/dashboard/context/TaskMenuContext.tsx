import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Task } from "../../lib/types";
import { TASK_STATUSES } from "../lib/tasks";
import { useDashboardData } from "./DashboardDataContext";

type StatusMenuState = {
  taskId: number;
  left: number;
  top: number;
  up: boolean;
};

type ScopeMenuState = {
  taskId: number;
  left: number;
  top: number;
  maxHeight: number;
  adding: boolean;
  currentPath: string | null;
};

type TaskMenus = {
  statusMenu: StatusMenuState | null;
  scopeMenu: ScopeMenuState | null;
  newScopeName: string;
  setNewScopeName: (name: string) => void;
  openStatusMenu: (task: Task, anchor: HTMLElement) => void;
  openScopeMenu: (task: Task, anchor: HTMLElement) => void;
  closeStatusMenu: () => void;
  closeScopeMenu: () => void;
  setScopeMenuPath: (path: string | null) => void;
  beginAddingScope: () => void;
};

const TaskMenuContext = createContext<TaskMenus | null>(null);

export function TaskMenuProvider({ children }: { children: ReactNode }) {
  const { scopeTree } = useDashboardData();
  const [statusMenu, setStatusMenu] = useState<StatusMenuState | null>(null);
  const [scopeMenu, setScopeMenu] = useState<ScopeMenuState | null>(null);
  const [newScopeName, setNewScopeName] = useState("");
  const statusAnchorRef = useRef<HTMLElement | null>(null);
  const scopeAnchorRef = useRef<HTMLElement | null>(null);

  const closeStatusMenu = useCallback(() => {
    setStatusMenu(null);
    requestAnimationFrame(() => statusAnchorRef.current?.focus());
  }, []);
  const closeScopeMenu = useCallback(() => {
    setScopeMenu(null);
    requestAnimationFrame(() => scopeAnchorRef.current?.focus());
  }, []);

  const openStatusMenu = useCallback(
    (task: Task, anchor: HTMLElement) => {
      if (statusMenu?.taskId === task.id) {
        closeStatusMenu();
        return;
      }
      setScopeMenu(null);
      statusAnchorRef.current = anchor;
      const rect = anchor.getBoundingClientRect();
      // One option per status at 36px plus padding; flip up when there isn't
      // room below.
      const estHeight = TASK_STATUSES.length * 36 + 12;
      const menuWidth = 172;
      const up =
        window.innerHeight - rect.bottom < estHeight && rect.top > estHeight;
      setStatusMenu({
        taskId: task.id,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
        top: up ? rect.top - 6 : rect.bottom + 6,
        up,
      });
    },
    [closeStatusMenu, statusMenu],
  );

  const openScopeMenu = useCallback(
    (task: Task, anchor: HTMLElement) => {
      if (scopeMenu?.taskId === task.id) {
        closeScopeMenu();
        return;
      }
      setStatusMenu(null);
      scopeAnchorRef.current = anchor;
      const rect = anchor.getBoundingClientRect();
      const initialPath =
        task.scope && scopeTree.byPath.has(task.scope) ? task.scope : null;
      const initialNode = initialPath ? scopeTree.byPath.get(initialPath) : null;
      const initialOptions = initialNode ? initialNode.children : scopeTree.roots;
      const visibleOptions = Math.min(Math.max(initialOptions.length, 1), 6);
      const viewportPad = 8;
      const estHeight = visibleOptions * 36 + 132;
      const menuWidth = 280;
      const maxHeight = Math.max(180, window.innerHeight - viewportPad * 2);
      const boundedHeight = Math.min(estHeight, maxHeight);
      const preferredBelowTop = rect.bottom + 6;
      const preferredAboveTop = rect.top - boundedHeight - 6;
      const top =
        window.innerHeight - preferredBelowTop >= boundedHeight
          ? preferredBelowTop
          : rect.top >= boundedHeight
            ? preferredAboveTop
            : Math.max(
                viewportPad,
                Math.min(
                  preferredBelowTop,
                  window.innerHeight - boundedHeight - viewportPad,
                ),
              );
      setNewScopeName("");
      setScopeMenu({
        taskId: task.id,
        left: Math.max(
          viewportPad,
          Math.min(rect.left, window.innerWidth - menuWidth - viewportPad),
        ),
        top,
        maxHeight: boundedHeight,
        adding: false,
        currentPath: initialPath,
      });
    },
    [closeScopeMenu, scopeMenu, scopeTree],
  );

  const setScopeMenuPath = useCallback((currentPath: string | null) => {
    setNewScopeName("");
    setScopeMenu((prev) =>
      prev ? { ...prev, currentPath, adding: false } : prev,
    );
  }, []);

  const beginAddingScope = useCallback(() => {
    setScopeMenu((prev) => (prev ? { ...prev, adding: true } : prev));
  }, []);

  // The status menu is fixed-positioned against its trigger, so any scroll,
  // resize, or Escape detaches it — close rather than let it drift.
  useEffect(() => {
    if (!statusMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeStatusMenu();
    };
    window.addEventListener("scroll", closeStatusMenu, true);
    window.addEventListener("resize", closeStatusMenu);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", closeStatusMenu, true);
      window.removeEventListener("resize", closeStatusMenu);
      window.removeEventListener("keydown", onKey);
    };
  }, [closeStatusMenu, statusMenu]);

  // The scope menu has its own scrollable option list, so scrolling should not
  // dismiss it. Outside click, resize, and Escape still close it.
  useEffect(() => {
    if (!scopeMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeScopeMenu();
    };
    window.addEventListener("resize", closeScopeMenu);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", closeScopeMenu);
      window.removeEventListener("keydown", onKey);
    };
  }, [closeScopeMenu, scopeMenu]);

  const value = useMemo<TaskMenus>(
    () => ({
      statusMenu,
      scopeMenu,
      newScopeName,
      setNewScopeName,
      openStatusMenu,
      openScopeMenu,
      closeStatusMenu,
      closeScopeMenu,
      setScopeMenuPath,
      beginAddingScope,
    }),
    [
      statusMenu,
      scopeMenu,
      newScopeName,
      openStatusMenu,
      openScopeMenu,
      closeStatusMenu,
      closeScopeMenu,
      setScopeMenuPath,
      beginAddingScope,
    ],
  );

  return (
    <TaskMenuContext.Provider value={value}>
      {children}
    </TaskMenuContext.Provider>
  );
}

export function useTaskMenus() {
  const ctx = useContext(TaskMenuContext);
  if (!ctx) {
    throw new Error("useTaskMenus must be used within TaskMenuProvider");
  }
  return ctx;
}
