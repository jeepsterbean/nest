import type { BrainDump } from "../../lib/types";
import { formatDateTime } from "../lib/time";

// A collapsible brain-dump card. `className` is the literal CSS prefix used to
// build every child class, so it must stay one of the known variants. Shared by
// the Overview (overview-dump) and Journal (event-dump) views.
export function BrainDumpEntry({
  dump,
  className,
  expanded,
  onToggle,
}: {
  dump: BrainDump;
  className: "overview-dump" | "event-dump";
  expanded: boolean;
  onToggle: () => void;
}) {
  const title = dump.title?.trim() || formatDateTime(dump.createdAt);
  return (
    <div className={className}>
      <button
        type="button"
        className={`${className}__toggle`}
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className={`${className}__chevron`} aria-hidden="true">
          {expanded ? "▾" : "▸"}
        </span>
        <span className={`${className}__title`}>{title}</span>
        {dump.title?.trim() ? (
          <time className={`${className}__time`}>
            {formatDateTime(dump.createdAt)}
          </time>
        ) : null}
      </button>
      {expanded && <p className={`${className}__text`}>{dump.text}</p>}
    </div>
  );
}
