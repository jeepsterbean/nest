import { METRIC_COLOR_PRESETS } from "../../lib/metricColors";

export function MetricColorPicker({
  value,
  label,
  onChange,
  embedded = false,
}: {
  value: string | null;
  label: string;
  onChange: (color: string | null) => void;
  embedded?: boolean;
}) {
  return (
    <div
      className={`metric-color-picker${embedded ? " metric-color-picker--embedded" : ""}`}
      role="group"
      aria-label={label}
    >
      <button
        type="button"
        className={`metric-color-picker__auto${value === null ? " is-selected" : ""}`}
        aria-pressed={value === null}
        onClick={() => onChange(null)}
      >
        Auto
      </button>
      <div className="metric-color-picker__grid">
        {METRIC_COLOR_PRESETS.map((color) => (
          <button
            type="button"
            key={color}
            className={`metric-color-picker__swatch${value === color ? " is-selected" : ""}`}
            aria-label={`Color ${color}`}
            aria-pressed={value === color}
            style={{ background: color }}
            onClick={() => onChange(color)}
          />
        ))}
      </div>
    </div>
  );
}
