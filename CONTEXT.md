# Nest Domain Context

Nest is a private self-care workspace for checking in, organizing personal work,
and capturing thoughts without interrupting flow.

Documentation map: `AGENTS.md`. Surface behavior: `docs/tasks.md`,
`docs/time-surfaces.md`, `docs/timer-popup.md`, `docs/brain-dump.md`,
`docs/assistant-context.md`. Dashboard CSS classes, component hooks, and
layout constraints: `UI.md`. Design feel: `.impeccable.md`.

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
shows that total while the Task is Working now, across every day, not only the
open stretch. The total also has its own column in the Tasks table and sits in
the detail panel, on every Task whatever its status — unlike the control, which
is only on Active Tasks.
Table and Map layouts: [`docs/tasks.md`](./docs/tasks.md).
_Avoid_: Session, stopwatch, in progress

**Map**:
The other Tasks layout: a free-form canvas the user arranges by hand, drawn
like a data model. A box's position never creates or implies a relation.
Connectors are solid from Parent to child, dashed from Blocker to the Task it
blocks.
Behavior: [`docs/tasks.md`](./docs/tasks.md).
_Avoid_: Board (that word means the Overview tiles), Canvas, Kanban

**Map sidebar**:
The panel floating over the Map canvas: unplaced open Tasks and the "Add an
active task" composer.
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
Overview and Calendar (Calendar, Insights, and Timeline presentations):
[`docs/time-surfaces.md`](./docs/time-surfaces.md).
Each Phase has a fixed icon and color. The Phases pane of Core explains each
Phase; `src/dashboard/lib/phaseGuide.ts` mirrors the derivation above.
_Avoid_: Status, Working now, Scope

**Pulse**:
A named group of Metrics scored together during a Metric check-in. The order of
Pulses, and of Metrics inside a Pulse, is the order they appear in the popup.
A Pulse can be hidden from the popup without deleting it.
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
The recurring countdown. The interval is 5–30 minutes. At zero it pauses and
opens the Popup. Closing the Popup leaves it paused; picking an interval
starts that cycle from now.
Behavior: [`docs/timer-popup.md`](./docs/timer-popup.md).
_Avoid_: Check-in, schedule

**Popup**:
The window the Timer (or ⌘⇧E) opens. It also opens by itself when input
resumes after an idle stretch that was spent Resting, unless the Timer is
already due or the Popup is already up. It is for scoring Metrics, capturing a
brain dump, and quick Assistant chats; it is not a stored record.
Behavior: [`docs/timer-popup.md`](./docs/timer-popup.md).
_Avoid_: Check-in popup

**Brain dump**:
An unstructured captured thought stored on its own, with zero or more Tags.
Its text supports emphasis, per-row sizes, and bulleted, numbered, checklist,
and collapsible lists. Brain dumps have no title field.
Capture, stickies, and Note Board: [`docs/brain-dump.md`](./docs/brain-dump.md).
Editor internals: [`docs/editor.md`](./docs/editor.md).
_Avoid_: note, journal entry, title (brain dumps have no title field)

**Tag**:
A reusable label for brain dumps.
Composer and deletion: [`docs/brain-dump.md`](./docs/brain-dump.md).

**Section**:
One primary destination in the dashboard, chosen from the **Sidebar**. The five
are Overview, Calendar, Core, Assistant, and Settings. Timeline and Insights are
part of Calendar, not Sections of their own. Overview shows the
**Greetings board** except while Phase is Doing; every other Section always
gives its content the full content area beside the Sidebar. No Section shows a
title —
the Sidebar already names where you are. Top-of-Section controls (range,
filters, layout toggles, and so on) stay; each Section keeps its own, with no
shared product name for that row.
_Avoid_: View, screen (for these five)

**Sidebar**:
The left strip that switches **Sections** (Overview, Calendar, Core, Assistant,
Settings).
_Avoid_: Nav, rail (for this strip)

**Core**:
The dashboard Section for Brain dump, Tasks, Metrics, and Phases. One Sidebar
entry; an icon-and-label sidebar switches those panes. The last pane is remembered
(Brain dump when unset). Each pane keeps its own controls; pane icons are picked from the Core sidebar.
Brain dump, Tasks, and Metrics supply their Overview tile icons;
Phases has no Overview tile.
_Avoid_: Hub, home (Overview is the board you land on)

**Greetings board**:
The Overview strip with the typewriter greeting, live Phase, and Timer
(countdown and interval control). Hidden while Phase is Doing so Overview can
stay on work; Timer interval and countdown stay available on the **Popup**.
After the time-of-day greeting, it rotates through every **Active** Reminder;
with none Active, only the greeting shows.
_Avoid_: Header, masthead, status bar (for this strip)

**Reminder**:
A short line the user owns in Settings. Active Reminders rotate on the
Greetings board; Inactive ones stay in Settings but are skipped there. New
Reminders start Active. Text is capped so one line fits the board.
_Avoid_: Tip, prompt, notification

**Assistant**:
The dashboard Section for private, reflective chats backed by OpenAI. The
Assistant suggests next actions and never changes Tasks. Prompts, titles, and
messages stay in Nest's local database. The popup and dashboard share that
saved history; each window keeps its own open chat.
Context assembly: [`docs/assistant-context.md`](./docs/assistant-context.md).

