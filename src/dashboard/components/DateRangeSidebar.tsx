import { createPortal } from "react-dom";
import { DayCalendar, type DayPickerProps } from "./DayPicker";
import { ViewToggle } from "./ViewToggle";
import {
  RECAP_PRESENTATIONS,
  RANGE_MODES,
  type RecapPresentation,
  type RangeModeKey,
} from "../lib/insights";

export function DateRangeSidebar({
  target,
  range,
  presentation,
  onPresentation,
  onMode,
  onPick,
  markedDays,
}: {
  target: HTMLElement | null;
  range: {
    mode: RangeModeKey;
    from: number;
    to: number;
    earliestSec: number;
    nowMs: number;
  };
  presentation: RecapPresentation;
  onPresentation: (presentation: RecapPresentation) => void;
  onMode: (mode: RangeModeKey) => void;
  onPick: DayPickerProps["onPick"];
  markedDays?: ReadonlySet<number>;
}) {
  if (!target) return null;
  return createPortal(<>
    <h2 className="section-sidebar__title">Recap</h2>
    <div className="range-sidebar__modes">
      <ViewToggle
        value={range.mode}
        options={RANGE_MODES}
        label="Recap date range"
        onChange={onMode}
      />
      {range.mode === "day" && (
        <ViewToggle
          value={presentation}
          options={RECAP_PRESENTATIONS}
          label="Recap presentation"
          onChange={onPresentation}
        />
      )}
    </div>
    <div className="range-sidebar__dates">
      <div className="range-sidebar__month">
        <DayCalendar earliestSec={range.earliestSec} nowMs={range.nowMs} selected={{ from: range.from, to: range.to }} onPick={onPick} markedDays={markedDays} />
      </div>
    </div>
  </>, target);
}
