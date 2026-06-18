import { renameTask } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import { useInlineRename } from "../hooks/useInlineRename";

export function TaskTitle({ task }: { task: Task }) {
  const { mutate } = useDashboardData();
  const rename = useInlineRename({
    rename: renameTask,
    isUnchanged: (_id, next) => task.title === next,
    mutate,
  });
  return rename.editingId === task.id ? (
    <input
      type="text"
      className="rename-input"
      value={rename.draft}
      autoFocus
      onChange={(e) => rename.setDraft(e.target.value)}
      onBlur={rename.commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          rename.commit();
        }
        if (e.key === "Escape") rename.cancel();
      }}
    />
  ) : (
    <button
      type="button"
      className="task-title"
      onClick={() => rename.start(task.id, task.title)}
      title="Click to rename"
    >
      {task.title}
    </button>
  );
}
