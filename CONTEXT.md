# Nest Domain Context

Rules and terminology that affect decisions across features. Surface behavior
lives in the docs routed by [`AGENTS.md`](AGENTS.md).

## Tasks and work

**Parent / Child** describes work breakdown. **Blocker / Dependent** determines
readiness. The two relationships are independent.

**Ready / Blocked** is readiness derived for open Tasks; it is never a
persisted status.

**Scope** categorizes Tasks by path.

**Working now** marks an Active Task as being worked on. A **Work stretch**
records one span of Working now, and **Worked time** totals a Task's Work
stretches.

Task rules: [Tasks domain](docs/domain/tasks.md).
Dashboard interactions: [Tasks interface](docs/interface/tasks.md).

## Phase

**Phase** describes attention independently of Task status. Its live values
are Doing, Scoping, Resting, and Offline. Derivation and work recording rules:
[Phases](docs/domain/phases.md).

## Metrics and capture

**Metric** is a named measure rated from 1–5 during a manual Metric check-in.
A **rating** is the recorded score for one Metric.
**Pulse** groups Metrics for scoring together. **Metric check-in** names the
saved ratings for one Pulse. Check-ins are manual and have no due state.
Use Metric check-in rather than Pulse check-in.

Brain dumps are independent of Tasks and Pulses and have no title field.
A **Tag** is a reusable label for brain dumps.

Record rules: [Metrics domain](docs/domain/metrics.md),
[Brain dump domain](docs/domain/brain-dump.md).
Surface behavior: [Metrics interface](docs/interface/metrics.md),
[Brain dump interface](docs/interface/brain-dump.md).

## Surface names

- **Timer** names the countdown; **Popup** names the window it opens. Use
  these names in chrome, accessible names, and class names; reserve check-in
  for Metric scoring records.
- **Section** names Calendar or Core. Calendar contains Calendar and Timeline
  presentations, with Insights beside either. Core contains Brain dump,
  Tasks, Metrics, and Phases panes.
- **Sidebar** switches Sections; **Map sidebar** lists unplaced Tasks.
- **Settings** names the overlay the Sidebar opens for Background, Map, and
  Icons preferences.
- Day, Table, and Map are Tasks **layouts**. A **saved view** is a named Table
  query.
- **Map** names the Tasks layout; **Note Board** names the brain dump board.
- **Timeline** lists history; **Logs** places it on Calendar beside Work stretch.
- A **pane** is a destination within Core or Metrics; a **panel** is a content
  surface such as Task details.

Lowercase section can describe a general content region. Internal code may
retain older names such as `view`.

Surface behavior: [`UI.md`](UI.md), [`docs/interface/calendar.md`](docs/interface/calendar.md),
[`docs/interface/timer.md`](docs/interface/timer.md), [`docs/interface/popup.md`](docs/interface/popup.md).
