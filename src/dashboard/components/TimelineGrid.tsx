// Behavior and invariants: docs/interface/calendar.md#calendar
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import type { Phase } from "../../lib/types";
import { taskHue } from "../lib/period";
import { formatTime, fromDateAndTime, toDateInput, toTimeInput } from "../lib/time";
import {
  applyStretchDrag,
  placeOnWindow,
  placeStretchEditor,
  stretchEditorSide,
  timeOnColumn,
  type StretchDragKind,
  type StretchEditorBox,
  type StretchTimes,
  type WorkBlock,
} from "../lib/workTimeline";
import {
  pxOf,
  TimelineFrame,
  type FrameColumn,
  type TimeSpan,
} from "./TimelineFrame";

/** A block this tall fits its title; twice that also fits its start–end line. */
const TITLE_PX = 18;
const TIMES_PX = 34;

/** Pointer must move this far before a press becomes a drag, so clicks still select. */
const DRAG_START_DISTANCE = 6;

export type GridColumn = FrameColumn & {
  blocks: WorkBlock[];
};

export type StretchEdit = {
  id: number;
  startedAt: number;
  endedAt: number;
  /** The day column that was clicked, so the editor sits beside that lane. */
  columnFrom: number;
  /** Still Working now: the editor opens, but start and end stay locked. */
  open: boolean;
};

type StretchPreview = StretchTimes & { id: number; source: WorkBlock };

const locateTime = (
  colsEl: HTMLElement | null,
  columns: GridColumn[],
  clientX: number,
  clientY: number,
) => {
  const lanes = colsEl?.querySelectorAll<HTMLElement>(".tl__lane");
  if (!lanes?.length) return null;
  let index = 0;
  let best = Infinity;
  lanes.forEach((lane, i) => {
    const rect = lane.getBoundingClientRect();
    const dist =
      clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
    if (dist < best) {
      best = dist;
      index = i;
    }
  });
  const column = columns[index];
  if (!column) return null;
  const rect = lanes[index].getBoundingClientRect();
  const yPct = rect.height <= 0 ? 0 : (clientY - rect.top) / rect.height;
  return timeOnColumn(column.from, column.to, yPct);
};

const blocksWithPreview = (
  column: GridColumn,
  preview: StretchPreview | null,
  nowSec: number,
): WorkBlock[] => {
  if (!preview) return column.blocks;
  const rest = column.blocks.filter((block) => block.id !== preview.id);
  const spanTo = preview.endedAt ?? nowSec;
  // Test the span, not its height: a stretch dragged down to nothing still
  // belongs to this day and keeps the 3px floor the drawn block already has.
  if (spanTo <= column.from || preview.startedAt >= column.to) return rest;
  return [
    ...rest,
    {
      // Overlap slots are not recomputed mid-drag, so a preview dropped onto a
      // concurrent stretch keeps its old side-by-side slot until the save
      // reloads. Cheaper than re-laying out the column on every pointermove.
      ...preview.source,
      startedAt: preview.startedAt,
      endedAt: preview.endedAt,
      from: Math.max(preview.startedAt, column.from),
      to: Math.min(spanTo, column.to),
      ...placeOnWindow(preview.startedAt, spanTo, column.from, column.to),
    },
  ];
};

const dragKindAt = (
  event: ReactPointerEvent<HTMLElement>,
  block: WorkBlock,
  column: GridColumn,
): StretchDragKind => {
  const edge = (event.target as HTMLElement).closest<HTMLElement>("[data-tl-edge]")
    ?.dataset.tlEdge;
  if (edge === "start" || edge === "end") return edge;
  const rect = event.currentTarget.getBoundingClientRect();
  // Same gate as the visible handles: shorter blocks are move-only.
  if (rect.height < TITLE_PX) return "move";
  const inset = rect.height / 3;
  const canStart = block.startedAt >= column.from;
  const canEnd = block.endedAt !== null && block.endedAt <= column.to;
  if (canStart && event.clientY - rect.top <= inset) return "start";
  if (canEnd && rect.bottom - event.clientY <= inset) return "end";
  return "move";
};

/** Calendar: Work stretches are the figure on the shared day grid — cards on
 * top of the Phase wash, one hue per Task, dragged and edited in place. */
