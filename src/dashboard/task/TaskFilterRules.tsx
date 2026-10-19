import { filterIcon } from "../components/icons";
import { clearedTaskTableFilter, TASK_TABLE_FILTERS, taskTableFilterLabel } from "../lib/taskTableFilterRules";
import type { TaskTableFilterField, TaskTableQuery } from "../lib/taskTableViews";
import { TaskFilterFields, taskFilterMenuWidth, type TaskFilterContext } from "./TaskTableHeaderMenu";
import { TaskFilterAddMenu } from "./TaskFilterAddMenu";
import { TaskQueryGroup } from "./TaskQueryGroup";
import { TaskQueryRuleMenu } from "./TaskQueryRuleMenu";

export function TaskFilterRules({ query, onQueryChange, changedFields, context, nowMs, openField, onOpenFieldChange }: {
  query: TaskTableQuery;
  onQueryChange: (patch: Partial<TaskTableQuery>) => void;
  changedFields: ReadonlySet<string>;
  context: TaskFilterContext;
  nowMs: number;
  openField: TaskTableFilterField | null;
  onOpenFieldChange: (field: TaskTableFilterField | null) => void;
}) {
  const taskTitle = (id: number) => context.tasks.find(task => task.id === id)?.title;
  const rules = TASK_TABLE_FILTERS.map(filter => ({ ...filter, value: taskTableFilterLabel(filter.field, query, taskTitle, nowMs) }));
  const active = rules.filter(rule => rule.value !== null);
  // A filter keeps its row while its menu is open, so a filter just added from
  // the plus menu, or one cleared from its own menu, stays until the menu closes.
  const listed = rules.filter(rule => rule.value !== null || openField === rule.field);
  const addable = rules.filter(rule => !listed.includes(rule));
  const clearAll = () => onQueryChange(Object.assign({}, ...active.map(rule => clearedTaskTableFilter(rule.field))));
  return <TaskQueryGroup label="Filters" icon={filterIcon} title="Filters" count={active.length} isEmpty={listed.length === 0}
    action={active.length > 1 ? { label: "Clear", ariaLabel: "Clear filters", onClick: clearAll } : null}
    adder={<TaskFilterAddMenu options={addable} onPick={onOpenFieldChange} />}>
    <ul>{listed.map(rule => {
      const value = rule.value ?? rule.unsetLabel;
      const edited = changedFields.has(rule.field);
      const label = `${rule.name}: ${value}`;
      const clear = () => onQueryChange(clearedTaskTableFilter(rule.field));
      return <li key={rule.field} className={`task-query-rule${rule.value === null ? " is-unset" : ""}${edited ? " is-edited" : ""}`}>
        <TaskQueryRuleMenu name={rule.name} value={value} title={edited ? `${label} (unsaved)` : label}
          menuLabel={rule.name} minWidth={taskFilterMenuWidth(rule.field)}
          open={openField === rule.field} onOpenChange={open => onOpenFieldChange(open ? rule.field : null)}
          onReset={rule.value === null ? undefined : clear}>
          {close => <TaskFilterFields field={rule.field} query={query} onQueryChange={onQueryChange} context={context}
            onDone={close} />}
        </TaskQueryRuleMenu>
        {rule.value !== null && <button type="button" className="task-query-rule__remove" aria-label={`Remove ${label}`} onClick={clear}>×</button>}
      </li>;
    })}</ul>
  </TaskQueryGroup>;
}
