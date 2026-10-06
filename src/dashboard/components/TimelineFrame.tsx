import { useEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { Phase } from "../../lib/types";
import { phaseColor, phaseIcon, phaseName, phaseTone } from "../lib/period";
import { NestIcon } from "./PulseIcon";
import { formatHourTick, formatTime } from "../lib/time";
import type { PhaseSession } from "../lib/timeline";
import { placeOnWindow } from "../lib/workTimeline";

/** Height of one hour. The calibration knob for the whole grid: it decides
 * whether a block is tall enough to carry its own label. TS owns it and hands
 * it to CSS, because the label thresholds need the same number. */
export const HOUR_PX = 44;
export const DAY_PX = HOUR_PX * 24;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/** A rail segment this tall carries its Phase icon; shorter ones stay a bare tint. */
const RAIL_ICON_PX = 20;

export type FrameColumn = {
  from: number;
  to: number;
  label: string;
  sessions: PhaseSession[];
};

/** A stretch of time the grid marks across its lanes, e.g. Last hour. */
export type TimeSpan = { from: number; to: number };

export const pxOf = (sizePct: number) => (sizePct / 100) * DAY_PX;

/** Sessions with their column placement and display name — the rail and the
 * wash draw the same list, so they can never disagree. */
const placeSessions = (column: FrameColumn, phases: Phase[]) =>
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

/** Vertical day grid shared by Calendar and the Logs Hours layout: hours down
 * the gutter, one column per day. Phase is the ground — a continuous wash
 * behind the column, keyed by icon on the rail left of the hours; each caller
 * draws its own figure on top through `renderLane`. Every span is placed by
 * percentage of its own column, so wash and figure always agree — a DST day's
 * 23 or 25 hours are squeezed into the same pixel height, off by ~4% twice a
 * year. */
export function TimelineFrame<C extends FrameColumn>({
  columns,
  phases,
  mode,
  span = null,
  scrollPct,
  nowSec,
  colsRef,
  renderLane,
}: {
  columns: C[];
  phases: Phase[];
  mode: "day" | "week";
  span?: TimeSpan | null;
  scrollPct: number | null;
  nowSec: number;
  colsRef?: RefObject<HTMLDivElement | null>;
  renderLane: (column: C) => ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const target = useRef(scrollPct);
  target.current = scrollPct;
  const scrollKey = `${mode}:${columns[0]?.from ?? 0}`;

  const nowRef = useRef(nowSec);
  nowRef.current = nowSec;

  // Re-aim only when the range changes, never on the minute tick — otherwise it
  // would yank the view back out from under a scroll the user just made.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (target.current !== null) {
      el.scrollTop = Math.max(
        0,
        (target.current / 100) * DAY_PX - el.clientHeight * 0.4,
      );
    }
    // A Week wider than the grid scrolls sideways; bring today's day into
    // view past the pinned hour gutter.
    const liveIndex = columns.findIndex(
      (column) => nowRef.current >= column.from && nowRef.current < column.to,
    );
    const lane = el.querySelectorAll<HTMLElement>(".tl__lane")[liveIndex];
    const gutter = el.querySelector<HTMLElement>(".tl__gutter");
    if (!lane || !gutter) {
      el.scrollLeft = 0;
      return;
    }
    const laneRect = lane.getBoundingClientRect();
    const viewLeft = gutter.getBoundingClientRect().right;
    const viewRight = el.getBoundingClientRect().right;
    if (laneRect.right > viewRight || laneRect.left < viewLeft) {
      el.scrollLeft += laneRect.left - viewLeft;
    }
    // `columns` is read once per range, like `target`; scrollKey names the range.
  }, [scrollKey]);

  const spanMark =
    span && columns[0]
      ? placeOnWindow(span.from, span.to, columns[0].from, columns[0].to)
      : null;

  return (
    <div className={`tl tl--${mode}`} style={{ "--tl-hour": `${HOUR_PX}px` } as CSSProperties}>
      <div className="tl__scroll" ref={scrollRef}>
        {columns.length > 1 ? (
          <>
            <div className="tl__corner" aria-hidden="true" />
            <div className="tl__heads">
              {columns.map((column) => (
                <span key={column.from} className="tl__head">
                  {column.label}
                </span>
              ))}
            </div>
          </>
        ) : null}
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
          {spanMark && spanMark.sizePct > 0 ? (
            <span
              className="tl__span-mark"
              aria-hidden="true"
              style={{ top: `${spanMark.startPct}%`, height: `${spanMark.sizePct}%` }}
            />
          ) : null}
        </div>
        <div className="tl__cols" ref={colsRef}>
          {HOURS.map((hour) => (
            <div key={hour} className="tl__rule" style={{ top: `${(hour / 24) * 100}%` }} />
          ))}
          {columns.map((column) => {
            const now = placeOnWindow(nowSec, nowSec, column.from, column.to);
            const spanOnColumn = span
              ? placeOnWindow(span.from, span.to, column.from, column.to)
              : null;
            return (
              <div key={column.from} className="tl__lane">
                {placeSessions(column, phases).map(
                  ({ session, name, color, startPct, sizePct }) => (
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
                  ),
                )}
                {spanOnColumn && spanOnColumn.sizePct > 0 ? (
                  <div
                    className="tl__span"
                    aria-hidden="true"
                    style={{
                      top: `${spanOnColumn.startPct}%`,
                      height: `${spanOnColumn.sizePct}%`,
                    }}
                  />
                ) : null}
                {renderLane(column)}
                {nowSec >= column.from && nowSec < column.to ? (
                  <div className="tl__now" style={{ top: `${now.startPct}%` }} />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
