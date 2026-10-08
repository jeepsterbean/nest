import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  fitTaskTableColumns,
  moveTaskTableColumn,
  readTaskTableLayout,
  setTaskTableColumnHidden,
  showAllTaskTableColumns,
  splitTaskTableColumn,
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
  const [availableWidth, setAvailableWidth] = useState(0);
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null);
  const [draggingId, setDraggingId] = useState<TaskTableColumnId | null>(null);
  const [overId, setOverId] = useState<TaskTableColumnId | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const availableWidthRef = useRef(availableWidth);
  availableWidthRef.current = availableWidth;
  const resizingRef = useRef(false);
  const sessionRef = useRef<Session | null>(null);

  const persist = (next: TaskTableColumn[]) => {
    setColumns(next);
    writeTaskTableLayout(next);
  };

  const displayColumns = useMemo(
    () => (availableWidth > 0 ? fitTaskTableColumns(columns, availableWidth) : columns),
    [availableWidth, columns],
  );

  const clear = useCallback(() => {
    const session = sessionRef.current;
    session?.removeListeners();
    document.documentElement.classList.remove(
      "task-table-move-in-progress",
      "task-table-resize-in-progress",
    );
    sessionRef.current = null;
    resizingRef.current = false;
    setDraggingId(null);
    setOverId(null);
  }, []);

  useEffect(() => () => clear(), [clear]);

  useEffect(() => {
    if (!wrap) return;
    const measure = () => {
      if (resizingRef.current) return;
      const width = wrap.clientWidth;
      availableWidthRef.current = width;
      setAvailableWidth((current) => (current === width ? current : width));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [wrap]);

  const columnAtPoint = (clientX: number, clientY: number) => {
    const header = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-task-col]");
    const id = header?.dataset.taskCol;
    return columnsRef.current.some((column) => column.id === id)
      ? (id as TaskTableColumnId)
      : null;
  };

  const fittedColumns = (source: TaskTableColumn[]) => {
    const width = availableWidthRef.current;
    return width > 0 ? fitTaskTableColumns(source, width) : source;
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
    const originDisplay = kind === "resize" ? fittedColumns(origin) : origin;
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
        if (kind === "resize") resizingRef.current = true;
        setDraggingId(id);
      },
      onMove: (move) => {
        if (kind === "resize") {
          setColumns(splitTaskTableColumn(originDisplay, id, move.clientX - startX));
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

  const visibleColumns = displayColumns.filter((column) => !column.hidden);
  return {
    columns,
    visibleColumns,
    hiddenColumns: columns.filter((column) => column.hidden),
    hideColumn: (id: TaskTableColumnId) =>
      persist(setTaskTableColumnHidden(columnsRef.current, id, true)),
    showColumn: (id: TaskTableColumnId) =>
      persist(setTaskTableColumnHidden(columnsRef.current, id, false)),
    showAllColumns: () => persist(showAllTaskTableColumns(columnsRef.current)),
    draggingId,
    overId,
    wrapRef: setWrap,
    onMovePointerDown: (event: PointerEvent<HTMLElement>, id: TaskTableColumnId) =>
      onPointerDown(event, id, "move"),
    onResizePointerDown: (event: PointerEvent<HTMLElement>, id: TaskTableColumnId) =>
      onPointerDown(event, id, "resize"),
  };
}
