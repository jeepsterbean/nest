import type { Task } from "../../lib/types";
import type { TaskGraphProjection } from "../lib/taskGraph";
import { buildTaskDayForest, isInTaskDay, type TaskDayNode } from "../lib/taskDayTree";
import { formatTime } from "../lib/time";
import { StatusTrigger } from "./StatusTrigger";
import { WorkingBadge } from "./TaskWorkingControl";

function openChildCount(graph: TaskGraphProjection, task: Task) {
  const children = graph.childrenByParent.get(task.id) ?? [];
  const open = children.filter(child => child.status !== "completed" && child.status !== "cancelled").length;
  return { open, total: children.length };
}

function TaskDayRow({
  node,
  graph,
  selectedTaskId,
  onSelect,
}: {
  node: TaskDayNode;
  graph: TaskGraphProjection;
  selectedTaskId: number | null;
  onSelect: (id: number, origin?: HTMLElement) => void;
}) {
  const { task, reference, contextOnly, children } = node;
  const progress = openChildCount(graph, task);
  const closedToday = !contextOnly && (task.status === "completed" || task.status === "cancelled");
  const className = [
    "task-day__row",
    reference && "task-day__row--reference",
    contextOnly && "task-day__row--context",
    selectedTaskId === task.id && "task-day__row--selected",
  ].filter(Boolean).join(" ");
  return (
    <li className="task-day__item">
      <div className={className}>
        <StatusTrigger task={task} compact />
        <button
          type="button"
          className="task-day__title"
          title={task.title}
          onClick={e => onSelect(task.id, e.currentTarget)}
        >
          {task.title}
        </button>
        {task.workingNow && <WorkingBadge />}
        {reference && <span className="task-day__note">also shown above</span>}
        {!reference && progress.total > 0 && (
          <span className="task-day__note">{progress.open}/{progress.total} open</span>
        )}
        {closedToday && task.closedAt !== null && (
          <time className="task-day__note" dateTime={new Date(task.closedAt * 1000).toISOString()}>
            {formatTime(task.closedAt)}
          </time>
        )}
      </div>
      {children.length > 0 && (
        <ul className="task-day__children">
          {children.map(child => (
            <TaskDayRow key={child.task.id} node={child} graph={graph} selectedTaskId={selectedTaskId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Today's open and just-closed Tasks as a Parent → Child outline. */
export function TaskDayView({
  graph,
  nowMs,
  selectedTaskId,
  onSelect,
}: {
  graph: TaskGraphProjection;
  nowMs: number;
  selectedTaskId: number | null;
  onSelect: (id: number, origin?: HTMLElement) => void;
}) {
  const forest = buildTaskDayForest(graph, nowMs);
  if (forest.length === 0) {
    return <p className="task-day__empty">Nothing open and nothing closed today.</p>;
  }
  return (
    <ul className="task-day" aria-label="Tasks for today">
      {forest.map(node => (
        <TaskDayRow key={node.task.id} node={node} graph={graph} selectedTaskId={selectedTaskId} onSelect={onSelect} />
      ))}
    </ul>
  );
}

export const taskDayCounts = (tasks: Task[], nowMs: number) => {
  const day = tasks.filter(task => isInTaskDay(task, nowMs));
  const open = day.filter(task => task.status !== "completed" && task.status !== "cancelled").length;
  return { open, closed: day.length - open };
};
