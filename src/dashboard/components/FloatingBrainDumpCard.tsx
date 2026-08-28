import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampFloatingPosition,
  floatingBrainDumpStackZIndex,
  type FloatingBrainDump,
} from "../../lib/floatingBrainDumps";
import type { Tag } from "../../lib/types";
import { BrainDumpSurface } from "./BrainDumpSurface";
import { promoteIcon, trashIcon } from "./icons";

export function FloatingBrainDumpCard({
  dump,
  tags,
  viewportWidth,
  viewportHeight,
  onTextChange,
  onTagsChange,
  onPositionChange,
  onPromote,
  onRemove,
  onSubmit,
  onFocus,
}: {
  dump: FloatingBrainDump;
  tags: Tag[];
  viewportWidth: number;
  viewportHeight: number;
  onTextChange: (text: string) => void;
  onTagsChange: (tagIds: number[]) => void;
  onPositionChange: (x: number, y: number) => void;
  onPromote: () => void;
  onRemove: () => void;
  onSubmit: () => void;
  onFocus: () => void;
}) {
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    header: HTMLElement;
  } | null>(null);

  const displayX = dragOffset?.x ?? dump.x;
  const displayY = dragOffset?.y ?? dump.y;

  const finishDrag = (clientX: number, clientY: number) => {
    const session = dragRef.current;
    if (!session) return;
    dragRef.current = null;
    setDragOffset(null);
    const nextX = session.originX + (clientX - session.startX);
    const nextY = session.originY + (clientY - session.startY);
    const width = viewportWidth || window.innerWidth;
    const height = viewportHeight || window.innerHeight;
    const clamped = clampFloatingPosition(nextX, nextY, width, height);
    onPositionChange(clamped.x, clamped.y);
  };

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    onFocus();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dump.x,
      originY: dump.y,
      header: event.currentTarget,
    };
    event.currentTarget.setPointerCapture(event.pointerId);

    const onMove = (moveEvent: PointerEvent) => {
      const session = dragRef.current;
      if (!session || moveEvent.pointerId !== session.pointerId) return;
      setDragOffset({
        x: session.originX + (moveEvent.clientX - session.startX),
        y: session.originY + (moveEvent.clientY - session.startY),
      });
    };

    const onUp = (upEvent: PointerEvent) => {
      const session = dragRef.current;
      if (!session || upEvent.pointerId !== session.pointerId) return;
      finishDrag(upEvent.clientX, upEvent.clientY);
      session.header.releasePointerCapture(upEvent.pointerId);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      className="floating-brain-dump"
      style={{
        left: displayX,
        top: displayY,
        zIndex: floatingBrainDumpStackZIndex(dump.zIndex),
      }}
    >
      <BrainDumpSurface
        className="brain-dump-surface--floating"
        text={dump.text}
        tagIds={dump.tagIds}
        tags={tags}
        textareaLabel="Floating brain dump"
        headerEnd={
          <>
            <button
              type="button"
              className="brain-dump-surface__action"
              aria-label="Move to main brain dump"
              title="Move to main brain dump"
              onClick={onPromote}
            >
              {promoteIcon}
            </button>
            <button
              type="button"
              className="brain-dump-surface__action brain-dump-surface__action--danger"
              aria-label="Remove floating brain dump"
              title="Remove"
              onClick={onRemove}
            >
              {trashIcon}
            </button>
          </>
        }
        onTextChange={onTextChange}
        onTagsChange={onTagsChange}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onHeaderPointerDown={onHeaderPointerDown}
      />
    </div>
  );
}
