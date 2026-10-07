import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { moveId } from "../../lib/reorder";
import { startPointerDrag } from "../lib/pointerDrag";

/** Ignore selector for rows built from controls, e.g. task cards. */
export const CARD_CONTROLS =
  "button, a, input, textarea, select, [contenteditable='true']";
/** Controls inside sortable rows that must keep their own pointer behavior. */
export const LIST_SORT_IGNORE =
  "input, textarea, select, .pulse-visibility, .metric-row__remove, .metric-group__delete, .menu-select, .icon-picker, .metric-icon-trigger";

type Session = {
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
  ignore: string = LIST_SORT_IGNORE,
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

    const session: Session = { removeListeners: () => undefined };
    sessionRef.current = session;
    session.removeListeners = startPointerDrag(event, {
      onStart: () => {
        document.documentElement.classList.add("list-sort-in-progress");
        setDraggingId(id);
      },
      onMove: (move) => {
        const over = rowAtPoint(move.clientX, move.clientY);
        setOverId(over !== null && over !== id ? over : null);
      },
      onEnd: (up, dragged) => {
        const targetId = dragged ? rowAtPoint(up.clientX, up.clientY) : null;
        if (dragged) {
          suppressClickRef.current = true;
          if (targetId !== null) {
            const next = moveId(idsRef.current, id, targetId);
            if (next !== idsRef.current) {
              onReorderRef.current(next, id, targetId);
            }
          }
        }
        clear();
      },
      onCancel: clear,
    });
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
