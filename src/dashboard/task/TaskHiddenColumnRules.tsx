import { eyeOffIcon } from "../components/icons";
import type { TaskTableColumnId } from "../lib/taskTable";
import { TaskQueryGroup } from "./TaskQueryGroup";

export function TaskHiddenColumnRules({ columns, savedHiddenIds, onShow, onShowAll }: {
  columns: { id: TaskTableColumnId; label: string }[];
  savedHiddenIds: ReadonlySet<TaskTableColumnId>;
  onShow: (id: TaskTableColumnId) => void;
  onShowAll: () => void;
}) {
  return <TaskQueryGroup label="Hidden columns" icon={eyeOffIcon} title="Hidden" count={columns.length} isEmpty={columns.length === 0}
    action={columns.length > 1 ? { label: "Show all", ariaLabel: "Show all columns", onClick: onShowAll } : null}>
    <ul>{columns.map(column => {
      const edited = !savedHiddenIds.has(column.id);
      return <li key={column.id} className={`task-query-rule${edited ? " is-edited" : ""}`}
        title={edited ? `${column.label} hidden (unsaved)` : `${column.label} hidden`}>
        <span className="task-query-rule__field task-query-rule__field--fill">{column.label}</span>
        <button type="button" className="task-query-rule__remove" aria-label={`Show ${column.label} column`}
          onClick={() => onShow(column.id)}>×</button>
      </li>;
    })}</ul>
  </TaskQueryGroup>;
}
