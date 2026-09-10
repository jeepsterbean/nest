import { useCallback, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  clampFloatingPosition,
  clampNoteBoardSize,
  FLOATING_BRAIN_DUMP_MINIMISED_HEIGHT,
  floatingBrainDumpStackZIndex,
  pointInRect,
  useViewportSize,
  type FloatingBrainDump,
  type FloatingNoteBoard,
  type FloatingStickyColor,
} from "../../lib/floatingBrainDumps";
import { brainDumpSummary } from "../../lib/brainDumpRichText";
import type { Tag } from "../../lib/types";
import { startPointerDrag } from "../lib/pointerDrag";
import { FloatingBrainDumpCard } from "./FloatingBrainDumpCard";
import { floatingDraftIcon, maximizeIcon, minimizeIcon, xIcon } from "./icons";

const KEYBOARD_RESIZE_STEP = 16;

export function FloatingBrainDumpsBoard({
  dumps,
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
  dumps: FloatingBrainDump[];
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
  onPromote: (dump: FloatingBrainDump) => void;
  onRemove: (id: string) => void;
  onSubmit: (dump: FloatingBrainDump) => void;
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
  const [dropDump, setDropDump] = useState<FloatingBrainDump | null>(null);
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
  const freeDumps = dumps.filter((dump) => !dump.docked);
  const dockedDumps = dumps.filter((dump) => dump.docked);
  const displayX = boardDrag?.x ?? board.x;
  const displayY = boardDrag?.y ?? board.y;
  const displayWidth = boardResize?.width ?? board.width;
  const displayHeight = board.minimised
    ? FLOATING_BRAIN_DUMP_MINIMISED_HEIGHT
    : (boardResize?.height ?? board.height);

  const hitsBoard = (clientX: number, clientY: number) => {
    if (board.minimised) return false;
    const rect = frameRef.current?.getBoundingClientRect();
    return rect ? pointInRect(clientX, clientY, rect) : false;
  };

  const armDrop = (dump: FloatingBrainDump, clientX: number, clientY: number) => {
    setDropDump(hitsBoard(clientX, clientY) ? dump : null);
  };

  const clearDrop = () => setDropDump(null);

  const onFreeMoveEnd = (
    dump: FloatingBrainDump,
    x: number,
    y: number,
    clientX: number,
    clientY: number,
  ) => {
    clearDrop();
    if (hitsBoard(clientX, clientY)) {
      onDock(dump.id);
      return;
    }
    onPositionChange(dump.id, x, y);
  };

  const onDockedMoveEnd = (
    dump: FloatingBrainDump,
    x: number,
    y: number,
    clientX: number,
    clientY: number,
  ) => {
    setLifting(false);
    clearDrop();
    if (hitsBoard(clientX, clientY)) return;
    onUndock(dump.id, x, y);
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

  const cardProps = (dump: FloatingBrainDump) => ({
    dump,
    tags,
    viewportWidth,
    viewportHeight,
    onTextChange: (text: string) => onTextChange(dump.id, text),
    onTagsChange: (tagIds: number[]) => onTagsChange(dump.id, tagIds),
    onColorChange: (color: FloatingStickyColor) =>
      onColorChange(dump.id, color),
    onMinimisedChange: (minimised: boolean) =>
      onMinimisedChange(dump.id, minimised),
    onSizeChange: (width: number, height: number) =>
      onSizeChange(dump.id, width, height),
    onPromote: () => onPromote(dump),
    onRemove: () => onRemove(dump.id),
    onSubmit: () => onSubmit(dump),
    onFocus: () => onBringToFront(dump.id),
  });

  return (
    <>
      {freeDumps.length > 0 && (
        <button
          type="button"
          className="floating-brain-dumps-toggle"
          aria-pressed={!hidden}
          aria-label={hidden ? "Show sticky notes" : "Hide sticky notes"}
          title={hidden ? "Show sticky notes" : "Hide sticky notes"}
          onClick={onToggleHidden}
        >
          <span className="floating-brain-dumps-toggle__note" aria-hidden="true">
            {floatingDraftIcon}
          </span>
          {!hidden && (
            <span className="floating-brain-dumps-toggle__cross" aria-hidden="true">
              {xIcon}
            </span>
          )}
        </button>
      )}
      <div className="floating-brain-dumps-board">
        <div
          ref={frameRef}
          role="region"
          aria-label="Note Board"
          className={`floating-note-board${
            board.minimised ? " floating-note-board--minimised" : ""
          }${dropDump ? " is-drop-target" : ""}`}
          style={{
            left: displayX,
            top: displayY,
            width: displayWidth,
            height: displayHeight,
            zIndex: floatingBrainDumpStackZIndex(board.zIndex),
          }}
        >
          <header
            className="brain-dump-surface__head brain-dump-surface__head--draggable"
            onPointerDown={onBoardHeaderPointerDown}
          >
            <div className="brain-dump-surface__head-start">
              <span className="floating-brain-dump__summary">
                {board.minimised && dockedDumps.length > 0
                  ? `Note Board · ${dockedDumps.length}`
                  : "Note Board"}
              </span>
            </div>
            <div className="brain-dump-surface__head-end">
              <button
                type="button"
                className="brain-dump-surface__action"
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
              {dockedDumps.length === 0 && !dropDump && (
                <p className="floating-note-board__empty">
                  Drag a brain dump here
                </p>
              )}
              {dockedDumps.map((dump) => (
                <FloatingBrainDumpCard
                  key={dump.id}
                  {...cardProps(dump)}
                  onMove={(clientX, clientY) => {
                    setLifting(true);
                    armDrop(dump, clientX, clientY);
                  }}
                  onMoveEnd={(x, y, clientX, clientY) =>
                    onDockedMoveEnd(dump, x, y, clientX, clientY)
                  }
                />
              ))}
              {dropDump && !lifting && (
                <div
                  className="floating-brain-dump floating-brain-dump--docked floating-note-board__preview"
                  data-color={dropDump.color}
                  aria-hidden="true"
                >
                  <div className="brain-dump-surface brain-dump-surface--floating brain-dump-surface--floating-minimised">
                    <header className="brain-dump-surface__head">
                      <div className="brain-dump-surface__head-start">
                        <span className="floating-brain-dump__summary">
                          {brainDumpSummary(dropDump.text)}
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
            className={`floating-brain-dump__resize${
              board.minimised ? " floating-brain-dump__resize--horizontal" : ""
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
          freeDumps.map((dump) => (
            <FloatingBrainDumpCard
              key={dump.id}
              {...cardProps(dump)}
              overBoard={dropDump?.id === dump.id}
              onMove={(clientX, clientY) => armDrop(dump, clientX, clientY)}
              onMoveEnd={(x, y, clientX, clientY) =>
                onFreeMoveEnd(dump, x, y, clientX, clientY)
              }
            />
          ))}
      </div>
    </>
  );
}
