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
  focusLayout = false,
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
  focusLayout?: boolean;
  draggable?: boolean;
  dragging?: boolean;
  onPointerDown?: PointerEventHandler<HTMLLIElement>;
  onClickCapture?: MouseEventHandler<HTMLLIElement>;
}) {
  return (
    <li
      className={`task-card task-card--${task.status}${
        selected ? " task-card--selected" : ""
      }${focusLayout ? " task-card--focus" : ""}${
        draggable ? " task-card--draggable" : ""
      }${
        dragging ? " task-card--dragging" : ""
      }`}
      onPointerDown={onPointerDown}
      onClickCapture={onClickCapture}
    >
      <div
        className={`task-card__top${
          focusLayout ? " task-card__top--focus" : ""
        }`}
      >
        {focusLayout && task.status === "active" && (
          <TaskWorkingControl task={task} playPause />
        )}
        <div className="task-card__identity">
          {!focusLayout && <TaskScopeButton task={task} display="leaf" />}
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
        {focusLayout ? (
          <div className="task-card__top-actions">
            <TaskScopeButton task={task} display="leaf" />
            {showStatus && (
              <StatusTrigger task={task} compact={statusCompact} />
            )}
          </div>
        ) : (
          showStatus && <StatusTrigger task={task} compact={statusCompact} />
        )}
      </div>
      <TaskGraphBadges task={task} />
      <div className="task-card__controls">
        <div className="task-card__scores">
          <TaskScoreControls task={task} />
        </div>
        {!focusLayout && task.status === "active" && (
          <TaskWorkingControl task={task} />
        )}
      </div>
    </li>
  );
}
