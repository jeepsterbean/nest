import { setTaskScore } from "../../lib/commands";
import type { RatingValue, Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import { RATING_VALUES } from "../lib/tasks";

export function TaskScoreControls({ task }: { task: Task }) {
  const { mutate } = useDashboardData();

  const setScore = (value: RatingValue | null, effort: RatingValue | null) => {
    if (task.value === value && task.effort === effort) return;
    void mutate(() => setTaskScore(task.id, value, effort));
  };

  const renderDotScale = (
    kind: "value" | "effort",
    label: string,
    current: RatingValue | null,
  ) => {
    const commit = (next: RatingValue | null) =>
      kind === "value" ? setScore(next, task.effort) : setScore(task.value, next);
    return (
      <div className={`task-dots task-dots--${kind}`}>
        <span className="task-dots__label">{label}</span>
        <div
          className="task-dots__track"
          role="radiogroup"
          aria-label={`${label} for ${task.title}`}
          onKeyDown={(e) => {
            const track = e.currentTarget;
            let next: RatingValue | null | undefined;
            if (e.key >= "1" && e.key <= "5") next = Number(e.key) as RatingValue;
            else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete")
              next = null;
            else if (e.key === "ArrowRight" || e.key === "ArrowUp")
              next = Math.min(5, (current ?? 0) + 1) as RatingValue;
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              const v = (current ?? 0) - 1;
              next = v <= 0 ? null : (v as RatingValue);
            } else return;
            e.preventDefault();
            commit(next);
            const focusValue = next ?? 1;
            requestAnimationFrame(() =>
              track
                .querySelector<HTMLButtonElement>(`[data-value="${focusValue}"]`)
                ?.focus(),
            );
          }}
        >
          {RATING_VALUES.map((n) => {
            const filled = current !== null && n <= current;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={current === n}
                data-value={n}
                tabIndex={current === n || (current === null && n === 1) ? 0 : -1}
                className={`task-dot${filled ? " task-dot--filled" : ""}`}
                title={
                  current === n
                    ? `${label} ${n} — click to clear`
                    : `Set ${label.toLowerCase()} to ${n}`
                }
                onClick={() => commit(current === n ? null : n)}
              >
                <span className="task-dot__pip" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className="task-score"
      role="group"
      aria-label={`Priority scores for ${task.title}`}
    >
      {renderDotScale("value", "Value", task.value)}
      {renderDotScale("effort", "Effort", task.effort)}
    </div>
  );
}
