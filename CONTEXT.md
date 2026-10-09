# Nest Domain Context

Rules and terminology that affect decisions across features. Surface behavior
lives in the docs routed by [`AGENTS.md`](./AGENTS.md).

## Tasks and work

**Parent / Child** describes work breakdown. **Blocker / Dependent** determines
readiness. These relationships are independent: making a Task a Child does
not make it a Blocker. A Task has at most one Parent. Both relationship graphs
must be acyclic.

**Ready / Blocked** is derived for Tasks outside Completed and Cancelled:
Ready when all Blockers are completed, otherwise Blocked. Readiness is
separate from persisted status.

**Scope** categorizes Tasks by path, independently of Parent/Child hierarchy.

**Working now** is toggled independently on Active Tasks. Multiple Tasks may
be Working now. Leaving Active clears it; stopping work preserves Active.

**Work stretch** records one span of Working now. An open stretch has no end.
**Worked time** sums finished stretches and elapsed time in the open stretch,
across every day and status. Correcting a stretch updates the total; leaving
Working now on keeps it counting.

Task behavior: [`docs/tasks.md`](./docs/tasks.md).

## Phase

**Phase** describes attention independently of Task status. Its live values
are Doing, Scoping, Resting, and Offline. Derivation and work recording rules:
[Phases](./docs/phases.md).

## Metrics and capture

**Metric** is a 1–5 rating scored during a manual Metric check-in.
**Pulse** groups Metrics for scoring together. **Metric check-in** names the
saved ratings for one Pulse. Check-ins are manual and have no due state.
Use Metric check-in rather than Pulse check-in.

Brain dumps are independent of Tasks and Pulses and have no title field.
A **Tag** is a reusable label for brain dumps.

Behavior: [`docs/metrics.md`](./docs/metrics.md),
[`docs/brain-dump.md`](./docs/brain-dump.md).

## Surface names

- **Timer** names the countdown; **Popup** names the window it opens. Use
  these names in chrome, accessible names, and class names; reserve check-in
  for Metric scoring records.
- **Section** names Calendar or Core. Calendar contains Calendar and Timeline
  presentations, with Insights beside Calendar. Core contains Brain dump,
  Tasks, Metrics, and Phases panes.
- **Sidebar** switches Sections; **Map sidebar** lists unplaced Tasks.
- Day, Table, and Map are Tasks **layouts**. A **saved view** is a named Table
  query. Map placement creates no Task relationships.
- **Map** names the Tasks layout; **Note Board** names the brain dump board.
- **Timeline** lists history; **Logs** places it on Calendar beside Work stretch.
- A **pane** is a destination within Core or Metrics; a **panel** is a content
  surface such as Task details or Background.

Lowercase section can describe a general content region. Internal code may
retain older names such as `view`.

Surface behavior: [`UI.md`](./UI.md), [`docs/calendar.md`](./docs/calendar.md),
[`docs/timer.md`](./docs/timer.md), [`docs/popup.md`](./docs/popup.md).
