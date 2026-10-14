import type { ReactNode } from "react";

/** One Tasks sidebar query group; every group keeps its bulk action in the same heading slot.
 * Groups stay listed while empty so Filters, Sort, and Hidden never shift position. */
export function TaskQueryGroup({ label, icon, title, count, action, isEmpty, children }: {
  label: string;
  icon: ReactNode;
  title: string;
  /** Rules in the group; left out for a group that is a control rather than a list. */
  count?: number;
  action?: { label: string; ariaLabel: string; onClick: () => void } | null;
  isEmpty: boolean;
  children: ReactNode;
}) {
  return <section className={`task-query__group${isEmpty ? " is-empty" : ""}`} aria-label={label}>
    <div className="task-query__head">
      <h3>{icon} {title}{count ? <span className="task-query__count">{count}</span> : null}</h3>
      {action && <button type="button" className="task-query__action" aria-label={action.ariaLabel}
        onClick={action.onClick}>{action.label}</button>}
    </div>
    {!isEmpty && children}
  </section>;
}
