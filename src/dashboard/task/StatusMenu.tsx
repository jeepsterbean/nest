import { pulseActivity } from "../../lib/activityPulse";
import { setTaskStatus } from "../../lib/commands";
import type { TaskStatus } from "../../lib/types";
import { checkIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { TASK_STATUS_LABEL, TASK_STATUSES } from "../lib/tasks";

// Fixed-position overlay rendered once at the dashboard root. Its open state and
// position come from TaskMenuContext; any task card or table row can trigger it.
export function StatusMenu() {
  const { tasks, mutate } = useDashboardData();
  const { statusMenu, closeStatusMenu } = useTaskMenus();
  if (!statusMenu) return null;
  const task = tasks.find((t) => t.id === statusMenu.taskId);
  if (!task) return null;
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
                  void mutate(() => setTaskStatus(task.id, status as TaskStatus));
                  if (status === "completed") pulseActivity();
                }
                closeStatusMenu();
              }}
            >
              <span
                className={`status-dot status-dot--${status}`}
                aria-hidden="true"
              />
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
