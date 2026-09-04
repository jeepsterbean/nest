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
import { phaseColor, phaseIcon, phaseName, phaseTone, taskHue } from "../lib/period";
import { NestIcon } from "./PulseIcon";
import { formatHourTick, formatTime, fromDateAndTime, toDateInput, toTimeInput } from "../lib/time";
import type { PhaseSession } from "../lib/timeline";
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

/** Height of one hour. The calibration knob for the whole grid: it decides
 * whether a block is tall enough to carry its own label. TS owns it and hands
 * it to CSS, because the label thresholds below need the same number. */
const HOUR_PX = 44;
const DAY_PX = HOUR_PX * 24;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** A block this tall fits its title; twice that also fits its start–end line. */
const TITLE_PX = 18;
const TIMES_PX = 34;

/** A rail segment this tall carries its Phase icon; shorter ones stay a bare tint. */
const RAIL_ICON_PX = 20;
/** Pointer must move this far before a press becomes a drag, so clicks still select. */
const DRAG_START_DISTANCE = 6;

export type GridColumn = {
  from: number;
  to: number;
  label: string;
  sessions: PhaseSession[];
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

const pxOf = (sizePct: number) => (sizePct / 100) * DAY_PX;

/** Sessions with their column placement and display name — the rail and the
 * wash draw the same list, so they can never disagree. */
const placeSessions = (column: GridColumn, phases: Phase[]) =>
  column.sessions.map((session) => {
    const name = phaseName(session.phaseId, phases);
    return {
      session,
      name,
      icon: phaseIcon(session.phaseId, phases, name),
      color: phaseColor(session.phaseId, phases),
      ...placeOnWindow(session.from, session.to, column.from, column.to),
    };
  });

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

/** Vertical calendar: hours down the gutter, one column per day. Phase is the
 * ground — a continuous wash behind the column, keyed by icon on the rail left
 * of the hours; Work stretches are the figure — cards on top, one hue per Task.
 * Every span is placed by percentage of its own column, so wash and card always
 * agree — a DST day's 23 or 25 hours are squeezed into the same pixel height,
 * off by ~4% twice a year. */
export function TimelineGrid({
  columns,
  phases,
  mode,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const colsRef = useRef<HTMLDivElement>(null);
  const target = useRef(scrollPct);
  target.current = scrollPct;
  const scrollKey = `${mode}:${columns[0]?.from ?? 0}`;
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

  // Re-aim only when the range changes, never on the minute tick — otherwise it
  // would yank the view back out from under a scroll the user just made.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || target.current === null) return;
    el.scrollTop = Math.max(
      0,
      (target.current / 100) * DAY_PX - el.clientHeight * 0.4,
    );
  }, [scrollKey]);

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
    <div className={`tl tl--${mode}`} style={{ "--tl-hour": `${HOUR_PX}px` } as CSSProperties}>
      {columns.length > 1 ? (
        <div className="tl__heads">
          {columns.map((column) => (
            <span key={column.from} className="tl__head">
              {column.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="tl__scroll" ref={scrollRef}>
        {mode === "day" && columns[0] ? (
          <div className="tl__rail" aria-hidden="true">
            {placeSessions(columns[0], phases).map(
              ({ session, name, icon, color, startPct, sizePct }) => (
                <div
                  key={`${session.from}-${session.phaseId}`}
                  className={`tl__rail-seg tl__rail-seg--${phaseTone(name)}${
                    color ? " tl__rail-seg--colored" : ""
                  }`}
                  style={{
                    top: `${startPct}%`,
                    height: `${sizePct}%`,
                    ...(color
                      ? ({ "--phase-color": color } as CSSProperties)
                      : null),
                  }}
                  title={`${name} · ${formatTime(session.from)} – ${formatTime(session.to)}`}
                >
                  {pxOf(sizePct) >= RAIL_ICON_PX ? (
                    <NestIcon name={icon} />
                  ) : null}
                </div>
              ),
            )}
          </div>
        ) : null}
        <div className="tl__gutter">
          {HOURS.map((hour) => (
            <span key={hour} className="tl__hour">
              {formatHourTick((columns[0]?.from ?? 0) + hour * 3600)}
            </span>
          ))}
        </div>
        <div className="tl__cols" ref={colsRef}>
          {HOURS.map((hour) => (
            <div key={hour} className="tl__rule" style={{ top: `${(hour / 24) * 100}%` }} />
          ))}
          {columns.map((column) => (
            <Column
              key={column.from}
              column={column}
              phases={phases}
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
          ))}
        </div>
      </div>
    </div>
  );
}

function Column({
  column,
  phases,
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
  phases: Phase[];
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
  const place = (from: number, to: number) =>
    placeOnWindow(from, to, column.from, column.to);
  const now = place(nowSec, nowSec);
  const sessions = placeSessions(column, phases);
  const selectedBlock = selected
    ? blocks.find((block) => block.id === selected.id)
    : undefined;

  return (
    <div className="tl__lane">
      {sessions.map(({ session, name, color, startPct, sizePct }) => (
        <div
          key={`${session.from}-${session.phaseId}`}
          className={`tl__wash tl__wash--${phaseTone(name)}${
            color ? " tl__wash--colored" : ""
          }`}
          style={{
            top: `${startPct}%`,
            height: `${sizePct}%`,
            ...(color
              ? ({ "--phase-color": color } as CSSProperties)
              : null),
          }}
          title={`${name} · ${formatTime(session.from)} – ${formatTime(session.to)}`}
        />
      ))}
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
      {nowSec >= column.from && nowSec < column.to ? (
        <div className="tl__now" style={{ top: `${now.startPct}%` }} />
      ) : null}
    </div>
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
    const clip = anchor.closest(".tl__scroll")?.getBoundingClientRect();
    if (clip && (rect.bottom <= clip.top || rect.top >= clip.bottom)) {
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