export function TimelineGrid({
  columns,
  phases,
  mode,
  span,
  scrollPct,
  nowSec,
  selected,
  onSelect,
  onSave,
  onDelete,
}: {
  columns: GridColumn[];
  phases: Phase[];
  mode: "day" | "week";
  span?: TimeSpan | null;
  scrollPct: number | null;
  nowSec: number;
  selected: StretchEdit | null;
  onSelect: (edit: StretchEdit | null) => void;
  onSave: (
    id: number,
    startedAt: number,
    endedAt: number | null,
    rename?: { taskId: number; title: string },
  ) => void | Promise<void>;
  onDelete: (id: number) => void;
}) {
  const colsRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const nowRef = useRef(nowSec);
  nowRef.current = nowSec;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [preview, setPreview] = useState<StretchPreview | null>(null);
  const previewRef = useRef<StretchPreview | null>(null);
  const suppressClick = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    kind: StretchDragKind;
    origin: StretchTimes;
    grabOffset: number;
    source: WorkBlock;
    dragging: boolean;
    startX: number;
    startY: number;
  } | null>(null);

  const showPreview = (next: StretchPreview | null) => {
    previewRef.current = next;
    setPreview(next);
  };

  const endDrag = () => {
    const session = dragRef.current;
    const cols = colsRef.current;
    if (session && cols?.hasPointerCapture(session.pointerId)) {
      cols.releasePointerCapture(session.pointerId);
    }
    document.documentElement.classList.remove(
      "tl-drag-in-progress",
      "tl-drag-in-progress--move",
      "tl-drag-in-progress--start",
      "tl-drag-in-progress--end",
    );
    dragRef.current = null;
  };

  const stopListen = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      stopListen.current?.();
      endDrag();
      previewRef.current = null;
    },
    [],
  );

  const onBlockPointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    block: WorkBlock,
    column: GridColumn,
  ) => {
    if (event.button !== 0 || !event.isPrimary || dragRef.current) return;
    // Open stretches grow toward now and stay pinned there — click still
    // selects, drag does not move the live end.
    if (block.endedAt === null) return;
    suppressClick.current = false;
    const at = locateTime(colsRef.current, columnsRef.current, event.clientX, event.clientY);
    if (at === null) return;
    dragRef.current = {
      pointerId: event.pointerId,
      kind: dragKindAt(event, block, column),
      origin: { startedAt: block.startedAt, endedAt: block.endedAt },
      grabOffset: at - block.startedAt,
      source: block,
      dragging: false,
      startX: event.clientX,
      startY: event.clientY,
    };

    const onPointerMove = (move: PointerEvent) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== move.pointerId) return;
      if (!session.dragging) {
        if (
          Math.hypot(move.clientX - session.startX, move.clientY - session.startY) <
          DRAG_START_DISTANCE
        ) {
          return;
        }
        session.dragging = true;
        colsRef.current?.setPointerCapture(move.pointerId);
        document.documentElement.classList.add(
          "tl-drag-in-progress",
          `tl-drag-in-progress--${session.kind}`,
        );
        onSelectRef.current(null);
      }
      move.preventDefault();
      const pointerAt = locateTime(
        colsRef.current,
        columnsRef.current,
        move.clientX,
        move.clientY,
      );
      if (pointerAt === null) return;
      const next = applyStretchDrag(
        session.kind,
        session.origin,
        pointerAt,
        session.grabOffset,
        nowRef.current,
      );
      showPreview({ id: session.source.id, source: session.source, ...next });
    };

    const onPointerUp = (up: PointerEvent) => {
      const session = dragRef.current;
      if (!session || session.pointerId !== up.pointerId) return;
      stopListen.current?.();
      stopListen.current = null;
      if (!session.dragging) {
        endDrag();
        return;
      }
      suppressClick.current = true;
      const next = previewRef.current;
      const changed =
        next !== null &&
        (next.startedAt !== session.origin.startedAt || next.endedAt !== session.origin.endedAt);
      endDrag();
      if (!changed || !next) {
        showPreview(null);
        return;
      }
      void Promise.resolve(
        onSaveRef.current(next.id, next.startedAt, next.endedAt),
      ).finally(() => showPreview(null));
    };

    const onPointerCancel = () => {
      stopListen.current?.();
      stopListen.current = null;
      endDrag();
      showPreview(null);
    };

    const onKeyDown = (key: KeyboardEvent) => {
      if (key.key !== "Escape") return;
      key.preventDefault();
      onPointerCancel();
    };

    stopListen.current = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
  };

  return (
    <TimelineFrame
      columns={columns}
      phases={phases}
      mode={mode}
      span={span}
      scrollPct={scrollPct}
      nowSec={nowSec}
      colsRef={colsRef}
      renderLane={(column) => (
        <WorkLane
          column={column}
          nowSec={nowSec}
          selected={selected?.columnFrom === column.from ? selected : null}
          draggingId={preview?.id ?? null}
          blocks={blocksWithPreview(column, preview, nowSec)}
          onSelect={onSelect}
          onSave={onSave}
          onDelete={onDelete}
          onBlockPointerDown={onBlockPointerDown}
          suppressClick={suppressClick}
        />
      )}
    />
  );
}

