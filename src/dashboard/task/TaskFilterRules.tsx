import type { ReactNode } from "react";

type FilterRule = {
  field: string;
  name: string;
  value: string;
  edited: boolean;
  remove: () => void;
};

export function TaskFilterRules({ rules, children }: { rules: FilterRule[]; children: ReactNode }) {
  return <section className="task-query__group" aria-label="Filters">
    <h3>Filters</h3>
    <ul>{children}{rules.map(rule => {
      const label = `${rule.name}: ${rule.value}`;
      return <li key={rule.field} className={`task-query-rule${rule.edited ? " is-edited" : ""}`} title={rule.edited ? `${label} (unsaved)` : label}>
        <span className="task-query-rule__field">{rule.name}</span>
        <span className="task-query-rule__value">{rule.value}</span>
        <button type="button" className="task-query-rule__remove" aria-label={`Remove ${label}`} onClick={rule.remove}>×</button>
      </li>;
    })}</ul>
  </section>;
}
