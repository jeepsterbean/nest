import type { RatingValue } from "../../lib/types";
import { RATING_VALUES } from "../lib/tasks";

export function RatingDotScale({
  kind,
  label,
  ariaLabel,
  current,
  onChange,
}: {
  kind: "value" | "effort";
  label: string;
  ariaLabel: string;
  current: RatingValue | null;
  onChange: (next: RatingValue | null) => void;
}) {
  return (
    <div className={`task-dots task-dots--${kind}`}>
      <span className="task-dots__label">{label}</span>
      <div
        className="task-dots__track"
        role="radiogroup"
        aria-label={ariaLabel}
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
          onChange(next);
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
              aria-label={`${n} out of 5`}
              aria-checked={current === n}
              data-value={n}
              tabIndex={current === n || (current === null && n === 1) ? 0 : -1}
              className={`task-dot${filled ? " task-dot--filled" : ""}`}
              title={
                current === n
                  ? `${label} ${n} — click to clear`
                  : `Set ${label.toLowerCase()} to ${n}`
              }
              onClick={() => onChange(current === n ? null : n)}
            >
              <span className="task-dot__pip" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
