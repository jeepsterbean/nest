import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { Metric, Phase, Pulse, Task } from "../../lib/types";
import { brainDumpSummary } from "../../lib/brainDumpRichText";
import { TimelineFrame, type FrameColumn, type TimeSpan } from "../components/TimelineFrame";
import { LogEventIcon, logEventLabel, TaskLogIcon } from "../components/logs/LogEventMark";
import { MetricCheckInDetail } from "../components/logs/MetricCheckInDetail";
import { SavedBrainDump } from "../components/SavedBrainDump";
import { taskHue } from "../lib/period";
import { formatTime } from "../lib/time";
import { taskChangeLabel, taskTitle } from "../lib/logs";
import type { HourMark, LogHour } from "../lib/logHours";
import {
  placeOnWindow,
  placeStretchEditor,
  type StretchEditorBox,
} from "../lib/workTimeline";

export type LogsHoursColumn = FrameColumn & { hours: LogHour[] };

/** Hover shows a read-only preview; a click pins the full card until dismissed. */
type OpenCard = { mark: HourMark; anchor: HTMLElement; pinned: boolean };

type MarkContext = { phases: Phase[]; pulses: Pulse[]; tasks: Task[] };

const markAt = (mark: HourMark) =>
  mark.kind === "task" ? mark.changes[0].at : mark.event.at;

const markLabel = (mark: HourMark, { phases, pulses, tasks }: MarkContext) =>
  mark.kind === "task"
    ? taskTitle(tasks, mark.taskId)
    : logEventLabel(mark.event, phases, pulses, tasks);

/** Calendar's Logs figure: the selected range on one grid. Week is a column
 * per day under a shared hour gutter. Each hour holds an icon per Metric
 * check-in, brain dump, and Task changed in that hour; Phase is the wash
 * behind them. */
