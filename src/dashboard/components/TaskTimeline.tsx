import { useEffect, useState } from "react";
import { formatCompactDuration, formatTime } from "../lib/time";
import type { WorkLane } from "../lib/workTimeline";

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

export type StretchEdit = {
  id: number;
  startedAt: number;
  endedAt: number | null;
};

/** Task lanes over the same window as the Phase strip. Blocks are buttons so a
 * mistimed stretch can be corrected. */
export function TaskTimeline({
  lanes,
  selected,
  onSelect,
  onSave,
  onDelete,
}: {
  lanes: WorkLane[];
  selected: StretchEdit | null;
  onSelect: (edit: StretchEdit | null) => void;
  onSave: (id: number, startedAt: number, endedAt: number | null) => void;
  onDelete: (id: number) => void;
}) {
  if (lanes.length === 0) {
    return <p className="dash-empty">No work recorded in this range.</p>;
  }

  return (
    <>
      <ul className="work-timeline">
        {lanes.map((lane) => (
          <li key={lane.task.id} className="work-lane">
            <span className="work-lane__title" title={lane.task.title}>
              {lane.task.title}
            </span>
            <span className="work-lane__total">
              {formatCompactDuration(lane.seconds)}
            </span>
            <div className="work-lane__track">
              {lane.blocks.map((block) => (
                <button
                  key={block.id}
                  type="button"
                  className={`work-block${
                    selected?.id === block.id ? " work-block--selected" : ""
                  }`}
                  style={{
                    left: `${block.leftPct}%`,
                    width: `max(2px, ${block.widthPct}%)`,
                  }}
                  aria-label={`${lane.task.title} · ${formatTime(block.from)} to ${formatTime(block.to)}`}
                  onClick={() =>
                    onSelect(
                      selected?.id === block.id
                        ? null
                        : {
                            id: block.id,
                            startedAt: block.from,
                            endedAt: block.to,
                          },
                    )
                  }
                />
              ))}
            </div>
          </li>
        ))}
      </ul>
      {selected ? (
        <StretchEditor
          key={selected.id}
          edit={selected}
          title={
            lanes.find((lane) =>
              lane.blocks.some((block) => block.id === selected.id),
            )?.task.title ?? ""
          }
          canReopen={
            lanes.find((lane) =>
              lane.blocks.some((block) => block.id === selected.id),
            )?.task.status === "active"
          }
          onCancel={() => onSelect(null)}
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
