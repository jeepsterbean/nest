# Overview, Calendar, Insights, and Logs

How those Sections show Phase, Worked time, and history. Domain words and
Phase derivation live in [`CONTEXT.md`](../CONTEXT.md). CSS hooks live in
[`UI.md`](../UI.md).

Insights and Calendar share Day and Week (Week starts Monday), anchored to
real dates and paged with Earlier / Later / Today rather than measured back
from now; paging stops where the loaded 30 days of history end. The last
chosen Day / Week is remembered (`nest:date-range`); first visit is Day.
Insights also has Last hour — a rolling 60 minutes from now. That filter is
Insights-only (`nest:insights-range-mode`) so Calendar stays on Day / Week.

## Overview

Overview's Last hour tile is the compact surface of Insights' Last hour
filter: the same outcome stats (Completed, Value, Effort, Check-ins) and
duration totals for Doing, Scoping, Resting, and Offline (Idle time is
counted as Offline). A quiet hour still shows those figures as 0, not as
missing. The tile keeps its own refresh: it recomputes when dashboard data
reloads, not on the minute clock.

Overview is a persistent tile board with that summary, a read-only Tasks peek
(Status, Title, Value, Effort) with Open / Closed and a button that opens the
Tasks section, a Logs Timeline of the same 30-day history as Logs (same marks,
Phase gutter coloring, day labels, and Phase totals; the minimised peek hides
that day chrome) filtered by Timeline / Brain dumps / Metrics with load-older
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
That column clips at a live now so a just-saved rating appears as soon as
data reloads; Phase mix and the task ledger stay on the shared minute
clock. Last hour uses that same board on a rolling 60-minute window;
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
Phase checkpoints each stand on their own. One segmented control switches
Timeline, Brain dumps, Phases, Metrics, and Raw. Timeline marks happenings
and settled Phase changes on a day rail (raw attention flicker stays off; the
gutter shows the Phase in force at each mark). Brain dumps, Phases, Metrics,
and Raw are day-grouped lists (Raw is the mixed feed, including Working now
starts and stops). Phases always uses the 60-second settle collapse (a burst
lands on the Phase it settled on; if that equals the Phase before the burst,
it is omitted). Each visible day has an Export control that downloads a
chronological Markdown timeline of every event type for that calendar day,
regardless of the active Logs filter; exported Phase changes use the same
settled aggregation rather than raw checkpoints.

Each Phase has separate icon and color controls in Settings, with a broad
preset palette and custom color picker; those choices drive the Greetings
board, Calendar rail and wash, Insights mix and totals, Logs Raw Phase rows,
and the Timeline time gutter (quiet surface tone when uncolored). Metric
check-in, brain dump, Phase, and Working now start/stop icons sit directly on
the timeline line. Logs does not show the day strip or outcome stats. Events
are grouped by day; Phase totals end at midnight for past days and at the
current time for Today. Metric check-ins show the Pulse icon and Metric
scores on one row at the same height as brain dumps and Working now marks.
Brain dumps keep that row height when their read-only sticky opens. Pulse,
Metric, and brain dump icons stand in for names. The top of Logs holds only
the filters and an icon picker; the picked icon marks Logs in the sidebar and
heads the Overview Timeline tile.
