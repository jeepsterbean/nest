import { DayPicker, type DayPickerProps } from "./DayPicker";
import { ViewToggle } from "./ViewToggle";

export function RangeToolbar<T extends string>({
  label,
  mode,
  options,
  title,
  canGoBack,
  isNow,
  live = false,
  dayPicker,
  onMode,
  onStep,
  onToday,
}: {
  label: string;
  mode: T;
  options: readonly { key: T; label: string }[];
  title: string;
  canGoBack: boolean;
  isNow: boolean;
  /** A rolling window that follows the clock: no paging, the title marks it live. */
  live?: boolean;
  /** When set, the title opens a day picker. */
  dayPicker?: DayPickerProps;
  onMode: (key: T) => void;
  onStep: (direction: number) => void;
  onToday: () => void;
}) {
  const titleContent = (
    <>
      {title}
      {live ? (
        <span className="range-nav__live">
          <span className="range-nav__live-dot" aria-hidden="true" />
          live
        </span>
      ) : null}
    </>
  );

  return (
    <div className="dash-toolbar">
      <ViewToggle
        value={mode}
        options={options}
        label={label}
        onChange={onMode}
      />
      <div className="range-nav">
        {live ? null : (
          <button
            type="button"
            aria-label="Earlier"
            disabled={!canGoBack}
            onClick={() => onStep(-1)}
          >
            ←
          </button>
        )}
        {dayPicker ? (
          <DayPicker label={title} {...dayPicker}>
            {titleContent}
          </DayPicker>
        ) : (
          <span className="range-nav__title">{titleContent}</span>
        )}
        {live ? null : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
}
