# Nest Domain Context

Nest is a private self-care workspace for checking in, organizing personal work,
and capturing thoughts without interrupting flow.

## Language

**Task**:
A discrete piece of personal work that can be organized, scored, and moved through a status.
The persisted statuses are backlog, up next, active, completed, and cancelled.
_Avoid_: Todo, item

**Parent**:
The single Task that contains a smaller Task as part of its breakdown.
_Avoid_: Owner, predecessor

**Child**:
A Task contained by a Parent as part of the Parent's breakdown.
_Avoid_: Subitem, dependency

**Blocker**:
A Task that must be completed before another Task is Ready.
_Avoid_: Parent, prerequisite item

**Dependent**:
A Task whose readiness is constrained by one or more Blockers.
_Avoid_: Child, successor item

**Ready**:
A non-terminal Task whose Blockers are all completed.
_Avoid_: Active, unblocked status

**Blocked**:
A non-terminal Task with at least one Blocker that is not completed.
_Avoid_: Paused

**Scope**:
A user-defined path that categorizes Tasks independently of their hierarchy.
_Avoid_: Parent, project

**Working now**:
An independently toggled marker on an Active Task that shows it is currently
being worked on. Multiple Tasks may be Working now. Leaving Active clears it;
clearing it does not change status.
_Avoid_: Status, Ready, in progress, paused

**Worked time**:
The total time a Task has been Working now, kept even after work stops.
It keeps counting if Working now is left on. The Working now control shows
the current stretch; the total is the piggy bank.
_Avoid_: Session, stopwatch, in progress

**Phase**:
A derived attention state, written as a checkpoint when it changes.
The four values are **Doing**, **Scoping**, **Resting**, and **Offline**.
Doing if any Task is Working now; else Offline if the Mac is locked,
display-asleep, or system-asleep; else Scoping if Nest is engaged
(dashboard has attention or check-in popup up) or Notion desktop is frontmost;
else Resting. Lock/sleep clears Working now (Worked time is banked; status
stays Active) and writes Offline even from Resting. Clicking another display
leaves dashboard attention even if the Nest window is still key. The Journal
shows Phase as a day strip of settled sessions, not a checkpoint list.
Checkpoints that change more than once within 60 seconds collapse to the
Phase they landed on; if that equals the Phase before the burst, they are
omitted. Leading and trailing Resting, Offline, and Idle are trimmed from
each day's strip. Journal defaults to Daily: today only, with arrows to move
one calendar day at a time inside the last 30 days. Raw lists every recorded
Pulse check-in, brain dump, and Phase checkpoint in the window, grouped by
day, with no 60-second collapse and no session strip. Time sits to the left
of the timeline rail for every row. Pulse check-ins show the Pulse icon and
Metric scores on one row. Brain dumps match that row height until expanded.
Pulse, Metric, and brain dump icons stand in for names. The Journal heading
is omitted; Daily and Raw are the only chrome.
_Avoid_: Status, Working now, Scope

**Pulse**:
A named group of Metrics scored together during a check-in. The order of
Pulses, and of Metrics inside a Pulse, is the order they appear in the popup.
A Pulse can be hidden from the popup without deleting it.
_Avoid_: set, category, collection

**Metric**:
A 1–5 rating scored as part of a Pulse check-in.

**Brain dump**:
An unstructured captured thought, with an optional title, stored on its own.
_Avoid_: note, journal entry

## Relationships

- A **Task** has zero or one **Parent** and zero or more **Children**
- A **Task** has zero or more **Blockers** and zero or more **Dependents**
- A **Blocker** must be completed for its **Dependent** to become **Ready**
- A **Scope** categorizes zero or more **Tasks** but does not contain them
- Parent and Child relationships form a forest; Blocker and Dependent relationships form a DAG
- A **Task** has **Worked time** that grows while it is **Working now**
- A **Pulse** contains zero or more **Metrics** in a user-defined order
- A **Task** may have optional 1–5 value and effort scores
- A **Brain dump** is independent of Tasks and Pulses
- **Phase** is derived from Working now, whether Nest or Notion desktop currently has attention, and whether the Mac is locked or asleep

## Example dialogue

> **Dev:** "If 'Run regression tests' is a Child of 'Prepare release', is it automatically a Blocker?"
> **Domain expert:** "No. The Parent describes the work breakdown. Add a Blocker only when one Task must finish before another can proceed."

> **Dev:** "If I leave Working now on overnight, should we subtract that from Worked time?"
> **Domain expert:** "No. Worked time is a piggy bank. It counts the whole time the marker is on. Lock or sleep clears the marker and records Offline, so overnight away time is not Doing."

## Flagged ambiguities

- "dependency" can mean either side of a relationship — resolved: use **Blocker** for the prerequisite and **Dependent** for the constrained Task.
- "blocked" can sound like a persisted status — resolved: **Blocked** and **Ready** are derived from Blockers; they are not stored status values.
- "paused" was used as a stored Task status — resolved: stopping work means clearing **Working now** while remaining Active. `paused` is not a selectable status.
- "stopwatch" sounds like a timer that resets each play — resolved: the number is **Worked time**, a running total.
- "scoping" can sound like **Scope** — resolved: Scope is a task path; Scoping is the Phase when Nest or Notion has attention and nothing is Working now.
- "Idle" can look like a live Phase — resolved: it is only a display label for a historical checkpoint with no Phase. Live values are Doing, Scoping, Resting, and Offline.
- "Offline" can sound like Nest quit — resolved: Offline is lock/sleep while Nest is running. Nest quit is untracked until the next launch.

## Check-in cadence

- The dashboard header shows the countdown and controls its 5–30 minute interval.
- At zero, the timer pauses, plays the system alert sound, and opens the
  check-in popup. It stays at `0:00` until a new interval is picked or the
  popup is resolved.
- Picking an interval on the clock starts that cycle immediately, including
  when a check-in is due.
- Completing an automatic popup starts the current interval if the timer is
  still paused. Dismissing it starts a five-minute interval if the timer is
  still paused.
- When the timer runs out, the Pulse panel holds a gold due treatment until a
  Pulse is saved. Restarting the clock or submitting a brain dump does not
  clear it.
- The check-in popup is two columns. Left: remaining time on a clock face
  (click to pick an interval) and the Active / Up next task list, sized for
  three rows with extra tasks scrolling. Right: brain dump above Pulse scoring.
- The Pulse panel opens on the first Metric of the first visible Pulse.
  Metrics can hide a Pulse from the popup. A pulse toggle swaps among Pulses
  shown there; finishing the last Metric of a Pulse saves that Pulse and
  closes the popup.
- Opening the dashboard from the popup dismisses it.
- Manually summoned popups keep the live countdown and do not reset it when
  completed or dismissed.
