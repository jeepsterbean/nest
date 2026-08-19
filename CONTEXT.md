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
shows the current stretch; the total is every stretch added up. The total has
its own column in the Tasks table and sits in the detail panel, on every Task
whatever its status — unlike the control, which is only on Active Tasks.
_Avoid_: Session, stopwatch, in progress

**Phase**:
A derived attention state, written as a checkpoint when it changes.
The four values are **Doing**, **Scoping**, **Resting**, and **Offline**.
Doing if any Task is Working now; else Offline if the Mac is locked,
display-asleep, or system-asleep; else Scoping if Nest is engaged
(dashboard has attention or the popup is up) or Notion desktop is frontmost;
else Resting. Lock/sleep clears Working now (Worked time is banked; status
stays Active) and writes Offline even from Resting. Quitting clears it the same
way, so time with Nest closed is never Worked time; if Nest dies without
quitting, the next launch ends the stretch where it was last known live. Clicking another display
leaves dashboard attention even if the Nest window is still key. Overview
shows a lean last-hour summary: outcome stats (Completed, Value, Effort,
Check-ins) and duration totals for Doing, Scoping, Resting, and Offline
(Idle time is counted as Offline). A quiet hour still shows those figures as
0, not as missing. The right Overview panel is a brain dump composer that
matches the popup (shared draft, Cmd/Ctrl+Enter to save). Dump
history lives in Logs. Insights is the longer look: a Phase mix for the
range, Tasks with Worked time that day grouped by status as of that day's end
(Active, Up next, Backlog, Completed, Cancelled), plus Completions and
Cancellations with no Working now that day (0 Worked time). Metric check-ins
sit in a dedicated column grouped by Pulse — average plus a tick per rating —
even when the range has none. Outcome counts stay on Overview; Insights lists
the Tasks and scores instead of repeating Completed / Value / Effort /
Check-ins. Calendar is the timetable of
that range — hours in a left gutter, one column per calendar day, each column a
Phase wash behind its Work stretches. Insights and Calendar share Day and Week
(Week starts Monday), anchored to real dates and paged with Earlier / Later /
Today rather than measured back from now; paging stops where the loaded 30 days
of history end. The last chosen range is remembered; first visit is Day. A
stretch carries its Task title and times inside the block when it is tall
enough; concurrent stretches sit side by side, since multiple Tasks may be
Working now. A line marks the current time. Quiet time reads as empty track
rather than being squeezed out. An open stretch's live end stays pinned to now.
That stretch cannot be edited on Calendar — its bottom edge is an unfinished
line, and Working now is cleared from the Task, not from the grid. Clicking a
closed stretch opens an editor beside that stretch — left or right of the
selected block, toward its outer edge when two share the hour, flipping so the
editor stays on screen and closing once its stretch scrolls out of the grid. The
Task title can be renamed there. Start and end each have a date and a time, and
save first, since only the times can be refused. Dragging a closed stretch moves
it; dragging a start or end edge resizes that bound. Calendar drag snaps to
fifteen minutes and will not shrink a stretch below fifteen minutes unless now
is closer (a stretch cannot end in the future). That floor is only for dragging
on the grid; a recorded stretch may already be shorter.
_Avoid_: Status, Working now, Scope

**Pulse**:
A named group of Metrics scored together during a Metric check-in. The order of
Pulses, and of Metrics inside a Pulse, is the order they appear in the popup.
A Pulse can be hidden from the popup without deleting it.
_Avoid_: set, category, collection

**Metric**:
A 1–5 rating scored as part of a Metric check-in.

**Metric check-in**:
A recorded set of Metric ratings for one Pulse, saved when the last Metric
in that Pulse is finished in the popup.
_Avoid_: Pulse check-in

**Timer**:
The recurring countdown. The interval is 5–30 minutes. At zero it pauses and
opens the Popup. Picking an interval starts that cycle from now.
_Avoid_: Check-in, schedule

**Popup**:
The window the Timer (or ⌘⇧E) opens. It is for scoring Metrics and capturing
a brain dump, not a stored record.
_Avoid_: Check-in popup

**Brain dump**:
An unstructured captured thought stored on its own. Overview and the popup
capture text only (shared draft, Cmd/Ctrl+Enter). Logs can still
attach an optional title to a saved dump.
_Avoid_: note, journal entry

**Logs**:
The history screen. Not a stored record: Metric check-ins, brain dumps, and
Phase checkpoints each stand on their own. Raw shows every one of those;
Brain dumps, Phases, and Metrics filter to one kind. Phases has Raw and
Aggregated modes — Aggregated applies the 60-second settle collapse (a burst
lands on the Phase it settled on; if that equals the Phase before the burst,
it is omitted). Logs does not show the day strip or outcome stats. Events
are grouped by day. Time sits to the left of the timeline rail for every
row. Metric check-ins show the Pulse icon and Metric scores on one row.
Brain dumps match that row height until expanded. Pulse, Metric, and brain
dump icons stand in for names. The Logs heading is omitted; the view
filters are the only chrome.
_Avoid_: Journal

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
- **Logs** shows Metric check-ins, brain dumps, and Phase checkpoints; it does not contain them
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
- "Offline" can sound like Nest quit — resolved: Offline is lock/sleep while Nest is running. Nest quit is untracked until the next launch, though quitting still stops Working now.
- "check-in" for the clock or the window — resolved: the clock is the **Timer**;
  the window it opens is the **Popup**. A Metric check-in is a saved Pulse scoring.
  Timer/Popup aria, class names, and chrome never say check-in. The dashboard
  header due phrase "time to check in!" is the exception. The Popup clock shows
  the countdown only.
- "Pulse check-in" sounds right because Metrics are scored inside a Pulse — resolved: the recorded event is a **Metric check-in**; Pulse only groups which Metrics are scored together.
- "journal" was the history screen — resolved: that screen is **Logs**. A brain dump is not a journal entry.

## Timer

- The dashboard header shows the countdown and controls its 5–30 minute interval.
  When due it shows "time to check in!"; the Popup clock stays on the countdown.
- At zero, the timer pauses, plays the system alert sound, and opens the
  popup. It stays at `0:00` until a new interval is picked or the
  popup is resolved.
- Picking an interval on the clock starts that cycle immediately, including
  when the timer is due.
- Completing an automatic popup starts the current interval if the timer is
  still paused. Dismissing it starts a five-minute interval if the timer is
  still paused.
- When the timer runs out, the Metric scoring panel holds a gold due treatment
  until a Metric check-in is saved. Restarting the clock or submitting a brain
  dump does not clear it.
- The popup is two columns. Left: remaining time on a clock face
  (click to pick an interval) and the Active / Up next task list, sized for
  three rows with extra tasks scrolling. Right: brain dump above Metric scoring.
- The Metric scoring panel opens on the first Metric of the first visible Pulse.
  Metrics can hide a Pulse from the popup. A pulse toggle swaps among Pulses
  shown there; finishing the last Metric of a Pulse saves a Metric check-in and
  closes the popup.
- Opening the dashboard from the popup dismisses it.
- Manually shown popups keep the live countdown and do not reset it when
  completed or dismissed.
