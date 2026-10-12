import { createPortal } from "react-dom";
import { DayCalendar, type DayPickerProps } from "./DayPicker";
import { ViewToggle } from "./ViewToggle";
import {
  RECAP_PRESENTATIONS,
  type RecapPresentation,
} from "../lib/insights";

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
    <div className="range-sidebar__presentation">
      <ViewToggle
        value={presentation}
        options={RECAP_PRESENTATIONS}
        label="Recap presentation"
        onChange={onPresentation}
      />
    </div>
    <div className="range-sidebar__dates">
      <div className="range-sidebar__month">
        <DayCalendar earliestSec={range.earliestSec} nowMs={range.nowMs} selected={{ from: range.from, to: range.to }} onPick={onPick} markedDays={markedDays} />
      </div>
    </div>
  </>, target);
}
