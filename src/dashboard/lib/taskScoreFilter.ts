import type { RatingValue } from "../../lib/types";
import { RATING_VALUES } from "./tasks";

export type TaskScoreFilter =
  | { kind: "none" }
  | { kind: "scores"; scores: RatingValue[] }
  | null;

export const TASK_SCORE_PRESETS = [
  { key: "all", label: "All" },
  { key: "none", label: "None" },
] as const;

export type TaskScorePreset = (typeof TASK_SCORE_PRESETS)[number]["key"];

export const matchingTaskScorePreset = (filter: TaskScoreFilter): TaskScorePreset | null =>
  filter === null ? "all" : filter.kind === "none" ? "none" : null;

/** All shows every score ticked, like Status; None shows none. */
export const selectedTaskScores = (filter: TaskScoreFilter): RatingValue[] =>
  filter === null ? [...RATING_VALUES] : filter.kind === "none" ? [] : filter.scores;

export const toggleTaskScoreFilter = (
  filter: TaskScoreFilter,
  score: RatingValue,
): TaskScoreFilter => {
  const selected = selectedTaskScores(filter);
  const scores = selected.includes(score)
    ? selected.filter((item) => item !== score)
    : [...selected, score].sort((left, right) => left - right);
  return scores.length === 0 ? null : { kind: "scores", scores };
};

export const taskMatchesScoreFilter = (
  value: RatingValue | null,
  filter: TaskScoreFilter,
): boolean => {
  if (filter === null) return true;
  if (filter.kind === "none") return value === null;
  return value !== null && filter.scores.includes(value);
};

const scoreRuns = (scores: RatingValue[]) => {
  const runs: RatingValue[][] = [];
  for (const score of scores) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1]! + 1 === score) run.push(score);
    else runs.push([score]);
  }
  return runs;
};

/** Short enough for a toolbar pill: runs of three or more read as a range (`1–3`),
 *  and a set missing one interior score reads as what it leaves out (`≠ 3`). */
export const taskScoreFilterLabel = (filter: TaskScoreFilter): string | null => {
  if (filter === null) return null;
  if (filter.kind === "none") return "None";
  const runs = scoreRuns(filter.scores);
  if (runs.length > 1 && filter.scores.length === RATING_VALUES.length - 1) {
    return `≠ ${RATING_VALUES.find((score) => !filter.scores.includes(score))}`;
  }
  return runs
    .map((run) => (run.length >= 3 ? `${run[0]}–${run[run.length - 1]}` : run.join(", ")))
    .join(", ");
};

export const normalizeScoreFilter = (value: unknown): TaskScoreFilter => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.kind === "none") return { kind: "none" };
  if (record.kind !== "scores" || !Array.isArray(record.scores)) return null;
  const stored = record.scores;
  const scores = RATING_VALUES.filter((score) => stored.includes(score));
  return scores.length === 0 ? null : { kind: "scores", scores };
};

export const sameScoreFilter = (left: TaskScoreFilter, right: TaskScoreFilter) => {
  if (left === null || right === null) return left === right;
  if (left.kind !== right.kind) return false;
  if (left.kind === "none" || right.kind === "none") return true;
  return left.scores.length === right.scores.length && left.scores.every((score, index) => score === right.scores[index]);
};
