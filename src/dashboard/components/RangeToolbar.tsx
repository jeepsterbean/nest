import {
  RANGE_MODES,
  type RangeModeKey,
} from "../lib/insights";
import { ViewToggle } from "./ViewToggle";

export function RangeToolbar({
  label,
  mode,
  title,
  canGoBack,
  isNow,
  onMode,
  onStep,
  onToday,
}: {
  label: string;
  mode: RangeModeKey;
  title: string;
  canGoBack: boolean;
  isNow: boolean;
  onMode: (key: RangeModeKey) => void;
  onStep: (direction: number) => void;
  onToday: () => void;
}) {
  return (
    <div className="dash-toolbar">
      <ViewToggle
        value={mode}
        options={RANGE_MODES}
        label={label}
        onChange={onMode}
      />
      <div className="range-nav">
        <button
          type="button"
          aria-label="Earlier"
          disabled={!canGoBack}
          onClick={() => onStep(-1)}
        >
          ←
        </button>
        <span className="range-nav__title">{title}</span>
        <button
          type="button"
          aria-label="Later"
          disabled={isNow}
          onClick={() => onStep(1)}
        >
          →
        </button>
        <button type="button" disabled={isNow} onClick={onToday}>
          Today
        </button>
      </div>
    </div>
  );
}
