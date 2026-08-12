import { useEffect, useRef, useState } from "react";
import { deleteTask } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { xIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { formatDate } from "../lib/time";
import { StatusTrigger } from "./StatusTrigger";
import { TaskDescription } from "./TaskDescription";
import { TaskRelations } from "./TaskRelations";
import { TaskScopeButton } from "./TaskScopeButton";
import { TaskScoreControls } from "./TaskScoreControls";
import { TaskTitle } from "./TaskTitle";
import { TaskWorkingControl } from "./TaskWorkingControl";

export function TaskDetailPanel({
  task,
  onClose,
}: {
  task: Task;
  onClose: () => void;
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
          {task.status === "active" && <TaskWorkingControl task={task} />}
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
      <div className="task-detail__scope">
        <TaskScopeButton task={task} display="path" />
      </div>
      <TaskDescription task={task} />
      <div className="task-detail__scores">
        <TaskScoreControls task={task} />
      </div>
      <TaskRelations task={task} />
      <footer className="task-detail__footer">
        <div className="task-detail__dates">
          <span>Created {formatDate(task.createdAt)}</span>
          <span>Updated {formatDate(task.updatedAt)}</span>
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
            onClick={() => setConfirmingDelete(true)}
          >
            Delete task
          </button>
        )}
      </footer>
    </aside>
  );
}
