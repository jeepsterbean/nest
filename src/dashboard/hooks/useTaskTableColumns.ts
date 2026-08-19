import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  moveTaskTableColumn,
  readTaskTableLayout,
  resizeTaskTableColumn,
  writeTaskTableLayout,
  type TaskTableColumn,
  type TaskTableColumnId,
} from "../lib/taskTable";

const DRAG_START_DISTANCE = 6;

type Session = {
  pointerId: number;
  kind: "move" | "resize";
  id: TaskTableColumnId;
  startX: number;
  startY: number;
  origin: TaskTableColumn[];
  dragging: boolean;
  handle: HTMLElement;
  removeListeners: () => void;
};

/** Header drag reorders columns; the edge handle resizes. Clicks do neither. */
export function useTaskTableColumns() {
  const [columns, setColumns] = useState(readTaskTableLayout);
  const [draggingId, setDraggingId] = useState<TaskTableColumnId | null>(null);
  const [overId, setOverId] = useState<TaskTableColumnId | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const sessionRef = useRef<Session | null>(null);

  const persist = (next: TaskTableColumn[]) => {
    setColumns(next);
    writeTaskTableLayout(next);
  };

  const clear = useCallback(() => {
    const session = sessionRef.current;
    session?.removeListeners();
    if (session?.handle.hasPointerCapture(session.pointerId)) {
      session.handle.releasePointerCapture(session.pointerId);
    }
    document.documentElement.classList.remove(
      "task-table-move-in-progress",
      "task-table-resize-in-progress",
    );
    sessionRef.current = null;
    setDraggingId(null);
    setOverId(null);
  }, []);

  useEffect(() => () => clear(), [clear]);

  const columnAtPoint = (clientX: number, clientY: number) => {
    const header = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-task-col]");
    const id = header?.dataset.taskCol;
    return columnsRef.current.some((column) => column.id === id)
      ? (id as TaskTableColumnId)
      : null;
  };

  const onPointerDown = (
    event: PointerEvent<HTMLElement>,
    id: TaskTableColumnId,
    kind: "move" | "resize",
  ) => {
    if (event.button !== 0 || !event.isPrimary || sessionRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const onPointerMove = (move: globalThis.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== move.pointerId) return;
      if (!session.dragging) {
        if (
          session.kind === "move" &&
          Math.hypot(move.clientX - session.startX, move.clientY - session.startY) <
            DRAG_START_DISTANCE
        ) {
          return;
        }
        session.dragging = true;
        if (session.kind === "resize") {
          session.handle.setPointerCapture(session.pointerId);
        }
        document.documentElement.classList.add(
          session.kind === "move"
            ? "task-table-move-in-progress"
            : "task-table-resize-in-progress",
        );
        setDraggingId(session.id);
      }
      move.preventDefault();
      if (session.kind === "resize") {
        const origin = session.origin.find((column) => column.id === session.id);
        if (!origin) return;
        setColumns(
          resizeTaskTableColumn(
            session.origin,
            session.id,
            origin.width + (move.clientX - session.startX),
          ),
        );
        return;
      }
      const over = columnAtPoint(move.clientX, move.clientY);
      setOverId(over !== null && over !== session.id ? over : null);
    };

    const onPointerUp = (up: globalThis.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== up.pointerId) return;
      if (session.dragging) {
        if (session.kind === "resize") {
          writeTaskTableLayout(columnsRef.current);
        } else {
          const targetId = columnAtPoint(up.clientX, up.clientY);
          if (targetId !== null) {
            persist(moveTaskTableColumn(session.origin, session.id, targetId));
          }
        }
      }
      clear();
    };

    const onPointerCancel = () => {
      const session = sessionRef.current;
      if (session?.kind === "resize") setColumns(session.origin);
      clear();
    };

    const removeListeners = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };

    sessionRef.current = {
      pointerId: event.pointerId,
      kind,
      id,
      startX: event.clientX,
      startY: event.clientY,
      origin: columnsRef.current,
      dragging: kind === "resize",
      handle: event.currentTarget,
      removeListeners,
    };
    if (kind === "resize") {
      event.currentTarget.setPointerCapture(event.pointerId);
      document.documentElement.classList.add("task-table-resize-in-progress");
      setDraggingId(id);
    }
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  };

  return {
    columns,
    draggingId,
    overId,
    tableWidth: columns.reduce((sum, column) => sum + column.width, 0),
    onMovePointerDown: (event: PointerEvent<HTMLElement>, id: TaskTableColumnId) =>
      onPointerDown(event, id, "move"),
    onResizePointerDown: (event: PointerEvent<HTMLElement>, id: TaskTableColumnId) =>
      onPointerDown(event, id, "resize"),
  };
}
