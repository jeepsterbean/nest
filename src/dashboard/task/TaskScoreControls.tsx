import { setTaskScoreField } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { MenuSelect } from "../components/MenuSelect";
import { useDashboardData } from "../context/DashboardDataContext";
import { parseRatingValue } from "../lib/tasks";

const SCORE_OPTIONS = [
  { value: "", label: "None" },
  ...([1, 2, 3, 4, 5] as const).map((value) => ({
    value: String(value),
    label: String(value),
  })),
];

export function TaskScoreControls({
  task,
  score,
}: {
  task: Task;
  score?: "value" | "effort";
}) {
  const { mutate } = useDashboardData();

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
    <>
      {(["value", "effort"] as const).map((field) => {
        const label = field === "value" ? "Value" : "Effort";
        return (
          <div
            key={field}
            className="task-detail__field task-detail__field--score"
          >
            <span className="task-detail__label">{label}</span>
            <MenuSelect
              value={task[field]?.toString() ?? ""}
              options={SCORE_OPTIONS}
              placeholder="None"
              ariaLabel={`${label} for ${task.title}`}
              onChange={(value) => {
                const next = parseRatingValue(value);
                if (next === undefined || next === task[field]) return;
                void mutate(() => setTaskScoreField(task.id, field, next));
              }}
            />
          </div>
        );
      })}
    </>
  );
}