**Tasks scope sidebar**:
The Scopes filter panel beside the Tasks table. It starts collapsed, and the
Map does not show it.
Behavior: [`docs/tasks.md`](./docs/tasks.md).
_Avoid_: Sidebar (alone — that word means the Section switcher)

**Settings**:
Dashboard configuration for Assistant, Reminders, and Background. The Phases
pane of Core explains each Phase. Pulses and the full Metric list live
in the Metrics pane of Core. The Brain dump tile icon, Tags, and saved brain dump
history live in the Brain dump pane of Core. The Tasks, Metrics, and Phases
icons are picked in those panes. One Sidebar entry;
a segmented control switches Settings panes. The last pane is remembered
(Assistant when unset).
_Avoid_: Preferences, admin

**Timeline**:
A Calendar presentation: a day-grouped history of Metric check-ins, brain
dumps, Phase checkpoints, and Task activity. Not a stored record: each stands
on its own.
Behavior: [`docs/time-surfaces.md`](./docs/time-surfaces.md).
_Avoid_: Journal, Logs (Logs is a Calendar figure)

**Logs**:
Those same events on Calendar, chosen beside **Work stretch**.
Choosing Logs shows the kind filters.
Behavior: [`docs/time-surfaces.md`](./docs/time-surfaces.md).
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
- **Timeline** lists Metric check-ins, brain dumps, and Phase checkpoints; it does not contain them
- **Logs** places those events on Calendar; it does not contain them
- **Phase** is derived from Working now, whether Nest or Notion desktop currently has attention, how long the Mac has gone without input, and whether it is locked or asleep

## Example dialogue

> **Dev:** "If 'Run regression tests' is a Child of 'Prepare release', is it automatically a Blocker?"
> **Domain expert:** "No. The Parent describes the work breakdown. Add a Blocker only when one Task must finish before another can proceed."

> **Dev:** "If I leave Working now on overnight, should we subtract that from Worked time?"
> **Domain expert:** "No. Worked time is a piggy bank. It counts the whole time the marker is on. Lock or sleep clears the marker and records Offline, so overnight away time is not Doing."

> **Dev:** "Is the Timer part of every Section header?"
> **Domain expert:** "No. The Timer sits on the **Greetings board**, which appears on Overview except while Phase is Doing. Other Sections have no title — the **Sidebar** already says where you are. During Doing, use the **Popup** for the countdown and interval."

## Flagged ambiguities

- "dependency" can mean either side of a relationship — resolved: use **Blocker** for the prerequisite and **Dependent** for the constrained Task.
- "blocked" can sound like a persisted status — resolved: **Blocked** and **Ready** are derived from Blockers; they are not stored status values.
- "paused" was used as a stored Task status — resolved: stopping work means clearing **Working now** while remaining Active. `paused` is not a selectable status.
- "stopwatch" sounds like a timer that resets each play — resolved: the number is **Worked time**, a running total.
- "session" was the obvious word for one span of work — resolved: it reads as a sitting rather than a recorded span, and **Worked time** already avoids it. One span is a **Work stretch**, the word the Working now control already used.
- "scoping" can sound like **Scope** — resolved: Scope is a task path; Scoping is the Phase when Nest or Notion has attention and nothing is Working now.
- "Idle" can look like a live Phase — resolved: it is only a display label for a historical checkpoint with no Phase, and summaries count it as Offline. Live values are Doing, Scoping, Resting, and Offline. Going idle at the keyboard is a separate thing that carries no label of its own: after three minutes without input the derived Phase is **Resting**, never Idle.
- "Offline" can sound like Nest quit — resolved: Offline is lock/sleep while Nest is running. Nest quit is untracked until the next launch, though quitting still stops Working now.
- "check-in" for the clock or the window — resolved: the clock is the **Timer**;
  the window it opens is the **Popup**. A Metric check-in is a saved Pulse scoring.
  Timer/Popup aria, class names, and chrome never say check-in. The Popup clock
  shows the countdown only.
- "Pulse check-in" sounds right because Metrics are scored inside a Pulse — resolved: the recorded event is a **Metric check-in**; Pulse only groups which Metrics are scored together.
- "journal" was the history screen — resolved: that presentation is **Timeline**. A brain dump is not a journal entry. **Logs** is the event figure on Calendar, beside Work stretch.
- "view" for Overview / Calendar / Core / Assistant / Settings — resolved: each is a **Section**. Calendar and Timeline are presentations inside Calendar; Brain dump, Tasks, Metrics, and Phases are panes of Core. Code may still say `view`; product language does not.
- "header" for the typewriter / Phase / Timer strip — resolved: that strip is the **Greetings board**, on Overview except while Doing.
- "sidebar" for three panels — resolved: **Sidebar** is the Section switcher; the Scopes filter beside the Tasks table is the **Tasks scope sidebar**; the panel over the Map canvas is the **Map sidebar**.
- "section heading" / title above Section content — resolved: no Section shows a title; the Sidebar names the place; each Section keeps its own top controls without a shared product name for that row.
- "panel" vs "pane" — resolved: keep both. **Panel** is a content surface (Overview's three, Task detail, popup Metric scoring). **Pane** is a destination inside Core, Settings, Assistant, Brain dump, or Metrics.
