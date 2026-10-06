# Overview, Calendar, Insights, and Logs

How those Sections show Phase, Worked time, and history. Domain words and
Phase derivation live in [`CONTEXT.md`](../CONTEXT.md). CSS hooks live in
[`UI.md`](../UI.md).

Insights and Calendar both offer Day and Week (Week starts Monday), anchored
to real dates and paged with Earlier / Later / Today (a double arrow) rather
than measured back from now. The range title reads as fixed-width dates, e.g.
`Fri 02/10/2026` for Day and `Mon 28/09/2026 – Sun 04/10/2026` for Week, so
paging never shifts the controls beside it; paging stops where the loaded 30 days of history end. Each Section
remembers its own choice, so changing one leaves the other where it was
(Calendar in `nest:date-range`, Insights in `nest:insights-range-mode`; first
visit is Day, and Insights starts from Calendar's choice until it has one of
its own). Insights also has Last hour — a rolling 60 minutes from now, titled
with the clock span it covers and marked live, with no paging. On Insights the
range title opens a month of days: any day from the loaded history through
today can be picked, older and future days are greyed out, and picking a day
while on Last hour switches to Day.

## Overview

Overview's Last hour tile is the compact surface of Insights' Last hour
filter: the same outcome stats (Completed, Value, Effort, Check-ins) and
duration totals for Doing, Scoping, Resting, and Offline (Idle time is
counted as Offline). Clicking its icon opens Insights on Last hour. A quiet hour still shows those figures as 0, not as
missing. The tile keeps its own refresh: it recomputes when dashboard data
reloads, not on the minute clock.

Overview has its own configuration panel that opens over the right side of
the tile board from the Greetings board, closed by default. It lets
the user choose the Control panel icon. The Overview Section icon is picked
from the Sidebar. Feature tiles (Tasks, Timeline, Brain dump, Metric check-in)
take their icon from their own pane (Tasks, Brain dump, and Metrics are Core
panes; Timeline shares the Logs Sidebar icon), and Last hour always uses the
Insights icon. General Settings contains no Last hour or Control panel panes.

Overview is a persistent tile board with that summary, a read-only Tasks peek
(Status, Title, Value, Effort) with Open / Closed and a button that opens Core
on the Tasks pane, a Logs timeline of the 30-day happenings (marks,
Phase gutter coloring, day labels, and Phase totals that end at midnight for
past days and at the current time for Today; Phase changes stay in
that color; the minimised peek hides that day chrome) filtered by Timeline /
Brain dumps / Metrics with load-older
batching when needed, a brain dump composer that matches the popup (shared
text and tag draft, Cmd/Ctrl+Enter to save), and Metric check-in scoring.
Tiles can be hidden into the always-present control panel and restored from
there as space allows. Tasks, Timeline, and Brain dump can be minimised to
counts, the three newest events, and a one-line capture field. Both capture
surfaces can independently browse the five most recent dumps as read-only
text with their tags. Full dump history lives in Logs.

Overview shows the **Greetings board** except while Phase is Doing; every
other Section always gives its content the full content area beside the
Sidebar.

## Insights

Insights is the longer look for Day, Week, or Last hour. Every range shows
outcome stats (Completed, Value, Effort, Check-ins; a quiet range still
prints 0) above a Phase mix, then Tasks with Worked time that day grouped
by status as of that day's end (Active, Up next, Backlog, Completed,
Cancelled), plus Completions and Cancellations with no Working now that
day (0 Worked time). Metric check-ins sit in a dedicated column grouped by
Pulse — average plus a tick per rating — even when the range has none.
The Check-ins stat and that column clip at a live now, so a just-saved
rating appears as soon as data reloads. Last hour does not clamp them to
its minute-clock end. Phase mix and the task ledger stay on the shared
minute clock. Last hour uses that same board on a rolling 60-minute window;
Overview's Last hour tile is the stats and Phase totals from that window.

## Calendar

