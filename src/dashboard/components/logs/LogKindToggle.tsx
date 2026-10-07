import type { MouseEvent } from "react";
import { Eye } from "lucide-react";
import {
  LOG_KINDS,
  soloLogKind,
  toggleLogKind,
  type LogKindKey,
} from "../../lib/logs";

/** Multi-select filter chips, each tinted like its kind's timeline marks.
 * Double click isolates a kind from whatever its first click left behind. */
export function LogKindToggle({
  kinds,
  label,
  onChange,
}: {
  kinds: LogKindKey[];
  label: string;
  onChange: (kinds: LogKindKey[]) => void;
}) {
  const onClick = (event: MouseEvent, key: LogKindKey) => {
    // The second click of a double click would only undo the first.
    if (event.detail > 1) return;
    onChange(toggleLogKind(kinds, key));
  };

  return (
    <div className="logs-kind-filter" role="group" aria-label={label}>
      {LOG_KINDS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`logs-kind-filter__chip logs-kind-filter__chip--${option.key}`}
          aria-pressed={kinds.includes(option.key)}
          onClick={(event) => onClick(event, option.key)}
          onDoubleClick={() => onChange(soloLogKind(kinds, option.key))}
        >
          <span className="logs-kind-filter__dot" aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Phases-only: swap settled rows for every checkpoint in the window. */
export function LogsRawToggle({
  active,
  onClick,
}: {
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`logs-raw-toggle${active ? " logs-raw-toggle--active" : ""}`}
      aria-pressed={active}
      aria-label="Every Phase checkpoint"
      title="Every Phase checkpoint"
      onClick={onClick}
    >
      <Eye aria-hidden="true" />
    </button>
  );
}