export function LogsHours({
  columns,
  mode,
  span,
  phases,
  metrics,
  pulses,
  tasks,
  scrollPct,
  nowSec,
  onDeleteCheckIn,
}: {
  columns: LogsHoursColumn[];
  mode: "day" | "week";
  span: TimeSpan | null;
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  scrollPct: number | null;
  nowSec: number;
  onDeleteCheckIn: (id: number) => void;
}) {
  const [card, setCard] = useState<OpenCard | null>(null);
  const context: MarkContext = { phases, pulses, tasks };
  const close = useCallback(() => setCard(null), []);
  const rangeKey = `${columns[0]?.from ?? 0}:${columns[columns.length - 1]?.to ?? 0}`;

  // A pinned card belongs to the range it was opened on.
  useEffect(() => setCard(null), [rangeKey]);

  const preview = (mark: HourMark, anchor: HTMLElement) =>
    setCard((current) => (current?.pinned ? current : { mark, anchor, pinned: false }));
  const endPreview = (mark: HourMark) =>
    setCard((current) =>
      current && !current.pinned && current.mark.key === mark.key ? null : current,
    );
  const togglePinned = (mark: HourMark, anchor: HTMLElement) =>
    setCard((current) =>
      current?.pinned && current.mark.key === mark.key
        ? null
        : { mark, anchor, pinned: true },
    );

  return (
    <>
      <TimelineFrame
        columns={columns}
        phases={phases}
        mode={mode}
        span={span}
        scrollPct={scrollPct}
        nowSec={nowSec}
        renderLane={(lane) =>
          lane.hours.map((hour) => {
            const { startPct, sizePct } = placeOnWindow(
              hour.from,
              hour.to,
              lane.from,
              lane.to,
            );
            return (
              <div
                key={hour.from}
                className="logs-hour"
                style={{ top: `${startPct}%`, height: `${sizePct}%` }}
              >
                {hour.marks.map((mark) => {
                  const pinned = card?.pinned === true && card.mark.key === mark.key;
                  return (
                    <button
                      key={mark.key}
                      type="button"
                      className={`logs-hour__mark logs-hour__mark--${mark.kind}${
                        pinned ? " logs-hour__mark--open" : ""
                      }`}
                      style={
                        mark.kind === "task"
                          ? ({ "--task-hue": taskHue(mark.taskId) } as CSSProperties)
                          : undefined
                      }
                      aria-label={`${formatTime(markAt(mark))} · ${markLabel(mark, context)}`}
                      aria-expanded={pinned}
                      aria-haspopup="dialog"
                      onMouseEnter={(event) => preview(mark, event.currentTarget)}
                      onMouseLeave={() => endPreview(mark)}
                      onFocus={(event) => preview(mark, event.currentTarget)}
                      onBlur={() => endPreview(mark)}
                      onClick={(event) => togglePinned(mark, event.currentTarget)}
                    >
                      {mark.kind === "task" ? (
                        <TaskLogIcon />
                      ) : (
                        <LogEventIcon
                          event={mark.event}
                          phases={phases}
                          pulses={pulses}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })
        }
      />
      {card ? (
        <LogHourCard
          key={`${card.mark.key}-${card.pinned}`}
          card={card}
          context={context}
          metrics={metrics}
          onClose={close}
          onDeleteCheckIn={(id) => {
            close();
            onDeleteCheckIn(id);
          }}
        />
      ) : null}
    </>
  );
}

function LogHourCard({
  card,
  context,
  metrics,
  onClose,
  onDeleteCheckIn,
}: {
  card: OpenCard;
  context: MarkContext;
  metrics: Metric[];
  onClose: () => void;
  onDeleteCheckIn: (id: number) => void;
}) {
  const { mark, anchor, pinned } = card;
  const cardRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<StretchEditorBox | null>(null);

  const place = useCallback(() => {
    const el = cardRef.current;
    if (!el) return;
    const rect = anchor.getBoundingClientRect();
    // Fixed to the viewport but tied to a mark inside the scrolling grid: once
    // the mark scrolls out of the grid the card would describe nothing visible.
    const clip = anchor.closest(".tl__scroll")?.getBoundingClientRect();
    const hourClip = anchor.closest(".logs-hour")?.getBoundingClientRect();
    if (
      (clip && (rect.bottom <= clip.top || rect.top >= clip.bottom)) ||
      (hourClip && (rect.right <= hourClip.left || rect.left >= hourClip.right))
    ) {
      onClose();
      return;
    }
    setBox(
      placeStretchEditor(
        rect,
        { width: window.innerWidth, height: window.innerHeight },
        null,
        { width: el.offsetWidth, height: el.offsetHeight },
      ),
    );
  }, [anchor, onClose]);

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
    if (!pinned) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target || cardRef.current?.contains(target)) return;
      // Mark clicks already toggle or switch the card.
      if (target.closest(".logs-hour__mark")) return;
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose, pinned]);

  const at = markAt(mark);

  return createPortal(
    <div
      ref={cardRef}
      className={`logs-hour-card logs-hour-card--${mark.kind}${
        pinned ? "" : " logs-hour-card--preview"
      }`}
      role={pinned ? "dialog" : "tooltip"}
      aria-label={markLabel(mark, context)}
      style={
        box
          ? { top: box.top, left: box.left, width: box.width }
          : { top: 0, left: 0, visibility: "hidden" }
      }
    >
      {mark.kind === "dump" && pinned ? (
        <SavedBrainDump dump={mark.event.dump} />
      ) : (
        <>
          <header className="logs-hour-card__head">
            <time dateTime={new Date(at * 1000).toISOString()}>{formatTime(at)}</time>
            <strong>{markLabel(mark, context)}</strong>
          </header>
          {mark.kind === "metrics" ? (
            <div className="logs-hour-card__metrics">
              <MetricCheckInDetail
                checkIn={mark.event.checkIn}
                metrics={metrics}
                onDelete={pinned ? onDeleteCheckIn : undefined}
              />
            </div>
          ) : mark.kind === "dump" ? (
            <p className="logs-hour-card__summary">
              {brainDumpSummary(mark.event.dump.text)}
            </p>
          ) : pinned ? (
            <ol className="logs-hour-card__changes">
              {mark.changes.map((change) => (
                <li key={`${change.kind}-${change.kind === "task-status" ? change.statusEvent.id : change.stretch.id}`}>
                  <time dateTime={new Date(change.at * 1000).toISOString()}>
                    {formatTime(change.at)}
                  </time>
                  <span>{taskChangeLabel(change)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="logs-hour-card__summary">
              {taskChangeLabel(mark.changes[mark.changes.length - 1])}
              {mark.changes.length > 1 ? ` · ${mark.changes.length} changes this hour` : ""}
            </p>
          )}
        </>
      )}
    </div>,
    document.querySelector(".dashboard") ?? document.body,
  );
}
