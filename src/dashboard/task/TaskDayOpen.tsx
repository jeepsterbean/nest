import type { OpenTaskGroup } from "../lib/taskDay";
import { TASK_STATUS_LABEL } from "../lib/tasks";
import { formatCompactDuration } from "../lib/time";
import { WorkingBadge } from "./TaskWorkingControl";

export function TaskDayOpen({
  groups,
  onSelectTask,
}: {
  groups: OpenTaskGroup[];
  onSelectTask: (id: number, origin?: HTMLElement) => void;
}) {
  const openCount = groups.reduce((total, group) => total + group.rows.length, 0);

  return (
    <section className="task-day-open" aria-label="Open Tasks">
      <h3>
        Open <span className="task-day-open__count">{openCount}</span>
      </h3>
      {openCount === 0 ? (
        <p className="task-day-open__empty">No open Tasks.</p>
      ) : (
        <div className="task-day-open__groups">
          {groups.map((group) => (
            <section
              key={group.status}
              className={`task-day-open__group${
                group.rows.length === 0 ? " is-empty" : ""
              }`}
              aria-label={`${TASK_STATUS_LABEL[group.status]} Tasks`}
            >
              <h4>
                <span
                  className={`status-dot status-dot--${group.status}`}
                  aria-hidden="true"
                />
                {TASK_STATUS_LABEL[group.status]}
                <span className="task-day-open__count">
                  {group.rows.length}
                </span>
              </h4>
              {group.rows.length > 0 && (
                <ul>
                  {group.rows.map(
                    ({ task, unresolvedBlockerCount, workedTodaySeconds }) => (
                      <li key={task.id}>
                        <button
                          type="button"
                          className={
                            unresolvedBlockerCount > 0 ? "is-blocked" : undefined
                          }
                          title="Open task details"
                          onClick={(event) =>
                            onSelectTask(task.id, event.currentTarget)
                          }
                        >
                          <span className="task-day-open__title">
                            <span>{task.title}</span>
                            {task.workingNow && <WorkingBadge />}
                          </span>
                          {unresolvedBlockerCount > 0 ? (
                            <span className="task-day-open__meta">
                              Blocked by {unresolvedBlockerCount}
                            </span>
                          ) : (
                            workedTodaySeconds > 0 && (
                              <span className="task-day-open__meta">
                                {formatCompactDuration(workedTodaySeconds)} today
                              </span>
                            )
                          )}
                        </button>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
