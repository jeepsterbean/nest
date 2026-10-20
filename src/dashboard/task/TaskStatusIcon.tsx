import type { TaskStatus } from "../../lib/types";

const CENTER = 8;
const RING_RADIUS = 6;
const HALF_FILL_RADIUS = 3;

function StatusGlyph({ status }: { status: TaskStatus }) {
  switch (status) {
    case "backlog":
      return (
        <circle
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="1.6 2.2"
          strokeLinecap="round"
        />
      );
    case "up_next":
      return (
        <circle cx={CENTER} cy={CENTER} r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="1.5" />
      );
    case "active":
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path
            d={`M${CENTER} ${CENTER - HALF_FILL_RADIUS}a${HALF_FILL_RADIUS} ${HALF_FILL_RADIUS} 0 0 1 0 ${HALF_FILL_RADIUS * 2}z`}
            fill="currentColor"
          />
        </>
      );
    case "completed":
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r="7" fill="currentColor" />
          <path d="M5 8.2l2 2 4-4.2" fill="none" stroke="var(--surface, #fff)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      );
    case "cancelled":
      return (
        <>
          <circle cx={CENTER} cy={CENTER} r="7" fill="currentColor" />
          <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" fill="none" stroke="var(--surface, #fff)" strokeWidth="1.5" strokeLinecap="round" />
        </>
      );
  }
}

export function TaskStatusIcon({ status }: { status: TaskStatus }) {
  return (
    <svg
      className={`task-status-icon task-status-icon--${status}`}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <StatusGlyph status={status} />
    </svg>
  );
}
