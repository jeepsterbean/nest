import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampFloatingPosition,
  FLOATING_NOTE_HEIGHT,
  FLOATING_NOTE_MINIMISED_HEIGHT,
  FLOATING_NOTE_MIN_HEIGHT,
  FLOATING_NOTE_MIN_WIDTH,
  FLOATING_NOTE_PADDING,
  FLOATING_NOTE_WIDTH,
  FLOATING_STICKY_COLORS,
  floatingNoteStackZIndex,
  type FloatingNote,
  type FloatingStickyColor,
} from "../../lib/floatingNotes";
import { noteSummary } from "../../lib/noteRichText";
import type { Tag } from "../../lib/types";
import { startPointerDrag } from "../lib/pointerDrag";
import { NoteSurface } from "./NoteSurface";
import { maximizeIcon, minimizeIcon, promoteIcon, trashIcon } from "./icons";

const KEYBOARD_RESIZE_STEP = 16;
// ponytail: 1000 is ~800 bring-to-fronts above FLOATING_NOTE_LAYER_BASE
// (200). Past that a focused note can cover a lift; switch to nextZIndex if it shows up.
const LIFTING_Z_INDEX = 1000;

export function FloatingNoteCard({
  note,
  tags,
  viewportWidth,
  viewportHeight,
  onTextChange,
  onTagsChange,
  onColorChange,
  onMinimisedChange,
  onSizeChange,
  onMove,
  onMoveEnd,
  onPromote,
  onRemove,
  onSubmit,
  onFocus,
  overBoard = false,
}: {
  note: FloatingNote;
  tags: Tag[];
  viewportWidth: number;
  viewportHeight: number;
  onTextChange: (text: string) => void;
  onTagsChange: (tagIds: number[]) => void;
  onColorChange: (color: FloatingStickyColor) => void;
  onMinimisedChange: (minimised: boolean) => void;
  onSizeChange: (width: number, height: number) => void;
  onMove?: (clientX: number, clientY: number) => void;
  onMoveEnd: (x: number, y: number, clientX: number, clientY: number) => void;
  onPromote: () => void;
  onRemove: () => void;
  onSubmit: () => void;
  onFocus: () => void;
  overBoard?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [resizePreview, setResizePreview] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const docked = note.docked;
  const lifting = docked && dragOffset !== null;
  const displayX = dragOffset?.x ?? note.x;
  const displayY = dragOffset?.y ?? note.y;
  const displayWidth = Math.max(
    resizePreview?.width ?? note.width ?? FLOATING_NOTE_WIDTH,
    FLOATING_NOTE_MIN_WIDTH,
  );
  const rowLike = note.minimised || docked;
  const displayHeight = rowLike
    ? FLOATING_NOTE_MINIMISED_HEIGHT
    : (resizePreview?.height ?? note.height ?? FLOATING_NOTE_HEIGHT);
  const expandedHeight = note.height ?? FLOATING_NOTE_HEIGHT;
  const summary = noteSummary(note.text);

  const clampToViewport = (
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

    const rect = cardRef.current?.getBoundingClientRect();
    const originX = docked ? (rect?.left ?? note.x) : note.x;
    const originY = docked ? (rect?.top ?? note.y) : note.y;
    const startX = event.clientX;
    const startY = event.clientY;
    const noteWidth = docked
      ? (note.width ?? FLOATING_NOTE_WIDTH)
      : (rect?.width ?? FLOATING_NOTE_WIDTH);
    const noteHeight = docked
      ? FLOATING_NOTE_MINIMISED_HEIGHT
      : (rect?.height ?? FLOATING_NOTE_HEIGHT);
    let offset = { x: originX, y: originY };
    let pointer = { x: startX, y: startY };
    let moved = false;

    const commit = () => {
      setDragOffset(null);
      if (!moved) return;
      onMoveEnd(offset.x, offset.y, pointer.x, pointer.y);
    };

    startPointerDrag(event, {
      startImmediately: !docked,
      onStart: () => undefined,
      onMove: (move) => {
        moved = true;
        pointer = { x: move.clientX, y: move.clientY };
        offset = clampToViewport(
          originX + (move.clientX - startX),
          originY + (move.clientY - startY),
          noteWidth,
          noteHeight,
        );
        setDragOffset(offset);
        onMove?.(move.clientX, move.clientY);
      },
      onEnd: commit,
      onCancel: commit,
    });
  };

  // Growth is bounded by the space left between the note and the board edge,
  // so resizing can never push part of a note out of view.
  const clampSize = (width: number, height: number) => {
    const maxWidth = Math.max(
      FLOATING_NOTE_MIN_WIDTH,
      (viewportWidth || window.innerWidth) - note.x - FLOATING_NOTE_PADDING,
    );
    const maxHeight = Math.max(
      FLOATING_NOTE_MIN_HEIGHT,
      (viewportHeight || window.innerHeight) - note.y - FLOATING_NOTE_PADDING,
    );
    return {
      width: Math.min(Math.max(width, FLOATING_NOTE_MIN_WIDTH), maxWidth),
      height: Math.min(Math.max(height, FLOATING_NOTE_MIN_HEIGHT), maxHeight),
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
      note.minimised ? commitWidth(size.width) : commitSize(size.width, size.height);

    startPointerDrag(event, {
      startImmediately: true,
      onStart: () => undefined,
      onMove: (move) => {
        size = note.minimised
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
      note.minimised
        ? commitWidth(displayWidth - KEYBOARD_RESIZE_STEP)
        : commitSize(displayWidth - KEYBOARD_RESIZE_STEP, displayHeight);
    } else if (event.key === "ArrowRight") {
      note.minimised
        ? commitWidth(displayWidth + KEYBOARD_RESIZE_STEP)
        : commitSize(displayWidth + KEYBOARD_RESIZE_STEP, displayHeight);
    } else if (!note.minimised && event.key === "ArrowUp") {
      commitSize(displayWidth, displayHeight - KEYBOARD_RESIZE_STEP);
    } else if (!note.minimised && event.key === "ArrowDown") {
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

  const inFlow = docked && !lifting;
  const showMinimisedChrome = docked || note.minimised;

  return (
    <div
      ref={cardRef}
      className={`floating-note${
        note.minimised ? " floating-note--minimised" : ""
      }${docked ? " floating-note--docked" : ""}${
        lifting ? " floating-note--lifting" : ""
      }${overBoard ? " floating-note--over-board" : ""}`}
      data-color={note.color}
      style={
        inFlow
          ? undefined
          : {
              left: displayX,
              top: displayY,
              width: displayWidth,
              height: displayHeight,
              zIndex: lifting
                ? LIFTING_Z_INDEX
                : floatingNoteStackZIndex(note.zIndex),
            }
      }
    >
      {showMinimisedChrome ? (
        <div className="note-surface note-surface--floating note-surface--floating-minimised">
          <header
            className="note-surface__head note-surface__head--draggable"
            onPointerDown={onHeaderPointerDown}
          >
            <div className="note-surface__head-start">
              <span className="floating-note__summary" title={summary}>
                {summary}
              </span>
            </div>
            <div className="note-surface__head-end">
              {docked ? (
                <button
                  type="button"
                  className="note-surface__action note-surface__action--danger"
                  aria-label="Remove floating note"
                  title="Remove"
                  onClick={onRemove}
                >
                  {trashIcon}
                </button>
              ) : (
                <button
                  type="button"
                  className="note-surface__action"
                  aria-label="Expand floating note"
                  title="Expand"
                  onClick={() => onMinimisedChange(false)}
                >
                  {maximizeIcon}
                </button>
              )}
            </div>
          </header>
        </div>
      ) : (
        <>
          <NoteSurface
            className="note-surface--floating"
            text={note.text}
            tagIds={note.tagIds}
            tags={tags}
            textareaLabel="Floating note"
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
                      note.color === option.id ? " is-selected" : ""
                    }`}
                    aria-label={option.label}
                    aria-pressed={note.color === option.id}
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
                  className="note-surface__action"
                  aria-label="Move to main note"
                  title="Move to main note"
                  onClick={onPromote}
                >
                  {promoteIcon}
                </button>
                <button
                  type="button"
                  className="note-surface__action"
                  aria-label="Minimise floating note"
                  title="Minimise"
                  onClick={() => onMinimisedChange(true)}
                >
                  {minimizeIcon}
                </button>
                <button
                  type="button"
                  className="note-surface__action note-surface__action--danger"
                  aria-label="Remove floating note"
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
      {!docked && (
        <button
          type="button"
          className={`floating-note__resize${
            note.minimised ? " floating-note__resize--horizontal" : ""
          }`}
          aria-label={
            note.minimised
              ? "Resize floating note width"
              : "Resize floating note"
          }
          title={note.minimised ? "Resize width" : "Resize"}
          onPointerDown={onResizePointerDown}
          onKeyDown={onResizeKeyDown}
        />
      )}
    </div>
  );
}
