# Nest Domain Context

Nest is a private self-care workspace for checking in, organizing personal work,
and capturing thoughts without interrupting flow.

Documentation map: `AGENTS.md`. Dashboard CSS classes, component hooks, and
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
shows the current stretch; the total is every stretch added up. The total has
its own column in the Tasks table and sits in the detail panel, on every Task
whatever its status — unlike the control, which is only on Active Tasks.
Table is the default Tasks layout (Map is the other); last choice is
remembered. The table filters by any set of persisted statuses — Backlog, Up
next, Active, Completed, Cancelled — with Open / Closed / All presets; first
visit is Open. New tasks are created Active. The **Tasks scope sidebar** belongs to the table;
the Map has none. The "Add an active task" composer is in both layouts — above
the table, and at the top of the Map sidebar.
Table columns can be reordered and resized. Working now is started
from the detail panel, not from the table or the Map.
_Avoid_: Session, stopwatch, in progress

**Map**:
The other Tasks layout: a free-form canvas the user arranges by hand, drawn
like a data model. Each placed Task is an **entity box** — a title header over
attribute rows (status, scope, value / effort, and parent, children or blocked
by when they apply). The canvas is far larger than the screen and is panned by
dragging bare canvas, zoomed with the wheel about the pointer or with the
corner zoom controls; pan and zoom are remembered. Open Tasks wait in the **Map
sidebar**; dragging one onto the canvas drops it wherever the pointer is, and
clicking it drops it in view. Boxes go anywhere and may overlap; a box's
position is only the user's arrangement and never creates or implies a
relation. Connectors are
right-angled and arrowed: solid from Parent to child, dashed from Blocker to
the Task it blocks. Completed and Cancelled boxes stay on the Map, dimmed, so a
chain still reads end to end; drag a box back to the sidebar, or use its remove
button, to take it off. Relations are added and removed in the detail panel,
not on the Map. Positions live in the browser, keyed by Task id, and are
dropped when the Task is deleted.
_Avoid_: Board (that word means the Overview tiles), Canvas, Kanban

**Map sidebar**:
The panel floating over the Map canvas: an "Add an active task" row above the
list of open Tasks not yet placed. It collapses to a button showing that count.
The Map is not scope-filtered — the sidebar lists every open Task.
_Avoid_: Sidebar (alone — that word means the Section switcher), tray, backlog

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
0, not as missing; live rolling summaries refresh as time passes. Overview is
a persistent tile board with that summary, a read-only Tasks peek (Status,
Title, Value, Effort) with Open / Closed and a button that opens the Tasks
section, a today-only Logs Timeline (same marks and Phase gutter coloring as
Logs, without day labels, Phase totals, or Logs chrome) filtered by Timeline /
Brain dumps / Metrics with load-older batching when needed, a brain dump
composer that matches the popup (shared text and tag draft, Cmd/Ctrl+Enter to
save), and Metric check-in scoring. Tiles can be hidden into the always-present
control panel and restored from there as space allows. Tasks, Timeline, and Brain dump can be
minimised to counts, the three newest events, and a one-line capture field.
Both capture surfaces can independently browse the five most recent dumps as
read-only text with their tags. Full dump
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
That stretch cannot be moved or resized on Calendar — its bottom edge is an
unfinished line, and Working now is cleared from the Task, not from the grid.
Clicking a stretch opens an editor beside that stretch — left or right of the
selected block, toward its outer edge when two share the hour, flipping so the
editor stays on screen and closing once its stretch scrolls out of the grid. The
Task title can be renamed there. Start and end each have a date and a time,
locked while the stretch is still open, and save first, since only the times
can be refused. Dragging a closed stretch moves it; dragging a start or end
edge resizes that bound. Calendar drag snaps to
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
opens the Popup. Closing the Popup leaves it paused; picking an interval
starts that cycle from now.
_Avoid_: Check-in, schedule

**Popup**:
The window the Timer (or ⌘⇧E) opens. It is for scoring Metrics, capturing a
brain dump, and quick Assistant chats; it is not a stored record.
_Avoid_: Check-in popup

