import { ViewToggle } from "./ViewToggle";

export function RangeToolbar<T extends string>({
  label,
  mode,
  options,
  title,
  canGoBack,
  isNow,
  paging = true,
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
  paging?: boolean;
  onMode: (key: T) => void;
  onStep: (direction: number) => void;
  onToday: () => void;
}) {
  return (
    <div className="dash-toolbar">
      <ViewToggle
        value={mode}
        options={options}
        label={label}
        onChange={onMode}
      />
      {paging ? (
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
      ) : null}
    </div>
  );
}
