import { createPortal } from "react-dom";
import { DayCalendar, type DayPickerProps } from "./DayPicker";
import { NestIcon, type NestIconKey } from "./PulseIcon";
import {
  RECAP_PRESENTATIONS,
  type RecapPresentation,
} from "../lib/insights";

const PRESENTATION_ICON: Record<RecapPresentation, NestIconKey> = {
  calendar: "calendar",
  timeline: "stretch",
};

export function DateRangeSidebar({
  target,
  range,
  presentation,
  onPresentation,
  onPick,
  markedDays,
}: {
  target: HTMLElement | null;
  range: {
    from: number;
    to: number;
    earliestSec: number;
    nowMs: number;
  };
  presentation: RecapPresentation;
  onPresentation: (presentation: RecapPresentation) => void;
  onPick: DayPickerProps["onPick"];
  markedDays?: ReadonlySet<number>;
}) {
  if (!target) return null;
  return createPortal(<>
    <h2 className="section-sidebar__title">Recap</h2>
    <nav className="section-nav" aria-label="Recap presentation">
      {RECAP_PRESENTATIONS.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`section-nav__button${presentation === item.key ? " section-nav__button--active" : ""}`}
          aria-current={presentation === item.key ? "page" : undefined}
          onClick={() => onPresentation(item.key)}
        >
          <NestIcon name={PRESENTATION_ICON[item.key]} />
          <span className="section-nav__label">{item.label}</span>
        </button>
      ))}
    </nav>
    <div className="range-sidebar__dates">
      <div className="range-sidebar__month">
        <DayCalendar earliestSec={range.earliestSec} nowMs={range.nowMs} selected={{ from: range.from, to: range.to }} onPick={onPick} markedDays={markedDays} />
      </div>
    </div>
  </>, target);
}
