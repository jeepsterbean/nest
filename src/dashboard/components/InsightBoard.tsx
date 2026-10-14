import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  INSIGHT_TASK_CHANGE_LABEL,
  type InsightBrainDumpSummary,
  type InsightTaskCount,
  type InsightPulseGroup,
} from "../lib/insights";
import { NestIcon } from "./PulseIcon";

/** Hide control for one Insights kind. Pressed while that kind is hidden.
 * Disabled on the last kind still shown, which stays visible. */
export function InsightHideButton({
  label,
  shown,
  disabled,
  onClick,
}: {
  label: string;
  shown: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="insight-list__hide"
      aria-pressed={!shown}
      aria-label={shown ? `Hide ${label}` : `Show ${label}`}
      title={disabled ? "At least one stays shown" : undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {shown ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
    </button>
  );
}

/** The title opens that kind's Section. The eye still hides or shows it. */
export function InsightHeading({
  label,
  icon,
  shown,
  alone,
  onToggle,
  onOpen,
}: {
  label: string;
  icon: string;
  shown: boolean;
  alone: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  return (
    <h3>
      <button type="button" className="insight-list__title" onClick={onOpen}>
        <NestIcon name={icon} />
        {label}
      </button>
      <InsightHideButton label={label} shown={shown} disabled={alone} onClick={onToggle} />
    </h3>
  );
}

export function InsightBrainDumps({
  summary,
  icon,
  shown,
  alone,
  onToggle,
  onOpen,
}: {
  summary: InsightBrainDumpSummary;
  icon: string;
  shown: boolean;
  alone: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const [showAllTags, setShowAllTags] = useState(false);
  const visibleTags = showAllTags ? summary.tags : summary.tags.slice(0, 3);

  return (
    <section className="insight-list insight-brain-dumps" aria-label="Brain dumps">
      <InsightHeading
        label="Brain dumps"
        icon={icon}
        shown={shown}
        alone={alone}
        onToggle={onToggle}
        onOpen={onOpen}
      />
      {shown ? (
        summary.count === 0 ? (
          <p className="insight-quiet">No brain dumps in this period.</p>
        ) : (
          <>
            <ul className="insight-brain-dumps__tags" aria-label="Tags">
              <li>
                <span className="insight-quiet">Untagged</span>
                <span className="insight-list__count">{summary.untaggedCount}</span>
              </li>
              {visibleTags.map((tag) => (
                <li key={tag.id}>
                  <span className="insight-brain-dumps__tag" title={tag.name}>{tag.name}</span>
                  <span className="insight-list__count">{tag.count}</span>
                </li>
              ))}
            </ul>
            {summary.tags.length > 3 ? (
              <button
                type="button"
                className="insight-brain-dumps__more"
                aria-expanded={showAllTags}
                onClick={() => setShowAllTags((value) => !value)}
              >
                {showAllTags ? "Show less" : "Show more"}
              </button>
            ) : null}
          </>
        )
      ) : null}
    </section>
  );
}

export function InsightLedger({ counts }: { counts: InsightTaskCount[] }) {
  return (
    <div className="insight-ledger">
      {counts.map(({ change, count }) => (
        <div className="insight-outcome__row" key={change}>
          <span className="insight-row__name">{INSIGHT_TASK_CHANGE_LABEL[change]}</span>
          <span className="insight-row__count">{count}</span>
        </div>
      ))}
    </div>
  );
}

export function InsightCheckIns({ groups }: { groups: InsightPulseGroup[] }) {
  return (
    <aside className="insight-pulses" aria-label="Metric check-ins">
      {groups.length === 0 ? (
        <p className="insight-quiet">No Metric check-ins</p>
      ) : (
        groups.map((group) => (
          <div className="insight-pulse__row" key={group.pulseId ?? "none"}>
            <span className="insight-row__name">{group.name}</span>
            <span className="insight-row__count">{group.checkInCount}</span>
          </div>
        ))
      )}
    </aside>
  );
}
