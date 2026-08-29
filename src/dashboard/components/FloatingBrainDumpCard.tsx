import {
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
import { startPointerDrag } from "../lib/pointerDrag";
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

  const displayX = dragOffset?.x ?? dump.x;
  const displayY = dragOffset?.y ?? dump.y;

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    onFocus();

    const originX = dump.x;
    const originY = dump.y;
    const startX = event.clientX;
    const startY = event.clientY;
    let offset = { x: originX, y: originY };

    const commit = () => {
      const width = viewportWidth || window.innerWidth;
      const height = viewportHeight || window.innerHeight;
      const clamped = clampFloatingPosition(offset.x, offset.y, width, height);
      setDragOffset(null);
      onPositionChange(clamped.x, clamped.y);
    };

    startPointerDrag(event, {
      startImmediately: true,
      onStart: () => undefined,
      onMove: (move) => {
        offset = {
          x: originX + (move.clientX - startX),
          y: originY + (move.clientY - startY),
        };
        setDragOffset(offset);
      },
      onEnd: commit,
      onCancel: commit,
    });
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
