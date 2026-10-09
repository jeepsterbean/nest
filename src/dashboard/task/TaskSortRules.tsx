import { useEffect, useId, useRef, useState } from "react";
import { useDismiss } from "../hooks/useDismiss";
import { useListSort } from "../hooks/useListSort";
import { gripIcon } from "../components/icons";
import { moveItem } from "../../lib/reorder";
import { TASK_TABLE_COLUMNS } from "../lib/taskTable";
import { taskSortDirectionLabel, type TaskColumnSort } from "../lib/taskColumnSort";

function SortRulePill({ rule, edited, onRemove }: {
  rule: TaskColumnSort;
  edited: boolean;
  onRemove: () => void;
}) {
  const columnLabel = TASK_TABLE_COLUMNS.find(column => column.id === rule.column)!.label;
  const label = `Sort: ${columnLabel}, ${taskSortDirectionLabel(rule)}`;
  return <span className={`task-filter-pill${edited ? " is-edited" : ""}`} title={edited ? `${label} (unsaved)` : label}>
    <span className="task-filter-pill__icon" aria-hidden="true">{rule.direction === "ascending" ? "↑" : "↓"}</span>
    <span className="task-filter-pill__value">{columnLabel}</span>
    <button type="button" aria-label={`Remove ${label}`} onClick={onRemove}>×</button>
  </span>;
}

export function TaskSortRules({ rules, savedRules, onChange, edited }: {
  rules: TaskColumnSort[];
  savedRules: TaskColumnSort[];
  onChange: (rules: TaskColumnSort[]) => void;
  edited: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  const ruleIds = rules.map(rule => TASK_TABLE_COLUMNS.findIndex(column => column.id === rule.column) + 1);
  const { rowProps, draggingId, overId } = useListSort(`task-sort-${id}`, ruleIds,
    reorderedIds => onChange(reorderedIds.map(ruleId => rules[ruleIds.indexOf(ruleId)]!)),
    "button:not(.task-sort-rules__grip)");
  useEffect(() => {
    if (rules.length < 2) setOpen(false);
  }, [rules.length]);
  useDismiss(containerRef, open, reason => {
    setOpen(false);
    if (reason === "escape") triggerRef.current?.focus();
  });
  const ruleIsEdited = (rule: TaskColumnSort, index: number) =>
    savedRules[index]?.column !== rule.column || savedRules[index]?.direction !== rule.direction;
  if (rules.length === 1) {
    return <SortRulePill rule={rules[0]!} edited={ruleIsEdited(rules[0]!, 0)} onRemove={() => onChange([])} />;
  }
  if (rules.length === 0) return null;
  return <div ref={containerRef} className={`task-sort-rules task-filter-pill${edited ? " is-edited" : ""}`}>
    <button ref={triggerRef} type="button" className="task-sort-rules__trigger" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(value => !value)}>
      <span className="task-filter-pill__field">Sort:</span>{" "}
      <span className="task-filter-pill__value">{rules.length} rules</span>
    </button>
    {open && <div id={id} className="task-sort-rules__popover" role="group" aria-label="Sort rules in priority order">
      <ol>{rules.map((rule, index) => <li key={rule.column} {...rowProps(ruleIds[index]!)}
        className={`${draggingId === ruleIds[index] ? "is-dragging" : ""}${overId === ruleIds[index] ? " is-drag-over" : ""}`}>
        <button type="button" className="task-sort-rules__grip"
          aria-label={`Reorder ${TASK_TABLE_COLUMNS.find(column => column.id === rule.column)!.label} sort`}
          title="Drag to reorder; use arrow keys to move"
          onKeyDown={event => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            onChange(moveItem(rules, index, index + (event.key === "ArrowUp" ? -1 : 1)));
          }}>{gripIcon}</button>
        <SortRulePill rule={rule} edited={ruleIsEdited(rule, index)}
          onRemove={() => onChange(rules.filter(current => current.column !== rule.column))} />
      </li>)}</ol>
    </div>}
  </div>;
}
