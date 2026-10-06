import type { ReactNode } from "react";
import { DayPicker, type DayPickerProps } from "./DayPicker";
import { chevronsRightIcon } from "./icons";
import { ViewToggle } from "./ViewToggle";

type RangeNavProps = {
  title: string;
  canGoBack: boolean;
  isNow: boolean;
  /** A rolling window that follows the clock: no paging, the title marks it live. */
  live?: boolean;
  /** When set, the title opens a day picker. */
  dayPicker?: DayPickerProps;
  onStep: (direction: number) => void;
  onToday: () => void;
};

/** Earlier / title / Later / Today paging, for toolbars that bring their own
 * leading controls. */
export function RangeNav({
  title,
  canGoBack,
  isNow,
  live = false,
  dayPicker,
  onStep,
  onToday,
}: RangeNavProps) {
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
          <button
            type="button"
            className="range-nav__today-icon"
            aria-label="Today"
            title="Today"
            disabled={isNow}
            onClick={onToday}
          >
            {chevronsRightIcon}
          </button>
        </>
      )}
    </div>
  );
}

export function RangeToolbar<T extends string>({
  label,
  mode,
  options,
  onMode,
  children,
  ...nav
}: RangeNavProps & {
  label: string;
  mode: T;
  options: readonly { key: T; label: string }[];
  onMode: (key: T) => void;
  /** Controls after the paging, e.g. Calendar's display choice. */
  children?: ReactNode;
}) {
  return (
    <div className="dash-toolbar">
      <ViewToggle
        value={mode}
        options={options}
        label={label}
        onChange={onMode}
      />
      <RangeNav {...nav} />
      {children}
    </div>
  );
}
