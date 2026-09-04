/** Shared segmented control. One size — see ui-standards UI implementation. */
export function ViewToggle<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T | null;
  options: readonly { key: T; label: string; aria?: string }[];
  label: string;
  onChange: (key: T) => void;
}) {
  return (
    <div className="view-toggle" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={
            value === option.key
              ? "view-toggle__btn view-toggle__btn--active"
              : "view-toggle__btn"
          }
          aria-label={option.aria}
          aria-pressed={value === option.key}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
