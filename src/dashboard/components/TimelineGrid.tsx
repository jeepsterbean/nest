import { useEffect, useRef, useState } from "react";
import type { Phase } from "../../lib/types";
import { phaseName, phaseTone } from "../lib/journal";
import { formatHourTick, formatTime } from "../lib/time";
import type { PhaseSession } from "../lib/timeline";
import { placeOnWindow, type WorkBlock } from "../lib/workTimeline";

/** Height of one hour. The calibration knob for the whole grid: it decides
 * whether a block is tall enough to carry its own label. TS owns it and hands
 * it to CSS, because the label thresholds below need the same number. */
const HOUR_PX = 44;
const DAY_PX = HOUR_PX * 24;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** A block this tall fits its title; twice that also fits its start–end line. */
const TITLE_PX = 18;
const TIMES_PX = 34;

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
  endedAt: number | null;
};

const pxOf = (sizePct: number) => (sizePct / 100) * DAY_PX;

/** Vertical calendar: hours down the gutter, one column per day, each holding a
 * Phase ribbon beside its Work stretches. Every span is placed by percentage of
 * its own column, so a column and its ribbon always agree — a DST day's 23 or
 * 25 hours are squeezed into the same pixel height, off by ~4% twice a year. */
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
  onSave: (id: number, startedAt: number, endedAt: number | null) => void;
  onDelete: (id: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const target = useRef(scrollPct);
  target.current = scrollPct;
  const scrollKey = `${mode}:${columns[0]?.from ?? 0}`;

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

  const selectedBlock = columns
    .flatMap((column) => column.blocks)
    .find((block) => block.id === selected?.id);

  return (
    <div className={`tl tl--${mode}`} style={{ "--tl-hour": `${HOUR_PX}px` } as React.CSSProperties}>
      {selected ? (
        <StretchEditor
          key={selected.id}
          edit={selected}
          title={selectedBlock?.task.title ?? ""}
          canReopen={selectedBlock?.task.status === "active"}
          onCancel={() => onSelect(null)}
          onSave={onSave}
          onDelete={onDelete}
        />
      ) : null}
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
        <div className="tl__gutter">
          {HOURS.map((hour) => (
            <span key={hour} className="tl__hour">
              {formatHourTick((columns[0]?.from ?? 0) + hour * 3600)}
            </span>
          ))}
        </div>
        <div className="tl__cols">
          {HOURS.map((hour) => (
            <div key={hour} className="tl__rule" style={{ top: `${(hour / 24) * 100}%` }} />
          ))}
          {columns.map((column) => (
            <Column
              key={column.from}
              column={column}
              phases={phases}
              nowSec={nowSec}
              selectedId={selected?.id ?? null}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>    </div>
  );
}

function Column({
  column,
  phases,
  nowSec,
  selectedId,
  onSelect,
}: {
  column: GridColumn;
  phases: Phase[];
  nowSec: number;
  selectedId: number | null;
  onSelect: (edit: StretchEdit | null) => void;
}) {
  const place = (from: number, to: number) =>
    placeOnWindow(from, to, column.from, column.to);
  const now = place(nowSec, nowSec);

  return (
    <div className="tl__col">
      <div className="tl__ribbon">
        {column.sessions.map((session) => {
          const name = phaseName(session.phaseId, phases);
          const { startPct, sizePct } = place(session.from, session.to);
          return (
            <div
              key={`${session.from}-${session.phaseId}`}
              className={`tl__phase tl__phase--${phaseTone(name)}`}
              style={{ top: `${startPct}%`, height: `${sizePct}%` }}
              title={`${name} · ${formatTime(session.from)} – ${formatTime(session.to)}`}
            >
              {pxOf(sizePct) >= 24 ? <span>{name}</span> : null}
            </div>
          );
        })}
      </div>
      <div className="tl__work">
        {column.blocks.map((block) => {
          const height = pxOf(block.sizePct);
          return (
            <button
              key={block.id}
              type="button"
              className={`tl-block${selectedId === block.id ? " tl-block--selected" : ""}`}
              style={{
                top: `${block.startPct}%`,
                height: `max(3px, ${block.sizePct}%)`,
                left: `${(block.col / block.cols) * 100}%`,
                width: `${100 / block.cols}%`,
              }}
              title={`${block.task.title} · ${formatTime(block.from)} – ${formatTime(block.to)}`}
              aria-label={`${block.task.title} · ${formatTime(block.from)} to ${formatTime(block.to)}`}
              onClick={() =>
                onSelect(
                  selectedId === block.id
                    ? null
                    : {
                        id: block.id,
                        startedAt: block.from,
                        endedAt: block.to,
                      },
                )
              }
            >
              {height >= TITLE_PX ? (
                <span className="tl-block__title">{block.task.title}</span>
              ) : null}
              {height >= TIMES_PX ? (
                <span className="tl-block__time">
                  {formatTime(block.from)} – {formatTime(block.to)}
                </span>
              ) : null}
            </button>
          );
        })}
        {nowSec >= column.from && nowSec < column.to ? (
          <div className="tl__now" style={{ top: `${now.startPct}%` }} />
        ) : null}
      </div>
    </div>
  );
}

/** Local <input type="datetime-local"> value for a unix second. */
const toLocalInput = (ts: number) => {
  const d = new Date(ts * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

const fromLocalInput = (value: string) => Math.floor(new Date(value).getTime() / 1000);

function StretchEditor({
  edit,
  title,
  canReopen,
  onCancel,
  onSave,
  onDelete,
}: {
  edit: StretchEdit;
  title: string;
  canReopen: boolean;
  onCancel: () => void;
  onSave: (id: number, startedAt: number, endedAt: number | null) => void;
  onDelete: (id: number) => void;
}) {
  const [startedAt, setStartedAt] = useState(() => toLocalInput(edit.startedAt));
  const [endedAt, setEndedAt] = useState(() =>
    toLocalInput(edit.endedAt ?? edit.startedAt),
  );
  const [open, setOpen] = useState(edit.endedAt === null);

  useEffect(() => {
    if (!canReopen) setOpen(false);
  }, [canReopen]);

  return (
    <form
      className="stretch-editor"
      onSubmit={(event) => {
        event.preventDefault();
        onSave(edit.id, fromLocalInput(startedAt), open ? null : fromLocalInput(endedAt));
      }}
    >
      <span className="stretch-editor__task">{title}</span>
      <label>
        Start
        <input
          type="datetime-local"
          step="1"
          value={startedAt}
          onChange={(event) => setStartedAt(event.target.value)}
        />
      </label>
      <label>
        End
        <input
          type="datetime-local"
          step="1"
          value={endedAt}
          disabled={open}
          onChange={(event) => setEndedAt(event.target.value)}
        />
      </label>
      {canReopen ? (
        <label className="stretch-editor__open">
          <input
            type="checkbox"
            checked={open}
            onChange={(event) => setOpen(event.target.checked)}
          />
          Still working
        </label>
      ) : null}
      <button type="submit" className="btn-accent">
        Save
      </button>
      <button type="button" onClick={() => onDelete(edit.id)}>
        Delete
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  );
}
