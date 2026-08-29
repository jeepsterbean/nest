import type { PointerEvent as ReactPointerEvent } from "react";

const DRAG_START_DISTANCE = 6;

type PointerDragCallbacks = {
  startImmediately?: boolean;
  onStart: () => void;
  onMove: (event: PointerEvent) => void;
  onEnd: (event: PointerEvent, dragged: boolean) => void;
  onCancel: () => void;
};

/** Own one pointer's threshold, capture, and window-listener lifecycle. */
export function startPointerDrag(
  event: ReactPointerEvent<HTMLElement>,
  callbacks: PointerDragCallbacks,
): () => void {
  const { pointerId, clientX: startX, clientY: startY, currentTarget } = event;
  let dragged = false;
  let cleaned = false;

  const start = () => {
    dragged = true;
    currentTarget.setPointerCapture(pointerId);
    callbacks.onStart();
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerCancel);
    if (currentTarget.hasPointerCapture(pointerId)) {
      currentTarget.releasePointerCapture(pointerId);
    }
  };

  const onPointerMove = (move: PointerEvent) => {
    if (move.pointerId !== pointerId) return;
    if (
      !dragged &&
      Math.hypot(move.clientX - startX, move.clientY - startY) <
        DRAG_START_DISTANCE
    ) {
      return;
    }
    if (!dragged) start();
    move.preventDefault();
    callbacks.onMove(move);
  };

  const onPointerUp = (up: PointerEvent) => {
    if (up.pointerId !== pointerId) return;
    cleanup();
    callbacks.onEnd(up, dragged);
  };

  const onPointerCancel = (cancel: PointerEvent) => {
    if (cancel.pointerId !== pointerId) return;
    cleanup();
    callbacks.onCancel();
  };

  if (callbacks.startImmediately) start();
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerCancel);
  return cleanup;
}
