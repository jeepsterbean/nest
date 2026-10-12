import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  INSIGHT_OUTCOME_LABEL,
  type InsightBrainDumpSummary,
  type InsightOutcomeGroup,
  type InsightPulseGroup,
} from "../lib/insights";

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

export function InsightBrainDumps({
  summary,
  shown,
  alone,
  onToggle,
}: {
  summary: InsightBrainDumpSummary;
  shown: boolean;
  alone: boolean;
  onToggle: () => void;
}) {
  const [showAllTags, setShowAllTags] = useState(false);
  const visibleTags = showAllTags ? summary.tags : summary.tags.slice(0, 3);

  return (
    <section className="insight-list insight-brain-dumps" aria-label="Brain dumps">
      <h3>
        Brain dumps
        <span className="insight-list__count">{summary.count}</span>
        <InsightHideButton
          label="Brain dumps"
          shown={shown}
          disabled={alone}
          onClick={onToggle}
        />
      </h3>
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

/** Outcome counts and Worked time stay visible together. */
export function InsightLedger({
  groups,
  onOpenTasks,
}: {
  groups: InsightOutcomeGroup[];
  onOpenTasks: () => void;
}) {
  return (
    <div className="insight-ledger">
      {groups.map((group) => (
        <div className="insight-outcome__row" key={group.outcome}>
          <button type="button" className="insight-title-link" onClick={onOpenTasks}>
            {INSIGHT_OUTCOME_LABEL[group.outcome]}
          </button>
          <span className="insight-row__count">{group.rows.length}</span>
        </div>
      ))}
    </div>
  );
}

export function InsightCheckIns({
  groups,
  onOpenMetrics,
}: {
  groups: InsightPulseGroup[];
  onOpenMetrics: () => void;
}) {
  return (
    <aside className="insight-pulses" aria-label="Metric check-ins">
      {groups.length === 0 ? (
        <p className="insight-quiet">No Metric check-ins</p>
      ) : (
        groups.map((group) => (
          <div className="insight-pulse__row" key={group.pulseId ?? "none"}>
            <button type="button" className="insight-title-link" onClick={onOpenMetrics}>
              {group.name}
            </button>
            <span className="insight-row__count">{group.checkInCount}</span>
          </div>
        ))
      )}
    </aside>
  );
}
