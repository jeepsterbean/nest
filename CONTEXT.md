# Nest Domain Context

Nest is a private self-care workspace for checking in, organizing personal work,
and capturing thoughts without interrupting flow.

Documentation map: `AGENTS.md`. Surface behavior: `docs/tasks.md`,
`docs/calendar.md`, `docs/time-surfaces.md`, `docs/timer.md`,
`docs/popup.md`, `docs/brain-dump.md`, `docs/metrics.md`. Shared dashboard controls and
cross-surface UI rules: `UI.md`. Design feel: `.impeccable.md`.

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

**Scope**:
A user-defined path that categorizes Tasks independently of their hierarchy.
_Avoid_: Parent, project

**Working now**:
An independently toggled marker on an Active Task that shows it is currently
being worked on. Multiple Tasks may be Working now. Leaving Active clears it;
clearing it does not change status.
_Avoid_: Status, Ready, in progress

**Work stretch**:
One recorded span of Working now on a Task, with a start and an end. The
current one is open: it has a start and no end yet. Stretches are kept, so
Calendar can show when work happened, and a mistimed one can be corrected or
deleted after the fact.
_Avoid_: Session, sitting, block

**Worked time**:
The total time a Task has been Working now, kept even after work stops. It is
the sum of the Task's finished Work stretches plus the elapsed time in its open
stretch, so correcting a stretch moves the total. It keeps counting if Working
now is left on, and it stays on the Task in every status.
_Avoid_: Session, stopwatch, in progress

**Map**:
The other Tasks layout: a free-form canvas the user arranges by hand.
Behavior: [`docs/tasks.md`](./docs/tasks.md).
_Avoid_: Board (that word means the Note Board), Canvas, Kanban

**Map sidebar**:
The panel floating over the Map canvas.
Behavior: [`docs/tasks.md`](./docs/tasks.md).
_Avoid_: Sidebar (alone — that word means the Section switcher), tray, backlog

**Phase**:
A derived attention state, written as a checkpoint when it changes.
The four values are **Doing**, **Scoping**, **Resting**, and **Offline**.
Doing if any Task is Working now; else Offline if the Mac is locked,
display-asleep, or system-asleep; else Resting after three minutes with no
keyboard or pointer input, whatever has attention; else Scoping if Nest is
engaged (dashboard has attention or the popup is up) or Notion desktop or
Notion Calendar is frontmost; else Resting.
Lock/sleep clears Working now (Worked time is banked; status
stays Active) and writes Offline even from Resting. Quitting clears it the same
way, so time with Nest closed is never Worked time; if Nest dies without
quitting, the next launch ends the stretch where it was last known live. Clicking another display
leaves dashboard attention even if the Nest window is still key.
`src/dashboard/lib/phaseGuide.ts` mirrors this derivation for the Phases pane.
Calendar, Timeline, Insights, and the Phases pane:
[`docs/calendar.md`](./docs/calendar.md).
_Avoid_: Status, Working now, Scope

**Pulse**:
A named group of Metrics scored together during a Metric check-in.
_Avoid_: set, category, collection

**Metric**:
A 1–5 rating scored as part of a manual Metric check-in.
_Avoid_: mute, snooze

**Metric check-in**:
A recorded set of Metric ratings for one Pulse, saved when the last Metric
in that Pulse is finished. Metric check-ins are manual and have no schedule
or due state. Deleting history removes the saved record and its ratings.
_Avoid_: Pulse check-in

**Timer**:
The recurring countdown.
Behavior: [`docs/timer.md`](./docs/timer.md).
_Avoid_: Check-in, schedule

**Popup**:
The window the Timer, ⌘⇧E, or returning from a Resting idle stretch opens. It
is not a stored record.
Behavior: [`docs/popup.md`](./docs/popup.md).
_Avoid_: Check-in popup

**Brain dump**:
An unstructured captured thought stored on its own, with zero or more Tags.
Brain dumps have no title field.
Capture, stickies, and Note Board: [`docs/brain-dump.md`](./docs/brain-dump.md).
Editor internals: [`docs/editor.md`](./docs/editor.md).
_Avoid_: note, journal entry, title (brain dumps have no title field)

**Tag**:
A reusable label for brain dumps.
Composer and deletion: [`docs/brain-dump.md`](./docs/brain-dump.md).

**Section**:
One primary destination in the dashboard, chosen from the **Sidebar**. The two
are Calendar and Core, and the dashboard opens on Calendar. Timeline and
Insights are part of Calendar, not Sections of their own.
Shell: [`UI.md`](./UI.md).
_Avoid_: View, screen (for these two)

**Sidebar**:
The left strip that switches **Sections** (Calendar, Core).
_Avoid_: Nav, rail (for this strip)

**Core**:
The dashboard Section for Brain dump, Tasks, Metrics, and Phases.
_Avoid_: Hub, home (the dashboard opens on Calendar)

