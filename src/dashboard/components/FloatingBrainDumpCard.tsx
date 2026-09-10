import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampFloatingPosition,
  FLOATING_BRAIN_DUMP_HEIGHT,
  FLOATING_BRAIN_DUMP_MINIMISED_HEIGHT,
  FLOATING_BRAIN_DUMP_MIN_HEIGHT,
  FLOATING_BRAIN_DUMP_MIN_WIDTH,
  FLOATING_BRAIN_DUMP_PADDING,
  FLOATING_BRAIN_DUMP_WIDTH,
  FLOATING_STICKY_COLORS,
  floatingBrainDumpStackZIndex,
  type FloatingBrainDump,
  type FloatingStickyColor,
} from "../../lib/floatingBrainDumps";
import { brainDumpSummary } from "../../lib/brainDumpRichText";
import type { Tag } from "../../lib/types";
import { startPointerDrag } from "../lib/pointerDrag";
import { BrainDumpSurface } from "./BrainDumpSurface";
import { maximizeIcon, minimizeIcon, promoteIcon, trashIcon } from "./icons";

const KEYBOARD_RESIZE_STEP = 16;

export function FloatingBrainDumpCard({
  dump,
  tags,
  viewportWidth,
  viewportHeight,
  onTextChange,
  onTagsChange,
  onColorChange,
  onMinimisedChange,
  onPositionChange,
  onSizeChange,
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
  onColorChange: (color: FloatingStickyColor) => void;
  onMinimisedChange: (minimised: boolean) => void;
  onPositionChange: (x: number, y: number) => void;
  onSizeChange: (width: number, height: number) => void;
  onPromote: () => void;
  onRemove: () => void;
  onSubmit: () => void;
  onFocus: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [resizePreview, setResizePreview] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const displayX = dragOffset?.x ?? dump.x;
  const displayY = dragOffset?.y ?? dump.y;
  const displayWidth = Math.max(
    resizePreview?.width ?? dump.width ?? FLOATING_BRAIN_DUMP_WIDTH,
    FLOATING_BRAIN_DUMP_MIN_WIDTH,
  );
  const displayHeight = dump.minimised
    ? FLOATING_BRAIN_DUMP_MINIMISED_HEIGHT
    : (resizePreview?.height ?? dump.height ?? FLOATING_BRAIN_DUMP_HEIGHT);
  const expandedHeight = dump.height ?? FLOATING_BRAIN_DUMP_HEIGHT;
  const summary = brainDumpSummary(dump.text);

  const clampToBoard = (
    x: number,
    y: number,
    noteWidth: number,
    noteHeight: number,
  ) =>
    clampFloatingPosition(
      x,
      y,
      viewportWidth || window.innerWidth,
      viewportHeight || window.innerHeight,
      noteWidth,
      noteHeight,
    );

  const onHeaderPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    onFocus();

    const originX = dump.x;
    const originY = dump.y;
    const startX = event.clientX;
    const startY = event.clientY;
    const rect = cardRef.current?.getBoundingClientRect();
    const noteWidth = rect?.width ?? FLOATING_BRAIN_DUMP_WIDTH;
    const noteHeight = rect?.height ?? FLOATING_BRAIN_DUMP_HEIGHT;
    let offset = { x: originX, y: originY };

    const commit = () => {
      setDragOffset(null);
      onPositionChange(offset.x, offset.y);
    };

    startPointerDrag(event, {
      startImmediately: true,
      onStart: () => undefined,
      onMove: (move) => {
        offset = clampToBoard(
          originX + (move.clientX - startX),
          originY + (move.clientY - startY),
          noteWidth,
          noteHeight,
        );
        setDragOffset(offset);
      },
      onEnd: commit,
      onCancel: commit,
    });
  };

  // Growth is bounded by the space left between the note and the board edge,
  // so resizing can never push part of a note out of view.
  const clampSize = (width: number, height: number) => {
    const maxWidth = Math.max(
      FLOATING_BRAIN_DUMP_MIN_WIDTH,
      (viewportWidth || window.innerWidth) - dump.x - FLOATING_BRAIN_DUMP_PADDING,
    );
    const maxHeight = Math.max(
      FLOATING_BRAIN_DUMP_MIN_HEIGHT,
      (viewportHeight || window.innerHeight) - dump.y - FLOATING_BRAIN_DUMP_PADDING,
    );
    return {
      width: Math.min(Math.max(width, FLOATING_BRAIN_DUMP_MIN_WIDTH), maxWidth),
      height: Math.min(Math.max(height, FLOATING_BRAIN_DUMP_MIN_HEIGHT), maxHeight),
    };
  };

  const commitSize = (width: number, height: number) => {
    const size = clampSize(width, height);
    setResizePreview(null);
    onSizeChange(size.width, size.height);
  };

  const commitWidth = (width: number) => {
    const size = clampSize(width, expandedHeight);
    setResizePreview(null);
    onSizeChange(size.width, expandedHeight);
  };

  const onResizePointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !cardRef.current) return;
    event.preventDefault();
    onFocus();

    const { width, height } = cardRef.current.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    let size = { width, height };

    const commit = () =>
      dump.minimised ? commitWidth(size.width) : commitSize(size.width, size.height);

    startPointerDrag(event, {
      startImmediately: true,
      onStart: () => undefined,
      onMove: (move) => {
        size = dump.minimised
          ? clampSize(width + move.clientX - startX, expandedHeight)
          : clampSize(
              width + move.clientX - startX,
              height + move.clientY - startY,
            );
        setResizePreview(size);
      },
      onEnd: commit,
      onCancel: commit,
    });
  };

  const onResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft") {
      dump.minimised
        ? commitWidth(displayWidth - KEYBOARD_RESIZE_STEP)
        : commitSize(displayWidth - KEYBOARD_RESIZE_STEP, displayHeight);
    } else if (event.key === "ArrowRight") {
      dump.minimised
        ? commitWidth(displayWidth + KEYBOARD_RESIZE_STEP)
        : commitSize(displayWidth + KEYBOARD_RESIZE_STEP, displayHeight);
    } else if (!dump.minimised && event.key === "ArrowUp") {
      commitSize(displayWidth, displayHeight - KEYBOARD_RESIZE_STEP);
    } else if (!dump.minimised && event.key === "ArrowDown") {
      commitSize(displayWidth, displayHeight + KEYBOARD_RESIZE_STEP);
    } else {
      return;
    }
    event.preventDefault();
    onFocus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
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
      ref={cardRef}
      className={`floating-brain-dump${
        dump.minimised ? " floating-brain-dump--minimised" : ""
      }`}
      data-color={dump.color}
      style={{
        left: displayX,
        top: displayY,
        width: displayWidth,
        height: displayHeight,
        zIndex: floatingBrainDumpStackZIndex(dump.zIndex),
      }}
    >
      {dump.minimised ? (
        <div className="brain-dump-surface brain-dump-surface--floating brain-dump-surface--floating-minimised">
          <header
            className="brain-dump-surface__head brain-dump-surface__head--draggable"
            onPointerDown={onHeaderPointerDown}
          >
            <div className="brain-dump-surface__head-start">
              <span className="floating-brain-dump__summary" title={summary}>
                {summary}
              </span>
            </div>
            <div className="brain-dump-surface__head-end">
              <button
                type="button"
                className="brain-dump-surface__action"
                aria-label="Expand floating brain dump"
                title="Expand"
                onClick={() => onMinimisedChange(false)}
              >
                {maximizeIcon}
              </button>
            </div>
          </header>
        </div>
      ) : (
        <>
          <BrainDumpSurface
            className="brain-dump-surface--floating"
            text={dump.text}
            tagIds={dump.tagIds}
            tags={tags}
            textareaLabel="Floating brain dump"
            headerStart={
              <div
                className="floating-sticky-colors"
                role="group"
                aria-label="Sticky color"
              >
                {FLOATING_STICKY_COLORS.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className={`floating-sticky-colors__swatch floating-sticky-colors__swatch--${option.id}${
                      dump.color === option.id ? " is-selected" : ""
                    }`}
                    aria-label={option.label}
                    aria-pressed={dump.color === option.id}
                    title={option.label}
                    onClick={() => {
                      onFocus();
                      onColorChange(option.id);
                    }}
                  />
                ))}
              </div>
            }
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
                  className="brain-dump-surface__action"
                  aria-label="Minimise floating brain dump"
                  title="Minimise"
                  onClick={() => onMinimisedChange(true)}
                >
                  {minimizeIcon}
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
            dismissPopupsOnOutsideInteraction
          />
        </>
      )}
      <button
        type="button"
        className={`floating-brain-dump__resize${
          dump.minimised ? " floating-brain-dump__resize--horizontal" : ""
        }`}
        aria-label={
          dump.minimised
            ? "Resize floating brain dump width"
            : "Resize floating brain dump"
        }
        title={dump.minimised ? "Resize width" : "Resize"}
        onPointerDown={onResizePointerDown}
        onKeyDown={onResizeKeyDown}
      />
    </div>
  );
}
