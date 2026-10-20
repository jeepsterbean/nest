import { useEffect, useRef, useState } from "react";
import { deleteTask } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { trashIcon, xIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { formatDate, formatTime } from "../lib/time";
import { StatusTrigger } from "./StatusTrigger";
import { TaskUpdates } from "./TaskUpdates";
import { TaskDescription } from "./TaskDescription";
import { TaskRelations } from "./TaskRelations";
import { TaskScoreControls } from "./TaskScoreControls";
import { TaskTitle } from "./TaskTitle";
import { WorkedTime, WorkingBadge } from "./TaskWorkingControl";

export function TaskDetailPanel({
  task,
  onClose,
  modal = false,
  onCreateRelated,
  onOpenTask,
}: {
  task: Task;
  onClose: () => void;
  modal?: boolean;
  onOpenTask: (taskId: number) => void;
  onCreateRelated: (direction: "parent" | "child", origin: HTMLElement) => void;
}) {
  const { taskGraph, mutate } = useDashboardData();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // Move focus into the panel when it opens so keyboard users land on the
  // details they just requested; closing hands focus back to the origin card.
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const childCount = (taskGraph.childrenByParent.get(task.id) ?? []).length;

  const confirmDelete = () => {
    void mutate(() => deleteTask(task.id)).then((deleted) => {
      if (deleted) onClose();
    });
  };

  return (
    <aside
      ref={panelRef}
      className="task-detail"
      aria-label={`Details for ${task.title}`}
      aria-modal={modal || undefined}
      role={modal ? "dialog" : undefined}
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Escape" && confirmingDelete) {
          e.stopPropagation();
          setConfirmingDelete(false);
        }
      }}
    >
      <header className="task-detail__head">
        <div className="task-detail__state">
          <StatusTrigger task={task} />
          {task.workingNow && <WorkingBadge />}
        </div>
        <button
          type="button"
          className="task-detail__close"
          aria-label="Close details"
          title="Close details"
          onClick={onClose}
        >
          {xIcon}
        </button>
      </header>
      <TaskTitle task={task} />
      <div className="task-detail__fields">
        <TaskScoreControls task={task} />
      </div>
      <div className="task-detail__description"><TaskDescription task={task} /></div>
      <TaskRelations task={task} onCreateRelated={onCreateRelated} onOpenTask={onOpenTask} />
      <TaskUpdates key={task.id} task={task} />
      <footer className="task-detail__footer">
        <div className="task-detail__dates">
          <span>Created {formatDate(task.createdAt)}</span>
          <span className="task-detail__date-divider" aria-hidden="true" />
          <span>Updated {formatDate(task.updatedAt)}</span>
          {(task.workedSeconds > 0 || task.workingNow) && (
            <>
              <span className="task-detail__date-divider" aria-hidden="true" />
              {/* The readout's accessible name already says Worked time. */}
              <span><span aria-hidden="true">Worked </span><WorkedTime task={task} precision="minutes" /></span>
            </>
          )}
          {task.closedAt !== null && (
            <>
              <span className="task-detail__date-divider" aria-hidden="true" />
              <span>
                {task.status === "cancelled" ? "Cancelled" : "Completed"}{" "}
                {formatDate(task.closedAt)}, {formatTime(task.closedAt)}
              </span>
            </>
          )}
        </div>
        {confirmingDelete ? (
          <div className="task-detail__confirm">
            <p>
              Removes this task for good.
              {childCount > 0 &&
                ` Its ${
                  childCount === 1
                    ? "child task becomes"
                    : `${childCount} child tasks become`
                } top-level.`}
            </p>
            <div className="task-detail__confirm-actions">
              <button
                type="button"
                className="task-detail__confirm-delete"
                onClick={confirmDelete}
              >
                Delete
              </button>
              <button
                type="button"
                className="task-detail__confirm-cancel"
                autoFocus
                onClick={() => setConfirmingDelete(false)}
              >
                Keep
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="task-detail__delete"
            aria-label="Delete task"
            title="Delete task"
            onClick={() => setConfirmingDelete(true)}
          >
            {trashIcon}
          </button>
        )}
      </footer>
    </aside>
  );
}