**Background**:
The ambient animation behind the dashboard and Popup while Phase is Doing.
It is a preference, not a Section.
_Avoid_: Wallpaper, theme

**Timeline**:
A Calendar presentation of Metric check-ins, brain dumps, Phase checkpoints,
and Task activity. Not a stored record: each stands on its own.
Behavior: [`docs/calendar.md`](./docs/calendar.md#timeline).
_Avoid_: Journal, Logs (Logs is a Calendar figure)

**Logs**:
Those same events on Calendar, beside **Work stretch**.
Behavior: [`docs/calendar.md`](./docs/calendar.md#calendar).
_Avoid_: using Logs as the name of the Timeline presentation

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
- **Timeline** lists Metric check-ins, brain dumps, Phase checkpoints, and Task activity; it does not contain them
- **Logs** places those events on Calendar; it does not contain them
- **Phase** is derived from Working now, whether Nest or Notion desktop currently has attention, how long the Mac has gone without input, and whether it is locked or asleep

## Example dialogue

> **Dev:** "If 'Run regression tests' is a Child of 'Prepare release', is it automatically a Blocker?"
> **Domain expert:** "No. The Parent describes the work breakdown. Add a Blocker only when one Task must finish before another can proceed."

> **Dev:** "If I leave Working now on overnight, should we subtract that from Worked time?"
> **Domain expert:** "No. Worked time is a piggy bank. It counts the whole time the marker is on. Lock or sleep clears the marker and records Offline, so overnight away time is not Doing."

> **Dev:** "Is the Timer part of every Section header?"
> **Domain expert:** "No. The menu bar shows Phase and the countdown. The **Popup** is where you change the interval. Section main content starts with its own controls; Core and Calendar name the Section in their secondary sidebar."

## Flagged ambiguities

- "dependency" can mean either side of a relationship — resolved: use **Blocker** for the prerequisite and **Dependent** for the constrained Task.
- "blocked" can sound like a persisted status — resolved: **Blocked** and **Ready** are derived from Blockers; they are not stored status values.
- "stopwatch" sounds like a timer that resets each play — resolved: the number is **Worked time**, a running total.
- "session" was the obvious word for one span of work — resolved: it reads as a sitting rather than a recorded span, and **Worked time** already avoids it. One span is a **Work stretch**, the word the Working now control already used.
- "scoping" can sound like **Scope** — resolved: Scope is a task path; Scoping is the Phase when Nest or Notion has attention and nothing is Working now.
- "Idle" can look like a live Phase — resolved: it is only a display label for a historical checkpoint with no Phase, and summaries count it as Offline. Live values are Doing, Scoping, Resting, and Offline. Going idle at the keyboard is a separate thing that carries no label of its own: after three minutes without input the derived Phase is **Resting**, never Idle.
- "Offline" can sound like Nest quit — resolved: Offline is lock/sleep while Nest is running. Nest quit is untracked until the next launch, though quitting still stops Working now.
- "check-in" for the clock or the window — resolved: the clock is the **Timer**;
  the window it opens is the **Popup**. A Metric check-in is a saved Pulse scoring.
  Timer/Popup aria, class names, and chrome never say check-in. The Popup clock
  shows the countdown and selected interval.
- "Pulse check-in" sounds right because Metrics are scored inside a Pulse — resolved: the recorded event is a **Metric check-in**; Pulse only groups which Metrics are scored together.
- "journal" was the history screen — resolved: that presentation is **Timeline**. A brain dump is not a journal entry. **Logs** is the event figure on Calendar, beside Work stretch.
- "view" for Calendar / Core — resolved: each is a **Section**. Calendar and Timeline are presentations inside Calendar; Insights is a summary beside the Calendar presentation. Brain dump, Tasks, Metrics, and Phases are panes of Core. Code may still say `view`; product language does not.
- "sidebar" — **Sidebar** is the Section switcher; the panel over the Map canvas is the **Map sidebar**. Tasks table scope filtering lives in the Scope column header.
- "view" — Day, Table, and Map are Tasks **layouts**; a **saved view** is a named Tasks table query (filters and sort). See [`docs/tasks.md`](./docs/tasks.md#saved-views).
- "section heading" / title above Section content — resolved: main content starts with its controls; the Sidebar names the place. Core and Calendar also have a title in their secondary sidebar. Each Section keeps its own top controls without a shared product name for that row.
- "panel" vs "pane" — resolved: keep both. **Panel** is a content surface (Task detail, popup Metric scoring, the Background panel). **Pane** is a destination inside Core or Metrics. Brain dump has one History surface.
- "section" lowercase — resolved: capitalized **Section** specifically names one of the two Sidebar destinations. Lowercase "section" is a general-purpose word and may also describe panes, presentations, panels, or layout regions when their precise subtype does not matter, including in user-facing copy, accessible names, CSS (`.dash-section__head`), `<section>` elements, and agent-facing docs.
