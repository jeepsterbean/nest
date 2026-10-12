import { ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";

const UNIT_NAMES = { day: "Day", week: "Week", month: "Month" } as const;

export function DateNavigation({ label, unit, canGoPrevious = true, canGoNext, onPrevious, onNext, onToday }: {
  label: string;
  unit: keyof typeof UNIT_NAMES;
  canGoPrevious?: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onToday?: () => void;
}) {
  return (
    <div className={`date-navigation date-navigation--${unit}`} role="group" aria-label={`${UNIT_NAMES[unit]} navigation`}>
      <button type="button" aria-label={`Previous ${unit}`} disabled={!canGoPrevious} onClick={onPrevious}>
        <ChevronLeft aria-hidden="true" />
      </button>
      <span className="date-navigation__label" aria-live="polite" title={label}>{label}</span>
      <button type="button" aria-label={`Next ${unit}`} disabled={!canGoNext} onClick={onNext}>
        <ChevronRight aria-hidden="true" />
      </button>
      {onToday && <button type="button" aria-label="Go to today" title="Go to today" onClick={onToday}>
        <ChevronsRight aria-hidden="true" />
      </button>}
    </div>
  );
}
