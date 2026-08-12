import type {
  MouseEventHandler,
  PointerEventHandler,
} from "react";
import type { Task } from "../../lib/types";
import { StatusTrigger } from "./StatusTrigger";
import { TaskScopeButton } from "./TaskScopeButton";
import { TaskScoreControls } from "./TaskScoreControls";
import { TaskTitle } from "./TaskTitle";
import { TaskGraphBadges } from "./TaskRelations";
import { TaskWorkingControl } from "./TaskWorkingControl";

export function TaskCard({
  task,
  selected = false,
  onSelect,
  showStatus = true,
  statusCompact = false,
  draggable = false,
  dragging = false,
  onPointerDown,
  onClickCapture,
}: {
  task: Task;
  selected?: boolean;
  // When provided, the title opens the detail panel; without it (overview)
  // the title keeps its inline-rename behavior.
  onSelect?: (origin: HTMLElement) => void;
  showStatus?: boolean;
  statusCompact?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onPointerDown?: PointerEventHandler<HTMLLIElement>;
  onClickCapture?: MouseEventHandler<HTMLLIElement>;
}) {
  return (
    <li
      className={`task-card task-card--${task.status}${
        selected ? " task-card--selected" : ""
      }${task.workingNow ? " task-card--working" : ""}${
        draggable ? " task-card--draggable" : ""
      }${
        dragging ? " task-card--dragging" : ""
      }`}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      <div className="task-card__top">
        <div className="task-card__identity">
          <TaskScopeButton task={task} display="leaf" />
          {onSelect ? (
            <button
              type="button"
              className="task-card__open"
              title="Open details"
              onClick={(e) => onSelect(e.currentTarget)}
            >
              {task.title}
            </button>
          ) : (
            <TaskTitle task={task} />
          )}
        </div>
        {showStatus && (
          <StatusTrigger task={task} compact={statusCompact} />
        )}
      </div>
      <TaskGraphBadges task={task} />
      <div className="task-card__controls">
        <div className="task-card__scores">
          <TaskScoreControls task={task} />
        </div>
        {task.status === "active" && <TaskWorkingControl task={task} />}
      </div>
    </li>
  );
}
