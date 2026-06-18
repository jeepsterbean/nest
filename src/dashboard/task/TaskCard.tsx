import type {
  MouseEventHandler,
  PointerEventHandler,
} from "react";
import type { Task } from "../../lib/types";
import { formatDate } from "../lib/time";
import { StatusTrigger } from "./StatusTrigger";
import { TaskDescription } from "./TaskDescription";
import { TaskScopeButton } from "./TaskScopeButton";
import { TaskScoreControls } from "./TaskScoreControls";
import { TaskTitle } from "./TaskTitle";

export function TaskCard({
  task,
  expanded,
  onToggleExpand,
  showStatus = true,
  draggable = false,
  dragging = false,
  onPointerDown,
  onClickCapture,
}: {
  task: Task;
  expanded: boolean;
  onToggleExpand: () => void;
  showStatus?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onPointerDown?: PointerEventHandler<HTMLLIElement>;
  onClickCapture?: MouseEventHandler<HTMLLIElement>;
}) {
  return (
    <li
      className={`task-card task-card--${task.status}${
        expanded ? " task-card--expanded" : ""
      }${draggable ? " task-card--draggable" : ""}${
        dragging ? " task-card--dragging" : ""
      }`}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      <div className="task-card__top">
        <div className="task-card__identity">
          {!expanded && <TaskScopeButton task={task} display="leaf" />}
          <TaskTitle task={task} />
        </div>
        <button
          type="button"
          className="task-card__expand"
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse task" : "Expand task"}
          title={expanded ? "Collapse" : "Expand"}
          onClick={onToggleExpand}
        >
          {expanded ? "▾" : "▸"}
        </button>
      </div>
      {expanded && (
        <div className="task-card__details">
          <TaskScopeButton task={task} display="path" />
          <TaskDescription task={task} />
        </div>
      )}
      <div className="task-card__controls">
        <div className="task-card__scores">
          <TaskScoreControls task={task} />
        </div>
        {showStatus && (
          <div className="task-card__meta">
            <StatusTrigger task={task} />
          </div>
        )}
      </div>
      {expanded && (
        <div className="task-card__footer">
          <time className="task-card__date">{formatDate(task.updatedAt)}</time>
        </div>
      )}
    </li>
  );
}
