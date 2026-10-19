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

type StatusMenuState = {
  anchorId: string;
  taskId: number;
  left: number;
  top: number;
  up: boolean;
};

type TaskMenus = {
  statusMenu: StatusMenuState | null;
  openStatusMenu: (task: Task, anchor: HTMLElement, anchorId: string) => void;
  closeStatusMenu: () => void;
};

const TaskMenuContext = createContext<TaskMenus | null>(null);

export function TaskMenuProvider({ children }: { children: ReactNode }) {
  const [statusMenu, setStatusMenu] = useState<StatusMenuState | null>(null);
  const statusAnchorRef = useRef<HTMLElement | null>(null);

  const closeStatusMenu = useCallback(() => {
    setStatusMenu(null);
    requestAnimationFrame(() => statusAnchorRef.current?.focus());
  }, []);

  const openStatusMenu = useCallback(
    (task: Task, anchor: HTMLElement, anchorId: string) => {
      if (statusMenu?.anchorId === anchorId) {
        closeStatusMenu();
        return;
      }
      statusAnchorRef.current = anchor;
      const rect = anchor.getBoundingClientRect();
      // One option per status at 36px plus padding; flip up when there isn't
      // room below.
      const estHeight = TASK_STATUSES.length * 36 + 12;
      const menuWidth = 172;
      const up =
        window.innerHeight - rect.bottom < estHeight && rect.top > estHeight;
      setStatusMenu({
        anchorId,
        taskId: task.id,
        left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
        top: up ? rect.top - 6 : rect.bottom + 6,
        up,
      });
    },
    [closeStatusMenu, statusMenu],
  );

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

  const value = useMemo<TaskMenus>(
    () => ({
      statusMenu,
      openStatusMenu,
      closeStatusMenu,
    }),
    [
      statusMenu,
      openStatusMenu,
      closeStatusMenu,
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
