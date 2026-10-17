import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampFloatingPosition,
  clampNoteBoardSize,
  FLOATING_NOTE_MINIMISED_HEIGHT,
  floatingNoteStackZIndex,
  pointInRect,
  useViewportSize,
  type FloatingNote,
  type FloatingNoteBoard,
  type FloatingStickyColor,
} from "../../lib/floatingNotes";
import { noteSummary } from "../../lib/noteRichText";
import type { Tag } from "../../lib/types";
import { startPointerDrag } from "../lib/pointerDrag";
import { FloatingNoteCard } from "./FloatingNoteCard";
import { floatingDraftIcon, maximizeIcon, minimizeIcon, xIcon } from "./icons";

const KEYBOARD_RESIZE_STEP = 16;

export function FloatingNoteBoard({
  notes,
  board,
  tags,
  hidden,
  onToggleHidden,
  onTextChange,
  onTagsChange,
  onColorChange,
  onMinimisedChange,
  onPositionChange,
  onSizeChange,
  onDock,
  onUndock,
  onBoardChange,
  onPromote,
  onRemove,
  onSubmit,
  onBringToFront,
  onBringBoardToFront,
  onViewportResize,
}: {
  notes: FloatingNote[];
  board: FloatingNoteBoard;
  tags: Tag[];
  hidden: boolean;
  onToggleHidden: () => void;
  onTextChange: (id: string, text: string) => void;
  onTagsChange: (id: string, tagIds: number[]) => void;
  onColorChange: (id: string, color: FloatingStickyColor) => void;
  onMinimisedChange: (id: string, minimised: boolean) => void;
  onPositionChange: (id: string, x: number, y: number) => void;
  onSizeChange: (id: string, width: number, height: number) => void;
  onDock: (id: string) => void;
  onUndock: (id: string, x: number, y: number) => void;
  onBoardChange: (patch: Partial<FloatingNoteBoard>) => void;
  onPromote: (note: FloatingNote) => void;
  onRemove: (id: string) => void;
  onSubmit: (note: FloatingNote) => void;
  onBringToFront: (id: string) => void;
  onBringBoardToFront: () => void;
  onViewportResize: (width: number, height: number) => void;
}) {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [boardDrag, setBoardDrag] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [boardResize, setBoardResize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [dropNote, setDropNote] = useState<FloatingNote | null>(null);
  const [lifting, setLifting] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback(
    (width: number, height: number) => {
      setViewportSize({ width, height });
      onViewportResize(width, height);
    },
    [onViewportResize],
  );

  useViewportSize(handleResize);

  const viewportWidth = viewportSize.width || window.innerWidth;
  const viewportHeight = viewportSize.height || window.innerHeight;
  const freeNotes = notes.filter((note) => !note.docked);
  const dockedNotes = notes.filter((note) => note.docked);
  const displayX = boardDrag?.x ?? board.x;
  const displayY = boardDrag?.y ?? board.y;
  const displayWidth = boardResize?.width ?? board.width;
  const displayHeight = board.minimised
    ? FLOATING_NOTE_MINIMISED_HEIGHT
    : (boardResize?.height ?? board.height);

  const hitsBoard = (clientX: number, clientY: number) => {
    if (board.minimised) return false;
    const rect = frameRef.current?.getBoundingClientRect();
    return rect ? pointInRect(clientX, clientY, rect) : false;
  };

  const armDrop = (note: FloatingNote, clientX: number, clientY: number) => {
    setDropNote(hitsBoard(clientX, clientY) ? note : null);
  };

  const clearDrop = () => setDropNote(null);

  const onFreeMoveEnd = (
    note: FloatingNote,
    x: number,
    y: number,
    clientX: number,
    clientY: number,
  ) => {
    clearDrop();
    if (hitsBoard(clientX, clientY)) {
      onDock(note.id);
      return;
    }
    onPositionChange(note.id, x, y);
  };

  const onDockedMoveEnd = (
    note: FloatingNote,
    x: number,
    y: number,
    clientX: number,
    clientY: number,
  ) => {
    setLifting(false);
    clearDrop();
    if (hitsBoard(clientX, clientY)) return;
    onUndock(note.id, x, y);
  };

  const clampBoardPosition = (x: number, y: number, width: number, height: number) =>
    clampFloatingPosition(x, y, viewportWidth, viewportHeight, width, height);

  const onBoardHeaderPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button")) return;
    event.preventDefault();
    onBringBoardToFront();

    const originX = board.x;
    const originY = board.y;
    const startX = event.clientX;
    const startY = event.clientY;
    let offset = { x: originX, y: originY };

    const commit = () => {
      setBoardDrag(null);
      onBoardChange(offset);
    };

    startPointerDrag(event, {
      startImmediately: true,
      onStart: () => undefined,
      onMove: (move) => {
        offset = clampBoardPosition(
          originX + (move.clientX - startX),
          originY + (move.clientY - startY),
          displayWidth,
          displayHeight,
        );
        setBoardDrag(offset);
      },
      onEnd: commit,
      onCancel: commit,
    });
  };

  const clampBoardSize = (width: number, height: number) =>
    clampNoteBoardSize(
      width,
      height,
      board.x,
      board.y,
      viewportWidth,
      viewportHeight,
      board.minimised,
    );

  const commitBoardSize = (width: number, height: number) => {
    const size = clampBoardSize(width, height);
    setBoardResize(null);
    onBoardChange(
      board.minimised
        ? { width: size.width }
        : { width: size.width, height: size.height },
    );
  };

  const onBoardResizePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    onBringBoardToFront();

    const width = displayWidth;
    const height = displayHeight;
    const startX = event.clientX;
    const startY = event.clientY;
    let size = { width, height };

    const commit = () => commitBoardSize(size.width, size.height);

    startPointerDrag(event, {
      startImmediately: true,
      onStart: () => undefined,
      onMove: (move) => {
        size = board.minimised
          ? clampBoardSize(width + move.clientX - startX, height)
          : clampBoardSize(
              width + move.clientX - startX,
              height + move.clientY - startY,
            );
        setBoardResize(size);
      },
      onEnd: commit,
      onCancel: commit,
    });
  };

  const onBoardResizeKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
  ) => {
    if (event.key === "ArrowLeft") {
      commitBoardSize(displayWidth - KEYBOARD_RESIZE_STEP, displayHeight);
    } else if (event.key === "ArrowRight") {
      commitBoardSize(displayWidth + KEYBOARD_RESIZE_STEP, displayHeight);
    } else if (!board.minimised && event.key === "ArrowUp") {
      commitBoardSize(displayWidth, displayHeight - KEYBOARD_RESIZE_STEP);
    } else if (!board.minimised && event.key === "ArrowDown") {
      commitBoardSize(displayWidth, displayHeight + KEYBOARD_RESIZE_STEP);
    } else {
      return;
    }
    event.preventDefault();
    onBringBoardToFront();
  };

  const cardProps = (note: FloatingNote) => ({
    note,
    tags,
    viewportWidth,
    viewportHeight,
    onTextChange: (text: string) => onTextChange(note.id, text),
    onTagsChange: (tagIds: number[]) => onTagsChange(note.id, tagIds),
    onColorChange: (color: FloatingStickyColor) =>
      onColorChange(note.id, color),
    onMinimisedChange: (minimised: boolean) =>
      onMinimisedChange(note.id, minimised),
    onSizeChange: (width: number, height: number) =>
      onSizeChange(note.id, width, height),
    onPromote: () => onPromote(note),
    onRemove: () => onRemove(note.id),
    onSubmit: () => onSubmit(note),
    onFocus: () => onBringToFront(note.id),
  });

  return (
    <>
      {freeNotes.length > 0 && (
        <button
          type="button"
          className="floating-notes-toggle"
          aria-pressed={!hidden}
          aria-label={hidden ? "Show sticky notes" : "Hide sticky notes"}
          title={hidden ? "Show sticky notes" : "Hide sticky notes"}
          onClick={onToggleHidden}
        >
          <span className="floating-notes-toggle__note" aria-hidden="true">
            {floatingDraftIcon}
          </span>
          {!hidden && (
            <span className="floating-notes-toggle__cross" aria-hidden="true">
              {xIcon}
            </span>
          )}
        </button>
      )}
      <div className="floating-notes-board">
        <div
          ref={frameRef}
          role="region"
          aria-label="Note Board"
          className={`floating-note-board${
            board.minimised ? " floating-note-board--minimised" : ""
          }${dropNote ? " is-drop-target" : ""}`}
          style={{
            left: displayX,
            top: displayY,
            width: displayWidth,
            height: displayHeight,
            zIndex: floatingNoteStackZIndex(board.zIndex),
          }}
        >
          <header
            className="note-surface__head note-surface__head--draggable"
            onPointerDown={onBoardHeaderPointerDown}
          >
            <div className="note-surface__head-start">
              <span className="floating-note__summary">
                {board.minimised && dockedNotes.length > 0
                  ? `Note Board · ${dockedNotes.length}`
                  : "Note Board"}
              </span>
            </div>
            <div className="note-surface__head-end">
              <button
                type="button"
                className="note-surface__action"
                aria-label={
                  board.minimised ? "Expand note board" : "Minimise note board"
                }
                title={board.minimised ? "Expand" : "Minimise"}
                onClick={() => {
                  onBringBoardToFront();
                  onBoardChange({ minimised: !board.minimised });
                }}
              >
                {board.minimised ? maximizeIcon : minimizeIcon}
              </button>
            </div>
          </header>
          {!board.minimised && (
            <div className="floating-note-board__rows">
              {dockedNotes.length === 0 && !dropNote && (
                <p className="floating-note-board__empty">
                  Drag a note here
                </p>
              )}
              {dockedNotes.map((note) => (
                <FloatingNoteCard
                  key={note.id}
                  {...cardProps(note)}
                  onMove={(clientX, clientY) => {
                    setLifting(true);
                    armDrop(note, clientX, clientY);
                  }}
                  onMoveEnd={(x, y, clientX, clientY) =>
                    onDockedMoveEnd(note, x, y, clientX, clientY)
                  }
                />
              ))}
              {dropNote && !lifting && (
                <div
                  className="floating-note floating-note--docked floating-note-board__preview"
                  data-color={dropNote.color}
                  aria-hidden="true"
                >
                  <div className="note-surface note-surface--floating note-surface--floating-minimised">
                    <header className="note-surface__head">
                      <div className="note-surface__head-start">
                        <span className="floating-note__summary">
                          {noteSummary(dropNote.text)}
                        </span>
                      </div>
                    </header>
                  </div>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className={`floating-note__resize${
              board.minimised ? " floating-note__resize--horizontal" : ""
            }`}
            aria-label={
              board.minimised ? "Resize note board width" : "Resize note board"
            }
            title={board.minimised ? "Resize width" : "Resize"}
            onPointerDown={onBoardResizePointerDown}
            onKeyDown={onBoardResizeKeyDown}
          />
        </div>
        {!hidden &&
          freeNotes.map((note) => (
            <FloatingNoteCard
              key={note.id}
              {...cardProps(note)}
              overBoard={dropNote?.id === note.id}
              onMove={(clientX, clientY) => armDrop(note, clientX, clientY)}
              onMoveEnd={(x, y, clientX, clientY) =>
                onFreeMoveEnd(note, x, y, clientX, clientY)
              }
            />
          ))}
      </div>
    </>
  );
}
