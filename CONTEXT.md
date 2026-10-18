# Nest Domain Context

Rules and terminology that affect decisions across features. Surface behavior
lives in the docs routed by [`AGENTS.md`](AGENTS.md).

## Tasks and work

**Parent / Child** describes work breakdown.

A closed Task is **locked** once the local day it closed has ended; its status
is then fixed. A **Follow-up** is a new Task created from a locked one. It is a
record of origin, separate from Parent / Child.

An **outcome** is what a Task came to within a date range: Completed,
Cancelled, or Incomplete. It is derived from history and is never a persisted
status; Incomplete exists only as an outcome. Rules:
[History domain](docs/domain/history.md#range-summaries).

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

A **Note** is captured text, independent of Tasks and Pulses, with no title
field. The Section that holds them is **Notes**.
A **Tag** is a reusable label for notes.

Record rules: [Metrics domain](docs/domain/metrics.md),
[Notes domain](docs/domain/notes.md).
Surface behavior: [Metrics interface](docs/interface/metrics.md),
[Notes interface](docs/interface/notes.md).

## Surface names

- **Timer** names the countdown; **Popup** names the window it opens. Use
  these names in chrome, accessible names, and class names; reserve check-in
  for Metric scoring records.
- **Section** names Recap, Notes, Tasks, Metrics, or Phases. Recap
  contains Calendar and Timeline presentations, with Insights in the Section sidebar.
- **Sidebar** switches Sections; **Map sidebar** lists unplaced Tasks.
- **Settings** names the overlay the Sidebar opens for Background, Map, Work
  stretch, and Icons preferences.
- Table and Map are Tasks **layouts**. A **saved view** is a named Table
  query.
- **Map** names the Tasks layout; **Note Board** names the board that docks stickies.
- **Timeline** lists history; **Logs** places it on Calendar beside Work stretch.
- A **pane** is a destination within Metrics; a **panel** is a content
  surface such as Task details.

Lowercase section can describe a general content region. Internal code may
retain older names such as `view`.

Surface behavior: [`UI.md`](UI.md), [`docs/interface/calendar.md`](docs/interface/calendar.md),
[`docs/interface/timer.md`](docs/interface/timer.md), [`docs/interface/popup.md`](docs/interface/popup.md).
