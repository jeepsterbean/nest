import { useId } from "react";
import { useListSort } from "../hooks/useListSort";
import { gripIcon, sortIcon } from "../components/icons";
import { moveItem } from "../../lib/reorder";
import { TASK_TABLE_COLUMNS, type TaskTableColumnId } from "../lib/taskTable";
import { taskSortDirectionLabel, type TaskColumnSort } from "../lib/taskColumnSort";
import { TaskQueryGroup } from "./TaskQueryGroup";
import { TaskQueryRuleMenu } from "./TaskQueryRuleMenu";
import { MENU_MIN_WIDTH, TaskSortDirectionOptions } from "./TaskTableHeaderMenu";

export function TaskSortRules({ rules, savedRules, onChange, openColumn, onOpenColumnChange }: {
  rules: TaskColumnSort[];
  savedRules: TaskColumnSort[];
  onChange: (rules: TaskColumnSort[]) => void;
  openColumn: TaskTableColumnId | null;
  onOpenColumnChange: (column: TaskTableColumnId | null) => void;
}) {
  const id = useId();
  const ruleIds = rules.map(rule => TASK_TABLE_COLUMNS.findIndex(column => column.id === rule.column) + 1);
  const { rowProps, draggingId, overId } = useListSort(`task-sort-${id}`, ruleIds,
    reorderedIds => onChange(reorderedIds.map(ruleId => rules[ruleIds.indexOf(ruleId)]!)),
    "button:not(.task-query-rule__grip)");
  return <TaskQueryGroup label="Sort rules in priority order" icon={sortIcon} title="Sort" count={rules.length} isEmpty={rules.length === 0}
    action={rules.length > 1 ? { label: "Clear", ariaLabel: "Clear sort", onClick: () => onChange([]) } : null}>
    <ol>{rules.map((rule, index) => {
      const columnLabel = TASK_TABLE_COLUMNS.find(column => column.id === rule.column)!.label;
      const label = `Sort: ${columnLabel}, ${taskSortDirectionLabel(rule)}`;
      const edited = savedRules[index]?.column !== rule.column || savedRules[index]?.direction !== rule.direction;
      return <li key={rule.column} {...rowProps(ruleIds[index]!)}
        className={`task-query-rule${edited ? " is-edited" : ""}${draggingId === ruleIds[index] ? " is-dragging" : ""}${overId === ruleIds[index] ? " is-drag-over" : ""}`}>
        {rules.length > 1 && <button type="button" className="task-query-rule__grip"
          aria-label={`Reorder ${columnLabel} sort`}
          title="Drag to reorder; use arrow keys to move"
          onKeyDown={event => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            onChange(moveItem(rules, index, index + (event.key === "ArrowUp" ? -1 : 1)));
          }}>{gripIcon}</button>}
        <TaskQueryRuleMenu name={columnLabel} value={`${rule.direction === "ascending" ? "↑" : "↓"} ${taskSortDirectionLabel(rule)}`}
          title={edited ? `${label} (unsaved)` : label} menuLabel={`Sort ${columnLabel}`} minWidth={MENU_MIN_WIDTH}
          open={openColumn === rule.column} onOpenChange={open => onOpenColumnChange(open ? rule.column : null)}>
          {close => <TaskSortDirectionOptions column={rule.column} sort={rules} onSortChange={onChange} onDone={close} />}
        </TaskQueryRuleMenu>
        <button type="button" className="task-query-rule__remove" aria-label={`Remove ${label}`}
          onClick={() => onChange(rules.filter(current => current.column !== rule.column))}>×</button>
      </li>;
    })}</ol>
  </TaskQueryGroup>;
}
