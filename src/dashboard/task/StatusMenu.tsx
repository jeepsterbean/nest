import { TaskStatusIcon } from "./TaskStatusIcon";
import { pulseActivity } from "../../lib/activityPulse";
import { createFollowUpTask, setTaskStatus } from "../../lib/commands";
import { isTaskLocked } from "../../lib/taskLock";
import type { TaskStatus } from "../../lib/types";
import { checkIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { TASK_STATUS_LABEL, TASK_STATUSES } from "../lib/tasks";
import { formatDate } from "../lib/time";

// Fixed-position overlay rendered once at the dashboard root. Its open state and
// position come from TaskMenuContext; any task card or table row can trigger it.
export function StatusMenu() {
  const { tasks, mutate } = useDashboardData();
  const { statusMenu, closeStatusMenu } = useTaskMenus();
  if (!statusMenu) return null;
  const task = tasks.find((t) => t.id === statusMenu.taskId);
  if (!task) return null;
  // Asked when the menu opens, so a dashboard left open past midnight still
  // shows the lock.
  if (isTaskLocked(task, Date.now())) {
    return (
      <>
        <div className="task-status-backdrop" onClick={() => closeStatusMenu()} />
        <div
          className={`task-status-menu${
            statusMenu.up ? " task-status-menu--up" : ""
          }`}
          role="menu"
          aria-label={`Status for ${task.title}`}
          style={{ left: statusMenu.left, top: statusMenu.top }}
        >
          <p className="task-status-menu__locked">
            <TaskStatusIcon status={task.status} />
            <span>
              {TASK_STATUS_LABEL[task.status]}
              {task.closedAt !== null && ` ${formatDate(task.closedAt)}`}
            </span>
          </p>
          <button
            type="button"
            role="menuitem"
            autoFocus
            className="task-status-menu__option task-status-menu__option--action"
            onClick={() => {
              void mutate(() => createFollowUpTask(task));
              closeStatusMenu();
            }}
          >
            Create follow-up
          </button>
        </div>
      </>
    );
  }
  return (
    <>
      <div className="task-status-backdrop" onClick={() => closeStatusMenu()} />
      <div
        className={`task-status-menu${
          statusMenu.up ? " task-status-menu--up" : ""
        }`}
        role="listbox"
        aria-label={`Status for ${task.title}`}
        style={{ left: statusMenu.left, top: statusMenu.top }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
          e.preventDefault();
          const options = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>(
              "[role='option']",
            ),
          );
          const index = options.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const delta = e.key === "ArrowDown" ? 1 : -1;
          options[(index + delta + options.length) % options.length]?.focus();
        }}
      >
        {TASK_STATUSES.map((status) => {
          const selected = status === task.status;
          return (
            <button
              key={status}
              type="button"
              role="option"
              aria-selected={selected}
              autoFocus={selected}
              className={`task-status-menu__option${
                selected ? " is-selected" : ""
              }`}
              onClick={() => {
                if (status !== task.status) {
                  void mutate(() => setTaskStatus(task, status as TaskStatus));
                  if (status === "completed") pulseActivity();
                }
                closeStatusMenu();
              }}
            >
              <TaskStatusIcon status={status} />
              <span
                className={`task-status-menu__text task-status-menu__text--${status}`}
              >
                {TASK_STATUS_LABEL[status]}
              </span>
              {selected && (
                <span className="task-status-menu__check" aria-hidden="true">
                  {checkIcon}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
