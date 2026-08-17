import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { moveId } from "../../lib/reorder";

const DRAG_START_DISTANCE = 6;
/** Ignore selector for rows built from controls, e.g. task cards. */
export const CARD_CONTROLS =
  "button, a, input, textarea, select, [contenteditable='true']";
const IGNORE =
  "input, textarea, select, .pulse-visibility, .pulse-metric__remove, .menu-select, .icon-picker, .metric-icon-trigger";

type Session = {
  pointerId: number;
  id: number;
  startX: number;
  startY: number;
  dragging: boolean;
  row: HTMLElement;
  removeListeners: () => void;
};

export type SortRowProps = {
  "data-sort": string;
  "data-sort-id": string;
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onClickCapture: (event: {
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => void;
};

/** Pointer drag-to-reorder for a vertical list. Clicks still work if the pointer barely moves. */
export function useListSort(
  kind: string,
  ids: number[],
  // targetId is the row the drag landed on, so a list spanning several lanes
  // can tell which lane took the drop. Negative ids are lane placeholders.
  onReorder: (ids: number[], draggedId: number, targetId: number) => void,
  /** Rows whose controls must stay clickable pass their own selector. */
  ignore: string = IGNORE,
) {
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const idsRef = useRef(ids);
  const onReorderRef = useRef(onReorder);
  const suppressClickRef = useRef(false);
  idsRef.current = ids;
  onReorderRef.current = onReorder;

  const clear = useCallback(() => {
    const session = sessionRef.current;
    session?.removeListeners();
    if (session?.row.hasPointerCapture(session.pointerId)) {
      session.row.releasePointerCapture(session.pointerId);
    }
    document.documentElement.classList.remove("list-sort-in-progress");
    sessionRef.current = null;
    setDraggingId(null);
    setOverId(null);
  }, []);

  useEffect(() => () => clear(), [clear]);

  const rowAtPoint = (clientX: number, clientY: number) => {
    const row = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>(`[data-sort="${kind}"]`);
    const id = Number(row?.dataset.sortId);
    return Number.isSafeInteger(id) && id !== 0 ? id : null;
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>, id: number) => {
    if (event.button !== 0 || !event.isPrimary) return;
    if ((event.target as HTMLElement).closest(ignore)) return;

    const onPointerMove = (move: globalThis.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== move.pointerId) return;
      if (!session.dragging) {
        if (
          Math.hypot(move.clientX - session.startX, move.clientY - session.startY) <
          DRAG_START_DISTANCE
        ) {
          return;
        }
        session.dragging = true;
        session.row.setPointerCapture(move.pointerId);
        document.documentElement.classList.add("list-sort-in-progress");
        setDraggingId(session.id);
      }
      move.preventDefault();
      const over = rowAtPoint(move.clientX, move.clientY);
      setOverId(over !== null && over !== session.id ? over : null);
    };

    const onPointerUp = (up: globalThis.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== up.pointerId) return;
      const targetId = session.dragging ? rowAtPoint(up.clientX, up.clientY) : null;
      if (session.dragging) {
        suppressClickRef.current = true;
        if (targetId !== null) {
          const next = moveId(idsRef.current, session.id, targetId);
          if (next !== idsRef.current) {
            onReorderRef.current(next, session.id, targetId);
          }
        }
      }
      clear();
    };

    const removeListeners = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", clear);
    };

    sessionRef.current = {
      pointerId: event.pointerId,
      id,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      row: event.currentTarget,
      removeListeners,
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", clear);
  };

  const onClickCapture = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  };

  return {
    draggingId,
    overId,
    rowProps: (id: number): SortRowProps => ({
      "data-sort": kind,
      "data-sort-id": String(id),
      onPointerDown: (event: PointerEvent<HTMLElement>) => onPointerDown(event, id),
      onClickCapture,
    }),
  };
}