Calendar is the timetable of that range — hours in a left gutter, one column
per calendar day, each column a Phase wash behind its Work stretches. A
stretch carries its Task title and times inside the block when it is tall
enough; concurrent stretches sit side by side, since multiple Tasks may be
Working now. A line marks the current time. Quiet time reads as empty track
rather than being squeezed out. An open stretch's live end stays pinned to
now. That stretch cannot be moved or resized on Calendar — its bottom edge is
an unfinished line, and Working now is cleared from the Task, not from the
grid. Clicking a stretch opens an editor beside that stretch — left or right
of the selected block, toward its outer edge when two share the hour, flipping
so the editor stays on screen and closing once its stretch scrolls out of the
grid. The Task title can be renamed there. Start and end each have a date and
a time, locked while the stretch is still open, and save first, since only
the times can be refused. Dragging a closed stretch moves it; dragging a
start or end edge resizes that bound. Calendar drag snaps to fifteen minutes
and will not shrink a stretch below fifteen minutes unless now is closer (a
stretch cannot end in the future). That floor is only for dragging on the
grid; a recorded stretch may already be shorter.

## Logs

The history Section. Not a stored record: Metric check-ins, brain dumps, and
Phase checkpoints each stand on their own. A multi-select filter toggles Brain
dumps, Phases, Metrics, and Tasks; all four are on by default. A click toggles
one kind, and the last kind on stays on. A double click keeps only that kind,
and double clicking the kind already alone turns all four back on. A remembered
List / Hours switch picks the layout.

The toolbar has two rows that keep their slots in both layouts: the selected
day (Earlier / day picker / Later / Today), that day's Export, and the List /
Hours switch on top; the filter, plus the Phases-only eye in List, below. List
and Hours share one selected day. The day picker dots days that hold entries
for the current filter. Hours pages calendar days. List pages between days that
hold entries, since an empty day has no row to land on, and scrolls to the
picked day's group (an empty day lands on the nearest older one), loading older
batches as needed. Scrolling List moves the selected day to the group at the
top; above the first group a picked empty Today stays selected. Switching to
List, or changing the filter there, scrolls back to the selected day. A List
day label opens that day in Hours. Left / Right arrows step the day and `t`
returns to Today while focus is outside text fields and dialogs.

Hours shows one day at a time on Calendar's Day grid, paged and opened the same
way: every hour keeps its full height, quiet ones included, and the grid opens
on now or else the first logged hour. Phases on paints the Phase wash and rail;
everything else lands as icons in the hour it happened, in time order. Each
Metric check-in and brain dump is its own icon. A Task changed in that hour
(created, status change, Working now start or stop) gets one icon, tinted like
its Calendar card and using the configured Tasks icon; a Task Working now through an
hour without a change has no icon there. Hover previews an icon: Pulse and
scores, brain dump summary, or Task title and latest change. A click pins the
full view: the read-only sticky, the check-in with delete, or every change the
Task had that hour with times. Busy hours scroll horizontally to keep every icon
reachable. The empty message appears only when both marks and the Phase wash
are absent.

List is one day-grouped layout whatever the filter. Phases on adds settled Phase rows and
colors the time column by the Phase in force; everything else stays the same.
Tasks lists task creation, status changes (including completion, cancellation,
and reopening), and Working now starts and stops. Lifecycle rows use the stored
status-event timestamps and current Task titles; deleting a Task removes its
history. Task rows share the configured Tasks timeline icon and an emphasized
Task title. Every activity follows `Title — Activity`, with a compact activity
tag in past tense: Added, Started, Paused, Completed, Cancelled, or
Moved to Backlog / Up next / Active. Reopening a closed Task shows Reopened to
its destination status. The Overview Timeline uses that same formatting. With Phases alone, an eye button swaps
the settled rows for every Phase checkpoint in the window; it starts off
whenever Phases becomes the only kind again. Logs shows no Phase totals.
Settled Phase rows and the day export use the 60-second settle collapse (a burst lands on the Phase it settled
on; if that equals the Phase before the burst, it is omitted). Each visible day
has an Export control that downloads a chronological Markdown timeline of every
event type for that calendar day, regardless of the active Logs filter.

Each Phase has separate icon and color controls in the Phases pane of Core, with a
broad preset palette and custom color picker; those choices drive the Greetings
board, Calendar rail and wash, Insights mix and totals, Logs Phase rows,
and the Logs time column (quiet surface tone when uncolored). In List and
the Overview Timeline, each day's icons sit on a hairline through the mark
column, from the first mark to the last. Today opens with the current time
and an empty event cell. A breathing dot marks that point on the spine, and
the hairline from there to the next mark is a repeating squiggle. Logs does not show the day strip or outcome stats. Metric check-ins show the Pulse icon and Metric
scores on one row at the same height as brain dumps and Working now marks.
Brain dumps keep that row height when their read-only sticky opens. Pulse,
Metric, and brain dump icons stand in for names. The Logs icon is picked from the Sidebar and heads the Overview Timeline tile.
