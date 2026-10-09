import { useEffect, useId, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";

type FilterRule = {
  field: string;
  name: string;
  value: string;
  edited: boolean;
  remove: () => void;
};

function FilterRulePill({ rule }: { rule: FilterRule }) {
  const label = `${rule.name}: ${rule.value}`;
  return <span className={`task-filter-pill${rule.edited ? " is-edited" : ""}`} title={rule.edited ? `${label} (unsaved)` : label}>
    <span className="task-filter-pill__field">{rule.name}</span>
    <span className="task-filter-pill__value">{rule.value}</span>
    <button type="button" aria-label={`Remove ${label}`} onClick={rule.remove}>×</button>
  </span>;
}

export function TaskFilterRules({ rules }: { rules: FilterRule[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (rules.length < 2) setOpen(false);
  }, [rules.length]);
  useDismiss(containerRef, open, reason => {
    setOpen(false);
    if (reason === "escape") triggerRef.current?.focus();
  });
  if (rules.length === 0) return null;
  if (rules.length === 1) return <FilterRulePill rule={rules[0]!} />;
  return <div ref={containerRef} className={`task-filter-rules task-filter-pill${rules.some(rule => rule.edited) ? " is-edited" : ""}`}>
    <button ref={triggerRef} type="button" className="task-filter-rules__trigger" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}>
      <span className="task-filter-pill__field">Filter:</span>{" "}
      <span className="task-filter-pill__value">{rules.length} rules</span>
    </button>
    {open && <div id={id} className="task-filter-rules__popover" role="group" aria-label="Filter rules">
      <ul>{rules.map(rule => <li key={rule.field}><FilterRulePill rule={rule} /></li>)}</ul>
    </div>}
  </div>;
}
