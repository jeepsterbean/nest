import { setTaskScore, setTaskScoreField } from "../../lib/commands";
import type { RatingValue, Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import { parseRatingValue } from "../lib/tasks";
import { RatingDotScale } from "./RatingDotScale";

export function TaskScoreControls({
  task,
  score,
}: {
  task: Task;
  score?: "value" | "effort";
}) {
  const { mutate } = useDashboardData();

  const setScore = (value: RatingValue | null, effort: RatingValue | null) => {
    if (task.value === value && task.effort === effort) return;
    void mutate(() => setTaskScore(task.id, value, effort));
  };

  if (score !== undefined) {
    const current = task[score];
    const label = score === "value" ? "Value" : "Effort";
    const reset = (input: HTMLInputElement) => {
      input.value = current?.toString() ?? "";
    };
    const commit = (input: HTMLInputElement) => {
      const next = parseRatingValue(input.value);
      if (next === undefined) {
        reset(input);
        return;
      }
      if (current === next) return;
      void mutate(() => setTaskScoreField(task.id, score, next));
    };

    return (
      <input
        key={`${task.id}-${score}-${current ?? "empty"}`}
        className="task-score-input"
        type="number"
        min="1"
        max="5"
        step="1"
        defaultValue={current ?? ""}
        placeholder="—"
        aria-label={`${label} for ${task.title}`}
        title="Enter a number from 1 to 5"
        onFocus={(event) => event.currentTarget.select()}
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            reset(event.currentTarget);
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <div
      className="task-score"
      role="group"
      aria-label={`Priority scores for ${task.title}`}
    >
      <RatingDotScale
        kind="value"
        label="Value"
        ariaLabel={`Value for ${task.title}`}
        current={task.value}
        onChange={(next) => setScore(next, task.effort)}
      />
      <RatingDotScale
        kind="effort"
        label="Effort"
        ariaLabel={`Effort for ${task.title}`}
        current={task.effort}
        onChange={(next) => setScore(task.value, next)}
      />
    </div>
  );
}
