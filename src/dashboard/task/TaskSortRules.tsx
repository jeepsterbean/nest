import { useId } from "react";
import { useListSort } from "../hooks/useListSort";
import { gripIcon, sortIcon } from "../components/icons";
import { moveItem } from "../../lib/reorder";
import { TASK_TABLE_COLUMNS } from "../lib/taskTable";
import { taskSortDirectionLabel, type TaskColumnSort } from "../lib/taskColumnSort";

export function TaskSortRules({ rules, savedRules, onChange }: {
  rules: TaskColumnSort[];
  savedRules: TaskColumnSort[];
  onChange: (rules: TaskColumnSort[]) => void;
}) {
  const id = useId();
  const ruleIds = rules.map(rule => TASK_TABLE_COLUMNS.findIndex(column => column.id === rule.column) + 1);
  const { rowProps, draggingId, overId } = useListSort(`task-sort-${id}`, ruleIds,
    reorderedIds => onChange(reorderedIds.map(ruleId => rules[ruleIds.indexOf(ruleId)]!)),
    "button:not(.task-query-rule__grip)");
  if (rules.length === 0) return null;
  return <section className="task-query__group" aria-label="Sort rules in priority order">
    <h3>{sortIcon} Sort</h3>
    <ol>{rules.map((rule, index) => {
      const columnLabel = TASK_TABLE_COLUMNS.find(column => column.id === rule.column)!.label;
      const label = `Sort: ${columnLabel}, ${taskSortDirectionLabel(rule)}`;
      const edited = savedRules[index]?.column !== rule.column || savedRules[index]?.direction !== rule.direction;
      return <li key={rule.column} {...rowProps(ruleIds[index]!)} title={edited ? `${label} (unsaved)` : label}
        className={`task-query-rule${edited ? " is-edited" : ""}${draggingId === ruleIds[index] ? " is-dragging" : ""}${overId === ruleIds[index] ? " is-drag-over" : ""}`}>
        <span className="task-query-rule__field task-query-rule__field--sorted">{columnLabel}</span>
        <span className="task-query-rule__value task-query-rule__direction" aria-hidden="true">{rule.direction === "ascending" ? "↑" : "↓"}</span>
        <button type="button" className="task-query-rule__remove" aria-label={`Remove ${label}`}
          onClick={() => onChange(rules.filter(current => current.column !== rule.column))}>×</button>
        {rules.length > 1 && <button type="button" className="task-query-rule__grip"
          aria-label={`Reorder ${columnLabel} sort`}
          title="Drag to reorder; use arrow keys to move"
          onKeyDown={event => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            onChange(moveItem(rules, index, index + (event.key === "ArrowUp" ? -1 : 1)));
          }}>{gripIcon}</button>}
      </li>;
    })}</ol>
  </section>;
}