**Brain dump**:
An unstructured captured thought stored on its own, with zero or more Tags.
Its text supports emphasis, per-row sizes, and bulleted, numbered, checklist,
and collapsible lists. Saved checklist boxes show their recorded state in
history and Logs; edit the content by forking it into a draft.
Expanding a saved dump in Logs opens a read-only sticky 12px to the right of
the cursor, centered at its height, and it closes on an outside click or Escape.
It has no editing or action controls; collapsible
lists are unfolded for reading. Settings → Brain dump shows compact saved-sticky
previews that open that same sticky, newest first, filtered by the past 1, 3, or 7 days and by Tag.
The range defaults to 7 days and measures back from the current time.
Overview and the popup share the text and selected-tag draft, and independently
browse the five most recent saved dumps (Cmd/Ctrl+Enter to save). Logs can edit
a saved dump's Tags, and fork a saved dump into a new unsaved floating draft
(text and Tags). Overview drafts can be peeled into movable floating drafts and
resized from their lower-right corner. A saved brain dump being browsed in
Overview can also be copied into a new floating draft.
A **Note Board** sits on the same overlay as those floating drafts, on every
Section: a moveable, resizeable frame that is always present, even when empty.
Dragging a floating draft onto the expanded board docks that draft as a row
(the collapsed summary, with no expand). The minimised bar is not a drop
target. While the draft is held over the expanded board, the sticky itself is
hidden and a preview row appears in the list. Dragging a row out restores the
draft as a free sticky at the drop point, still expanded or minimised as it
was, snapped fully on screen. The board
itself can be minimised to a single row labelled Note Board, which counts the
rows it is hiding. Hiding stickies still only hides free drafts; docked rows
stay in the board.
_Avoid_: note, journal entry, title (brain dumps have no title field)

**Tag**:
A reusable label for brain dumps. The composer shows selected Tags followed by
the five most recently used unselected Tags; its overflow menu lists every Tag.
Deleting a Tag removes it from every historical brain dump.

**Section**:
One primary destination in the dashboard, chosen from the **Sidebar**. The seven
are Overview, Calendar, Insights, Logs, Tasks, Assistant, and Settings. Overview shows the
**Greetings board** except while Phase is Doing; every other Section always
gives its content the full content area beside the Sidebar. No Section shows a
title —
the Sidebar already names where you are. Top-of-Section controls (range,
filters, layout toggles, and so on) stay; each Section keeps its own, with no
shared product name for that row.
_Avoid_: View, screen (for these seven)

**Sidebar**:
The left strip that switches **Sections** (Overview, Calendar, Insights, Logs,
Tasks, Assistant, Settings).
_Avoid_: Nav, rail (for this strip)

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
OpenAI API key is saved in Settings and stored in the system keychain. System
instructions apply to every request; a selected Prompt fills the user message
composer and is never sent as system instructions. Chat uses read-only context
from the current Active Tasks, including Working now, Scope, Parent, and
unresolved Blockers.
The user chooses GPT-5.6 Luna or GPT-5.6 Terra when starting a chat. Prompt
edits apply when selected. Chat titles start from the first message and remain
editable. Prompts, titles, and messages stay in Nest's local database. Each
model request sends the current chat and Active Task context to OpenAI. The
Assistant suggests next actions and never changes Tasks. Nest retains a sent
message when OpenAI cannot complete its reply, and marks any partial reply as
incomplete.

**Tasks scope sidebar**:
The Scopes filter panel beside the Tasks table. It starts collapsed, and the
Map does not show it.
_Avoid_: Sidebar (alone — that word means the Section switcher)

**Settings**:
Dashboard configuration for Metrics (Pulses and the full Metric list), Phase
icons and colors, Tags, Reminders, Last hour, Tasks, Timeline, Brain dump, and
Background. One Sidebar entry; a segmented control switches panes. The last
pane is remembered (Metrics when unset).
_Avoid_: Preferences, admin

**Logs**:
The history Section. Not a stored record: Metric check-ins, brain dumps, and
Phase checkpoints each stand on their own. One segmented control switches
Timeline, Brain dumps, Phases, Metrics, and Raw. Timeline marks happenings and settled Phase changes on a
day rail (raw attention flicker stays off; the gutter shows the Phase in force
at each mark).
Brain dumps, Phases, Metrics, and Raw are day-grouped lists (Raw is the mixed
feed, including Working now starts and stops). Phases always uses the
60-second settle collapse (a burst lands on the Phase it settled on; if that
equals the Phase before the burst, it is omitted). Each visible day has an
Export control that downloads a chronological Markdown timeline of every event
type for that calendar day, regardless of the active Logs filter; exported
Phase changes use the same settled aggregation rather than raw checkpoints.
Each Phase has separate icon and color controls in Settings,
with a broad preset palette and custom color picker; those choices drive the
Greetings board, Calendar rail and wash, Insights mix and totals, Logs Raw Phase rows,
and the Timeline time gutter (quiet surface tone when uncolored). Metric check-in, brain dump,
Phase, and Working now start/stop icons sit directly on the timeline line.
Logs does not show the day strip or outcome stats. Events are grouped by day;
Phase totals end at midnight for past days and at the current time for Today.
Metric check-ins show the Pulse icon and Metric scores on one row at the same
height as brain dumps and Working now marks. Brain dumps
keep that row height when their read-only sticky opens. Pulse, Metric, and brain dump icons stand
in for names. The filters are the only chrome at the top of Logs.
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

