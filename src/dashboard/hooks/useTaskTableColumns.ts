import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import {
  moveTaskTableColumn,
  readTaskTableLayout,
  resizeTaskTableColumn,
  writeTaskTableLayout,
  type TaskTableColumn,
  type TaskTableColumnId,
} from "../lib/taskTable";
import { startPointerDrag } from "../lib/pointerDrag";

type Session = {
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

    const origin = columnsRef.current;
    const startX = event.clientX;
    const session: Session = { removeListeners: () => undefined };
    sessionRef.current = session;
    session.removeListeners = startPointerDrag(event, {
      startImmediately: kind === "resize",
      onStart: () => {
        document.documentElement.classList.add(
          kind === "move"
            ? "task-table-move-in-progress"
            : "task-table-resize-in-progress",
        );
        setDraggingId(id);
      },
      onMove: (move) => {
        if (kind === "resize") {
          const column = origin.find((candidate) => candidate.id === id);
          if (!column) return;
          setColumns(
            resizeTaskTableColumn(
              origin,
              id,
              column.width + (move.clientX - startX),
            ),
          );
          return;
        }
        const over = columnAtPoint(move.clientX, move.clientY);
        setOverId(over !== null && over !== id ? over : null);
      },
      onEnd: (up, dragged) => {
        if (dragged) {
          if (kind === "resize") {
            writeTaskTableLayout(columnsRef.current);
          } else {
            const targetId = columnAtPoint(up.clientX, up.clientY);
            if (targetId !== null) {
              persist(moveTaskTableColumn(origin, id, targetId));
            }
          }
        }
        clear();
      },
      onCancel: () => {
        if (kind === "resize") setColumns(origin);
        clear();
      },
    });
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