function WorkLane({
  column,
  nowSec,
  selected,
  draggingId,
  blocks,
  onSelect,
  onSave,
  onDelete,
  onBlockPointerDown,
  suppressClick,
}: {
  column: GridColumn;
  nowSec: number;
  selected: StretchEdit | null;
  draggingId: number | null;
  blocks: WorkBlock[];
  onSelect: (edit: StretchEdit | null) => void;
  onSave: (
    id: number,
    startedAt: number,
    endedAt: number | null,
    rename?: { taskId: number; title: string },
  ) => void | Promise<void>;
  onDelete: (id: number) => void;
  onBlockPointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    block: WorkBlock,
    column: GridColumn,
  ) => void;
  suppressClick: { current: boolean };
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);
  // Stable, so the editor's placement listeners are not torn down every render.
  const cancel = useCallback(() => onSelect(null), [onSelect]);
  const selectedBlock = selected
    ? blocks.find((block) => block.id === selected.id)
    : undefined;

  return (
    <>
      {blocks.map((block) => {
        const height = pxOf(block.sizePct);
        const isOpen = block.endedAt === null;
        const canResizeStart = !isOpen && block.startedAt >= column.from;
        const canResizeEnd = block.endedAt !== null && block.endedAt <= column.to;
        const isSelected = selected?.id === block.id;
        const when = `${block.task.title} · ${formatTime(block.from)} – ${formatTime(block.to)}`;
        return (
          <button
            key={block.id}
            ref={isSelected ? selectedRef : undefined}
            type="button"
            className={`tl-block${isOpen ? " tl-block--open" : ""}${
              isSelected ? " tl-block--selected" : ""
            }${draggingId === block.id ? " tl-block--dragging" : ""}`}
            style={{
              top: `${block.startPct}%`,
              height: `max(3px, ${block.sizePct}%)`,
              left: `${(block.col / block.cols) * 100}%`,
              width: `${100 / block.cols}%`,
              "--task-hue": taskHue(block.task.id),
            } as CSSProperties}
            title={isOpen ? `${when} · Working now` : when}
            aria-label={
              isOpen
                ? `${block.task.title} · Working now · ${formatTime(block.from)} to ${formatTime(block.to)}`
                : `${block.task.title} · ${formatTime(block.from)} to ${formatTime(block.to)}`
            }
            onPointerDown={(event) => onBlockPointerDown(event, block, column)}
            onClick={(event) => {
              // A drag ends in a click we must swallow. `detail` is 0 for a
              // keyboard Enter, which never follows a drag and must still open.
              const afterDrag = suppressClick.current && event.detail !== 0;
              suppressClick.current = false;
              if (afterDrag) return;
              onSelect(
                isSelected
                  ? null
                  : {
                      id: block.id,
                      startedAt: block.startedAt,
                      endedAt: block.endedAt ?? nowSec,
                      columnFrom: column.from,
                      open: isOpen,
                    },
              );
            }}
          >
            {canResizeStart && height >= TITLE_PX ? (
              <span
                className="tl-block__handle tl-block__handle--start"
                data-tl-edge="start"
                aria-hidden="true"
              />
            ) : null}
            {height >= TITLE_PX ? (
              <span className="tl-block__title">{block.task.title}</span>
            ) : null}
            {height >= TIMES_PX ? (
              <span className="tl-block__time">
                {formatTime(block.from)} – {formatTime(block.to)}
              </span>
            ) : null}
            {canResizeEnd && height >= TITLE_PX ? (
              <span
                className="tl-block__handle tl-block__handle--end"
                data-tl-edge="end"
                aria-hidden="true"
              />
            ) : null}
          </button>
        );
      })}
      {selected && selectedBlock ? (
        <StretchEditor
          key={selected.id}
          edit={selected}
          title={selectedBlock.task.title}
          taskId={selectedBlock.task.id}
          preferredSide={stretchEditorSide(selectedBlock.col, selectedBlock.cols)}
          anchorRef={selectedRef}
          onCancel={cancel}
          onSave={onSave}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}

function StretchEditor({
  edit,
  title,
  taskId,
  preferredSide,
  anchorRef,
  onCancel,
  onSave,
  onDelete,
}: {
  edit: StretchEdit;
  title: string;
  taskId: number;
  preferredSide: "left" | "right" | null;
  anchorRef: { current: HTMLButtonElement | null };
  onCancel: () => void;
  onSave: (
    id: number,
    startedAt: number,
    endedAt: number | null,
    rename?: { taskId: number; title: string },
  ) => void | Promise<void>;
  onDelete: (id: number) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [box, setBox] = useState<StretchEditorBox | null>(null);
  const [name, setName] = useState(title);
  const [startedAt, setStartedAt] = useState(edit.startedAt);
  const [endedAt, setEndedAt] = useState(edit.endedAt);

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const form = formRef.current;
    if (!anchor || !form) return;
    const rect = anchor.getBoundingClientRect();
    // The card is fixed to the viewport but belongs to a block inside a
    // scrolling grid. Once that block has scrolled out of the grid entirely,
    // the card would sit over unrelated UI editing something unseen — close it.
    // Pinned chrome obscures stretches before they leave the scroll viewport.
    const scroll = anchor.closest<HTMLElement>(".tl__scroll");
    const clip = scroll?.getBoundingClientRect();
    const gutter = scroll?.querySelector(".tl__gutter")?.getBoundingClientRect();
    const heads = scroll?.querySelector(".tl__heads")?.getBoundingClientRect();
    const columnGap = scroll ? parseFloat(getComputedStyle(scroll).columnGap) || 0 : 0;
    const visibleTop = Math.max(clip?.top ?? 0, heads?.bottom ?? 0);
    const visibleLeft = Math.max(clip?.left ?? 0, (gutter?.right ?? 0) + columnGap);
    if (
      clip &&
      (rect.bottom <= visibleTop ||
        rect.top >= clip.bottom ||
        rect.right <= visibleLeft ||
        rect.left >= clip.right)
    ) {
      onCancel();
      return;
    }
    const next = placeStretchEditor(
      rect,
      { width: window.innerWidth, height: window.innerHeight },
      preferredSide,
      { width: form.offsetWidth, height: form.offsetHeight },
    );
    setBox((current) =>
      current &&
      current.top === next.top &&
      current.left === next.left &&
      current.width === next.width &&
      current.side === next.side
        ? current
        : next,
    );
  }, [anchorRef, onCancel, preferredSide]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [place]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onCancel();
    };
    const onPointerDown = (event: PointerEvent) => {
      const form = formRef.current;
      const target = event.target as Element | null;
      if (!target || form?.contains(target)) return;
      // Stretch clicks already toggle or switch the editor.
      if (target.closest(".tl-block")) return;
      // Native date/time pickers render outside the form.
      const focused = document.activeElement;
      if (
        form?.contains(focused) &&
        focused instanceof HTMLInputElement &&
        (focused.type === "date" || focused.type === "time")
      ) {
        return;
      }
      onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onCancel]);

  const applyStamp = (setter: (next: number) => void, date: string, time: string) => {
    const next = fromDateAndTime(date, time);
    if (next !== null) setter(next);
  };

  return createPortal(
    <form
      ref={formRef}
      className={`stretch-editor${box ? ` stretch-editor--${box.side}` : ""}`}
      style={
        box
          ? { top: box.top, left: box.left, width: box.width }
          : { top: 0, left: 0, visibility: "hidden" }
      }
      onPointerDown={(event) => event.stopPropagation()}
      onSubmit={(event) => {
        event.preventDefault();
        const nextTitle = name.trim();
        onSave(
          edit.id,
          edit.open ? edit.startedAt : startedAt,
          edit.open ? null : endedAt,
          nextTitle && nextTitle !== title
            ? { taskId, title: nextTitle }
            : undefined,
        );
      }}
    >
      <input
        className="stretch-editor__task"
        type="text"
        value={name}
        aria-label="Task"
        required
        onChange={(event) => setName(event.target.value)}
      />
      <div
        className="stretch-editor__times"
        title={edit.open ? "Start and end stay locked while Working now" : undefined}
      >
        <label>
          <span>Start</span>
          <input
            type="date"
            value={toDateInput(startedAt)}
            disabled={edit.open}
            onChange={(event) =>
              applyStamp(setStartedAt, event.target.value, toTimeInput(startedAt))
            }
          />
          <input
            type="time"
            value={toTimeInput(startedAt)}
            disabled={edit.open}
            onChange={(event) =>
              applyStamp(setStartedAt, toDateInput(startedAt), event.target.value)
            }
          />
        </label>
        <label>
          <span>End</span>
          <input
            type="date"
            value={toDateInput(endedAt)}
            disabled={edit.open}
            onChange={(event) =>
              applyStamp(setEndedAt, event.target.value, toTimeInput(endedAt))
            }
          />
          <input
            type="time"
            value={toTimeInput(endedAt)}
            disabled={edit.open}
            onChange={(event) =>
              applyStamp(setEndedAt, toDateInput(endedAt), event.target.value)
            }
          />
        </label>
      </div>
      <div className="stretch-editor__actions">
        <button type="submit" className="btn-accent">
          Save
        </button>
        <button type="button" onClick={() => onDelete(edit.id)}>
          Delete
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>,
    document.querySelector(".dashboard") ?? document.body,
  );
}
