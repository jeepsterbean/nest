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

**Work stretch**:
One recorded span of Working now on a Task, with a start and an end. The
current one is open: it has a start and no end yet. Stretches are kept, so
Calendar can show when work happened, and a mistimed one can be corrected or
deleted after the fact.
_Avoid_: Session, sitting, block

**Worked time**:
The total time a Task has been Working now, kept even after work stops. It is
the sum of the Task's finished Work stretches, so correcting a stretch moves
the total. It keeps counting if Working now is left on. The Working now control
shows the current stretch; the total is every stretch added up.
_Avoid_: Session, stopwatch, in progress

**Phase**:
A derived attention state, written as a checkpoint when it changes.
The four values are **Doing**, **Scoping**, **Resting**, and **Offline**.
Doing if any Task is Working now; else Offline if the Mac is locked,
display-asleep, or system-asleep; else Scoping if Nest is engaged
(dashboard has attention or check-in popup up) or Notion desktop is frontmost;
else Resting. Lock/sleep clears Working now (Worked time is banked; status
stays Active) and writes Offline even from Resting. Clicking another display
leaves dashboard attention even if the Nest window is still key. Overview
shows a lean last-hour summary: outcome stats (Completed, Value, Effort,
Check-ins) and duration totals for Doing, Scoping, Resting, and Offline
(Idle time is counted as Offline). A quiet hour still shows those figures as
0, not as missing. The right Overview panel is a brain dump composer that
matches the check-in popup (shared draft, Cmd/Ctrl+Enter to save). Dump
history lives in Journal. Insights is the longer look: the same stats and Phase
totals, and per-Task Worked time for the range. Calendar is the timetable of
that range — hours in a left gutter, one column per calendar day, each column a
Phase wash behind its Work stretches. Insights and Calendar share Day and Week
(Week starts Monday), anchored to real dates and paged with Earlier / Later /
Today rather than measured back from now; paging stops where the loaded 30 days
of history end. The last chosen range is remembered; first visit is Day. A
stretch carries its Task title and times inside the block when it is tall
enough; concurrent stretches sit side by side, since multiple Tasks may be
Working now. A line marks the current time. Quiet time reads as empty track
rather than being squeezed out. Clicking a stretch opens an editor beside that
stretch — left or right of the selected block, toward its outer edge when two
share the hour, flipping so the editor stays on screen and closing once its
stretch scrolls out of the grid. The Task title can be renamed there. Start and
end each have a date and a time, and save first, since only the times can be
refused. Dragging the stretch moves it; dragging a start or end edge resizes
that bound. Calendar drag snaps to fifteen minutes and will not shrink a stretch
below fifteen minutes unless now is closer (a stretch cannot end in the future).
That floor is only for dragging on the grid; a recorded stretch may already be
shorter. An open stretch's live end stays
pinned to now. Journal is history only: Raw (every Metric check-in,
brain dump, and Phase checkpoint), Brain dumps, Phases, and Metrics. Phases
has Raw and Aggregated modes — Aggregated applies the 60-second settle
collapse (a burst lands on the Phase it settled on; if that equals the Phase
before the burst, it is omitted). Journal does not show the day strip or
outcome stats. Events are grouped by day. Time sits to the left of the
timeline rail for every row. Metric check-ins show the Pulse icon and Metric
scores on one row. Brain dumps match that row height until expanded. Pulse,
Metric, and brain dump icons stand in for names. The Journal heading is
omitted; the view filters are the only chrome.
_Avoid_: Status, Working now, Scope

**Pulse**:
A named group of Metrics scored together during a check-in. The order of
Pulses, and of Metrics inside a Pulse, is the order they appear in the popup.
A Pulse can be hidden from the popup without deleting it.
_Avoid_: set, category, collection

**Metric**:
A 1–5 rating scored as part of a Metric check-in.

**Metric check-in**:
A recorded set of Metric ratings for one Pulse, saved when the last Metric
in that Pulse is finished in the check-in popup.
_Avoid_: Pulse check-in

**Brain dump**:
An unstructured captured thought stored on its own. Overview and the check-in
popup capture text only (shared draft, Cmd/Ctrl+Enter). Journal can still
attach an optional title to a saved dump.
_Avoid_: note, journal entry

## Relationships

- A **Task** has zero or one **Parent** and zero or more **Children**
- A **Task** has zero or more **Blockers** and zero or more **Dependents**
- A **Blocker** must be completed for its **Dependent** to become **Ready**
- A **Scope** categorizes zero or more **Tasks** but does not contain them
- Parent and Child relationships form a forest; Blocker and Dependent relationships form a DAG
- A **Task** has zero or more **Work stretches**
- A **Task** has **Worked time** that grows while it is **Working now**
- A **Pulse** contains zero or more **Metrics** in a user-defined order
- A **Metric check-in** records ratings for the Metrics in one Pulse
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
- "session" was the obvious word for one span of work — resolved: it reads as a sitting rather than a recorded span, and **Worked time** already avoids it. One span is a **Work stretch**, the word the Working now control already used.
- "scoping" can sound like **Scope** — resolved: Scope is a task path; Scoping is the Phase when Nest or Notion has attention and nothing is Working now.
- "Idle" can look like a live Phase — resolved: it is only a display label for a historical checkpoint with no Phase. Live values are Doing, Scoping, Resting, and Offline.
- "Offline" can sound like Nest quit — resolved: Offline is lock/sleep while Nest is running. Nest quit is untracked until the next launch.
- "Pulse check-in" sounds right because Metrics are scored inside a Pulse — resolved: the recorded event is a **Metric check-in**; Pulse only groups which Metrics are scored together.

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
- When the timer runs out, the Metric scoring panel holds a gold due treatment
  until a Metric check-in is saved. Restarting the clock or submitting a brain
  dump does not clear it.
- The check-in popup is two columns. Left: remaining time on a clock face
  (click to pick an interval) and the Active / Up next task list, sized for
  three rows with extra tasks scrolling. Right: brain dump above Metric scoring.
- The Metric scoring panel opens on the first Metric of the first visible Pulse.
  Metrics can hide a Pulse from the popup. A pulse toggle swaps among Pulses
  shown there; finishing the last Metric of a Pulse saves a Metric check-in and
  closes the popup.
- Opening the dashboard from the popup dismisses it.
- Manually summoned popups keep the live countdown and do not reset it when
  completed or dismissed.
