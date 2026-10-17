# Backend backlog

Track bugs, design flaws, and structural debt in the Rust/SQLite side and shared
app wiring that hurt maintainability, correctness, or future change.

This file is for engineering health — not user-facing features. Prefer short,
actionable items. When empty, there is no known backend work queued.

## History window

- Calendar and Timeline read only the 30-day history the dashboard
  loads, so their date picker and paging stop there, while Notes, Metrics,
  and Phases Day fetch older days on demand. Load older history on demand for
  both so every surface reaches the same days.
