import { METRIC_COLOR_PRESETS } from "../../lib/metricColors";

export function MetricColorPicker({
  value,
  label,
  onChange,
  embedded = false,
  emptyLabel = "Auto",
}: {
  value: string | null;
  label: string;
  onChange: (color: string | null) => void;
  embedded?: boolean;
  emptyLabel?: string;
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
        {emptyLabel}
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
      <label className="metric-color-picker__custom">
        <span>Custom</span>
        <input
          type="color"
          value={value?.length === 7 ? value : "#4a7dd1"}
          aria-label={`Custom ${label}`}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}