> **Dev:** "Is the Timer part of every Section header?"
> **Domain expert:** "No. The Timer sits on the **Greetings board**, which appears on Overview except while Phase is Doing. Other Sections have no title — the **Sidebar** already says where you are. During Doing, use the **Popup** for the countdown and interval."

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
  Timer/Popup aria, class names, and chrome never say check-in. The Greetings
  board due phrase "time to check in!" is the exception. The Popup clock shows
  the countdown only.
- "Pulse check-in" sounds right because Metrics are scored inside a Pulse — resolved: the recorded event is a **Metric check-in**; Pulse only groups which Metrics are scored together.
- "journal" was the history screen — resolved: that Section is **Logs**. A brain dump is not a journal entry.
- "view" for Overview / Calendar / Insights / Logs / Tasks / Assistant / Settings — resolved: each is a **Section**. Code may still say `view`; product language does not.
- "header" for the typewriter / Phase / Timer strip — resolved: that strip is the **Greetings board**, on Overview except while Doing.
- "sidebar" for three panels — resolved: **Sidebar** is the Section switcher; the Scopes filter beside the Tasks table is the **Tasks scope sidebar**; the panel over the Map canvas is the **Map sidebar**.
- "section heading" / title above Section content — resolved: no Section shows a title; the Sidebar names the place; each Section keeps its own top controls without a shared product name for that row.
- "panel" vs "pane" — resolved: keep both. **Panel** is a content surface (Overview's three, Task detail, popup Metric scoring). **Pane** is a segmented destination inside Settings or Assistant.

## Timer

- The **Greetings board** shows the countdown and controls its 5–30 minute
  interval when Overview is showing it (not during Doing). When due it shows
  "time to check in!"; the Popup clock stays on the countdown and remains the
  Timer surface while Doing.
- At zero, the timer pauses, plays the system alert sound, and opens the
  popup. It stays at `0:00` (glowing) until a new interval is picked or the
  due Metric check-in is completed. Dismissing the popup does not start the
  next cycle.
- Picking an interval on the clock starts that cycle immediately, including
  when the timer is due.
- Completing a due Metric check-in starts the next cycle with the current
  interval. Completing a manually shown popup leaves its live Timer unchanged.
- When the timer runs out, the Metric scoring panel holds a gold due treatment
  until a Metric check-in is saved. Restarting the clock or submitting a brain
  dump does not clear it.
- The popup has the Timer bar across the top (countdown, interval, and a line
  that drains with the remaining time; click the countdown to pick an
  interval) and an icon-only tab strip down the left with four tabs. Overview
  shows Brain dump on the left and Tasks and metrics on the right. Tasks and
  metrics holds Metric scoring above the Active / Up next task list; extra
  tasks scroll. Completed and Cancelled Tasks from the last 60 minutes sit
  above Active; the list opens on Active, and scrolling up reveals them so
  they can be returned to Active. Active rows have Up next to the left of
  Complete. Brain dump holds the brain dump. Assistant holds the same Chat
  workspace as the dashboard; Assistant setup stays in the dashboard. A due
  popup opens on Overview; a manual one opens on the last tab you chose
  (Brain dump the first time). Choosing a tab yourself remembers it; a
  timer-triggered Overview does not. Overview focuses the brain dump. A gold
  dot on Overview and on Tasks and metrics marks a Metric check-in still owed.
- The Metric scoring panel opens on the first Metric of the first visible Pulse.
  Metrics can hide a Pulse from the popup. A pulse toggle swaps among Pulses
  shown there; finishing the last Metric of a Pulse saves a Metric check-in and
  closes the popup.
- Tab (or Shift+Tab) cycles the four popup tabs and ⌘1 / ⌘2 / ⌘3 / ⌘4 pick
  Overview, Tasks and metrics, Brain dump, and Chat directly. Timer,
  Dashboard, and task controls are pointer-only; Metric ratings use the 1–5
  number shortcuts.
- Opening the dashboard from the popup dismisses it.
- Manually shown popups keep the live countdown and do not reset it when
  completed or dismissed.
