// Behavior and invariants: docs/interface/time-surfaces.md#dates-and-ranges
import { ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import type { DayPickerProps } from "../lib/dayPicker";
import { DayCalendar } from "./DayPicker";

const UNIT_NAMES = { day: "Day", week: "Week", month: "Month" } as const;

export function DateNavigation({ label, unit, canGoPrevious = true, canGoNext, onPrevious, onNext, onToday, picker }: {
  label: string;
  unit: keyof typeof UNIT_NAMES;
  canGoPrevious?: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday?: () => void;
  /** Makes the label a button that opens a month calendar under it. */
  picker?: DayPickerProps;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closePicker = () => {
    setPickerOpen(false);
    toggleRef.current?.focus();
  };
  useDismiss(pickerRef, pickerOpen, (reason) => {
    if (reason === "escape") closePicker();
    else setPickerOpen(false);
  });
  useEffect(() => {
    if (!pickerOpen) return;
    pickerRef.current
      ?.querySelector<HTMLButtonElement>(".day-picker__day[tabindex='0']")
      ?.focus();
  }, [pickerOpen]);

  const labelText = (
    <span className="date-navigation__label" aria-live="polite" title={label}>{label}</span>
  );

  return (
    <div className={`date-navigation date-navigation--${unit}`} role="group" aria-label={`${UNIT_NAMES[unit]} navigation`}>
      <button type="button" aria-label={`Previous ${unit}`} disabled={!canGoPrevious} onClick={onPrevious}>
        <ChevronLeft aria-hidden="true" />
      </button>
      {picker ? (
        <div className="date-navigation__picker" ref={pickerRef}>
          <button
            ref={toggleRef}
            type="button"
            className="date-navigation__picker-toggle"
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
          >
            {labelText}
          </button>
          {pickerOpen && (
            <div className="date-navigation__popover" role="dialog" aria-label="Choose a date">
              <DayCalendar
                {...picker}
                onPick={(dayMs) => {
                  picker.onPick(dayMs);
                  closePicker();
                }}
              />
            </div>
          )}
        </div>
      ) : labelText}
      <button type="button" aria-label={`Next ${unit}`} disabled={!canGoNext} onClick={onNext}>
        <ChevronRight aria-hidden="true" />
      </button>
      {onToday && <button type="button" aria-label="Go to today" title="Go to today" onClick={onToday}>
        <ChevronsRight aria-hidden="true" />
      </button>}
    </div>
  );
}
