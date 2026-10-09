# Backend backlog

Track bugs, design flaws, and structural debt in the Rust/SQLite side and shared
app wiring that hurt maintainability, correctness, or future change.

This file is for engineering health — not user-facing features. Prefer short,
actionable items. When empty, there is no known backend work queued.

## Calendar, Timeline, and Overview review

- [ ] Define and align Last hour refresh behavior across Calendar, Timeline,
  and Insights. Calendar and Timeline bounds follow the minute clock; Insights uses
  wall-clock ends for fresh dumps and Metric check-ins. Preserve prompt visibility
  of saved records and update `docs/calendar.md` and `docs/time-surfaces.md` to describe the chosen
  behavior consistently.
- [ ] Verify and resolve compact Overview sidebar prompt overlap at widths of
  860px or less. Save/Revert and switch confirmation are positioned relative to
  different layout rows; a tall confirmation on a preceding row may cover the
  selected row's controls.
- [ ] Assess Overview board usability at the default 900px window width. The
  expanded sidebar leaves roughly 596px for the board; at 860px the rail collapses
  and tiles stack. Adjust responsive behavior if controls clip or become difficult
  to use.

## Tasks table review

- [ ] Stop a saved view's missing Scope or Parent from reading as an unsaved
  change. Once Tasks load, `TasksView` clears that filter from the live query
  only, so the view shows Save and Revert on every load until it is saved;
  Revert restores the filter and it is cleared again. Leave the saved view
  untouched and treat a filter on a missing Scope or Parent as matching, so
  the filter applies again if that Scope or Parent returns. Update the
  saved-views paragraph in `docs/tasks.md`, which says Revert clears the mark.
