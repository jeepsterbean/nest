# Overview and Calendar

How those Sections show Phase, Worked time, and history. Domain words and
Phase derivation live in [`CONTEXT.md`](../CONTEXT.md). Shared dashboard
controls live in [`UI.md`](../UI.md).

The Calendar Section switches between Calendar and Timeline in its range
sidebar. The presentation is remembered in `nest:calendar-presentation`
(Calendar when unset). Each presentation keeps its own range, so switching
away and back restores where it was, including its selected date. These anchors
survive Section navigation during the current dashboard session; app restarts
open on today. Today follows the clock across midnight; historical dates stay
fixed. Date selection and paging enforce the Today limit in shared navigation
logic as well as in the controls. Direct selections clamp to loaded history;
paging stops before a page starts outside it. The month header shares its
arrow control with Brain dump, with fixed button positions and centered icons.

The Calendar presentation offers Day and Week (Week starts Monday), anchored to real dates
rather than measured back from now; history stops where the loaded 30 days
end. Calendar also has Last hour — a rolling 60 minutes from now. The choice
is remembered in `nest:date-range` (first visit is Day). The range selection
lives in a Section sidebar matching Core: a Last hour / Day / Week segmented
control over an always-visible Monday-first month calendar. The calendar's
highlight is the range, so the sidebar shows no range title text: it
highlights the selected day or week, and Last hour highlights the dates it
overlaps. Dates outside the loaded history and future dates are disabled;
picking a date during Last hour switches to Day. At a Section width of 600px or
less, the range controls move above the content. The month calendar has one Tab
stop; arrow keys move focus by a day or week, Home / End move to the week
edges, and Enter / Space selects the focused date.

Calendar and Insights share that one range. Calendar is always shown; an
Insights toggle above it (pressed while shown) opens or closes Insights as a
column beside Calendar, each scrolling on its own. The choice is
remembered in `nest:calendar-display` (shown on first visit, and for the
retired Insights-only value). At a Section width of 640px or less, Insights
moves under Calendar.

Last hour draws today in Day and marks the trailing hour on it: a quiet
tint across the lane and an accent bracket on the hour gutter. That mark moves
with the minute clock while Calendar stays put. Just after midnight the mark
clips at the day's start, while Insights still reads the full hour. At midnight
Calendar follows the clock onto the new day. Choosing
Last hour leaves Week for Day, so leaving it lands on Day.

## Overview

`SIMPLIFIED_VIEW` in `src/lib/simplifiedView.ts` enables the simplified interface.
When enabled, the dashboard starts on Calendar and offers Calendar and Core;
Overview, Assistant, and Settings are hidden. Setting it to `false` restores
all sections and Overview startup. Saved data and configuration remain in place,
including the background preferences used by the dashboard.

Overview's Last hour tile is Insights for the same rolling 60 minutes as
Calendar's Last hour, computed by the same code: Phases, Brain dumps, Tasks,
and Metrics side by side, wrapping as the tile narrows and scrolling inside
the tile once an opened group outgrows it. Clicking its icon opens Calendar
on Last hour with Insights shown so the summary stays in view. A quiet hour
still shows every section, with 0s rather than gaps. The tile follows the same
minute clock as Calendar Last hour.

Overview has its own configuration panel that opens over the right side of
the tile board from the Greetings board, closed by default. It lets
the user choose the Control panel and Timeline icons, stored with the other tile
icons in `nest:overview-tile-icons`. It closes on its close control, Escape, or
a press outside it, and its button sits on the Greetings board, so it cannot
open while Doing hides the board. The Overview Section icon is picked
from the Sidebar. Feature tiles (Tasks, Timeline, Brain dump, Metric check-in)
take their icon from their own pane (Tasks, Brain dump, and Metrics are Core
panes; Timeline is configured beside Control panel in Overview settings), and Last hour always uses the
Insights icon. General Settings contains no Last hour or Control panel panes.

Overview is a persistent tile board with that summary, a read-only Tasks peek
(Status, Title, Value, Effort) with Open / Closed and a button that opens Core
on the Tasks pane, a Timeline of the 30-day happenings (marks, day labels,
settled Phase rows when Phases is on, and time-column coloring from the Phase
in force; the minimised peek hides that day chrome) filtered by the same Brain
dumps / Phases / Metrics / Tasks chips as the Timeline presentation — independently,
all four on by default, with the Phases-only eye and load-older batching when
needed — a brain dump composer that matches the popup (shared
text and tag draft, Cmd/Ctrl+Enter to save), and Metric check-in scoring.
Tiles can be hidden into the always-present control panel. Clicking a hidden
tile's chip restores it minimised at the first free spot; dragging the chip onto
the board drops it there when it fits. Moving a tile pushes its neighbours into
free space; when none can move, it trades places with the tile it covers most, and
the move is refused if either tile would fall below its minimum size. Metric
check-in is pinned to 4×2 and is not resizable, so it only moves once the board
has slack. Below
861px the tiles stack in board order and cannot be dragged or resized. The
board persists in `nest:overview-layout`. Tasks, Timeline, and Brain dump can be minimised to
counts, the three newest events, and a one-line capture field. Both capture
surfaces can independently browse the five most recent dumps as read-only
text with their tags. Full dump history lives in Timeline.

Up to five **saved grid layouts** sit in the Overview Section sidebar, in the
order they were made, each with a name and a picked icon. Re-saving one does
not move its row. Choosing one loads it onto the board. Any change to the
board after that (move, resize, minimise, hide, or show) marks the selected
layout as having unsaved changes; moving a tile back does not clear it. Save
writes the board over that layout and Revert reloads it. Choosing another
layout while there are unsaved changes asks first: Save and switch, Discard,
or Cancel. When the board belongs to no saved layout, that prompt offers
Save as new instead, which names the current board and then switches. At five
saved layouts that action is unavailable until one is deleted. Saved layouts
are compared only on save: a save or a new layout whose arrangement matches
another saved layout is refused with a link to switch to that one. Names are
unique, ignoring case. New layout saves the current board and is unavailable
at five. Deleting the selected layout leaves the board as it is, belonging to
no saved layout, and switching away from that board also asks first.
A layout name field saves its text when the user presses outside it, without
activating the control under the pointer. Below 861px, name fields, Save ·
Revert, and prompts open beside the rail. Layouts persist in
`nest:overview-layout-snapshots` and the selection with its edited flag in
`nest:overview-layout-selection`.

Overview shows the **Greetings board** except while Phase is Doing; every
other Section always gives its content the full content area beside the
Sidebar.

## Phases

The Phases pane of Core is a read-only guide: how Phase is derived, then the
four Phases (Doing, Scoping, Resting, Offline) with their meanings from
`src/dashboard/lib/phaseGuide.ts`. The current Phase is marked, and its icon
breathes a halo in its color. Its icon is picked from the Core sidebar;
Phases has no Overview tile.

## Insights

Insights is part of Calendar. Phases, Brain dumps, Tasks, and Metrics stack as four left-aligned rows.
Alone, each uses one third of the content width, with a 16rem minimum; at
content widths of 720px or less (including the Calendar Insights column), each fills the
available width.
Brain dumps summarizes the selected range. Saved dumps count by their recorded time. Untagged always leads the
list, including at 0. Tags then show the number of dumps carrying each Tag,
ordered by frequency then name; a dump with several Tags contributes to each
Tag and once to the total. An empty range shows 0 and a quiet empty message. The summary
uses the same live end as Metric check-ins so freshly saved dumps appear
after data reloads.

Insights is the review of a Day, Week, or Last hour, not a view of live
work. Every range opens on the Phase mix, which gives each of the four
live Phases its own row (0m included): name and duration. Then one ledger for the whole range groups each Task by what
happened to it, never by live status:

- Completed / Cancelled: closed at the range's end by a closure inside it.
- Incomplete: everything else with Worked time in the range, whatever its
  open status (Active, Up next, Backlog).

A Task has one status at the range's end, so the three are exclusive and
exhaustive. A closure reopened within the range does not count; without
Worked time that Task is left out. Completions and Cancellations with no
Working now still list, with 0 Worked time. Week sums each Task across its
days rather than listing day by day. Deleted Tasks take their status history
with them, so they never appear.

All three groups always show, in that order, even when empty, so the ledger
keeps one shape from range to range. Each group is one collapsed ledger line
read as a short phrase: Task count, label, and the group's total Worked time
("no time" when 0). Opening it lists each Task with
its Worked time, longest first.
A long group scrolls inside a box about five rows tall, faded at the edge
with more Tasks, so it never sets the board's height. An empty group
cannot open. Groups start collapsed on every visit.

Metric check-ins sit in a dedicated row grouped by
Pulse. Every Pulse is listed, including one with no check-ins in the range
(count 0, no average). A range with no Pulses and no check-ins stays quiet.
Each Pulse is one collapsed row (the check-in count before the Pulse name,
including 0, and the average of all its ratings); opening it lists one line
per Metric that was rated, with a compact colored number per rating and that
Metric's average. Ratings stay in time order and wrap within their column so
every score remains readable.
That row clips at a live now, so a just-saved
rating appears as soon as data reloads. Last hour does not clamp it to
its minute-clock end. Phase mix and the task ledger stay on the shared
minute clock. Last hour uses that same board on a rolling 60-minute window,
and so does Overview's Last hour tile.

## Calendar

A control at the top left chooses the figure on Calendar, remembered in
`nest:calendar-figure` (Work stretch on first visit). Work stretch is the
timetable of recorded work. Logs places history on that same Calendar. Choosing
Logs reveals the four kind filters (Brain dumps, Phases, Metrics, and Tasks);
the selection is shared with Timeline in `nest:logs-preferences`. Insights
stays beside either figure.

Work stretch is hours in a left gutter, one column
per calendar day, each column a Phase wash behind its Work stretches. A
stretch carries its Task title and times inside the block when it is tall
enough; concurrent stretches sit side by side, since multiple Tasks may be
Working now. A line marks the current time. Quiet time reads as empty track
rather than being squeezed out. When Calendar is too narrow for seven days at
their minimum width, Week scrolls sideways rather than squeezing them; the day
heads and the hour gutter stay pinned, and opening a Week brings today's day
into view. A stretch editor closes once its stretch scrolls out of view
in either direction, including behind the pinned day heads or hour gutter.
An open stretch's live end stays pinned to
now. That stretch cannot be moved or resized on Calendar — its bottom edge is
an unfinished line, and Working now is cleared from the Task, not from
Calendar. Clicking a stretch opens an editor beside that stretch — left or right
of the selected block, toward its outer edge when two share the hour, flipping
so the editor stays on screen and closing once its stretch scrolls out of
view. The Task title can be renamed there. Start and end each have a date and
a time, locked while the stretch is still open, and save first, since only
the times can be refused. Dragging a closed stretch moves it; dragging a
start or end edge resizes that bound. Calendar drag snaps to fifteen minutes
and will not shrink a stretch below fifteen minutes unless now is closer (a
stretch cannot end in the future). That floor is only for dragging on
Calendar; a recorded stretch may already be shorter.

Logs uses that same Calendar. Day and Last hour are a single
day. Week is one Calendar with a column per day, a shared hour gutter, and
pinned day heads. Last hour shows today with the rolling hour highlighted and filters marks
and Phase wash to that hour, clipping Calendar at midnight like Work stretch. Every hour keeps its full height, quiet ones included, and Calendar opens
on now or else the first logged hour. Phases on paints the Phase wash in each column and the Phase rail on Day and Last hour;
everything else lands as icons in the hour it happened, in time order. Each
Metric check-in and brain dump is its own icon. A Task changed in that hour
(created, status change, Working now start or stop) gets one icon, tinted like
its Calendar card and using the configured Tasks icon; a Task Working now through an
hour without a change has no icon there. Hover previews an icon: Pulse and
scores, brain dump summary, or Task title and latest change. A click pins the
full view: the read-only sticky, the check-in with delete, or every change the
Task had that hour with times. Busy hours scroll horizontally to keep every icon
reachable.

## Timeline

The history presentation inside Calendar. Not a stored record: Metric check-ins, brain dumps, and
Phase checkpoints each stand on their own. A multi-select filter toggles Brain
dumps, Phases, Metrics, and Tasks; all four are on by default. A click toggles
one kind, and the last kind on stays on. A double click keeps only that kind,
and double clicking the kind already alone turns all four back on. That
selection is the same one Calendar's Logs figure uses.

Timeline uses the Calendar Section sidebar: the Calendar / Timeline selector,
then an always-visible month calendar, separated from the presentation selector
by a quiet divider. Calendar groups Last hour / Day / Week with its month calendar
below that divider. Timeline is fixed to Day and shows only the month calendar;
older saved range modes are ignored.
The list contains only entries in the selected day, with older batches loaded as
needed. Selecting another day resets the batch.
The mini calendar dots dates with recorded entries. The toolbar shows the selected
day with Previous day, Next day, and Go to today controls shared with Brain dump,
followed by kind filters and the Phases-only eye. Previous day stops at loaded
history, and Next day stops at Today. Each day's entries retain their own Export.
Files use the Nest Timeline heading and `nest-timeline-*` name.
A day label switches to the Calendar presentation, opens that day on its Logs
figure, and switches Calendar's range to Day.
Left / Right arrows page the selected day and `t` returns to Today
while focus is outside interactive controls. Today follows the clock across midnight.

The list is one day-grouped layout whatever the filter. Phases on adds settled Phase rows and
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
whenever Phases becomes the only kind again. Timeline and the Overview Timeline
show no Phase totals.
Settled Phase rows and the day export use the 60-second settle collapse (a burst lands on the Phase it settled
on; if that equals the Phase before the burst, it is omitted). Each visible day
has an Export control that downloads a chronological Markdown timeline of every
event type for that calendar day, regardless of the active kind filter.

Each Phase has a fixed icon and color (set by migration, not editable), which
drive the Greetings board, Calendar rail and wash, Insights mix and totals, Timeline Phase rows,
and the Timeline time column (quiet surface tone when uncolored). In Timeline and
the Overview Timeline, each day's icons sit on a hairline through the mark
column, from the first mark to the last. When the selected range includes now, today opens with the current time
and an empty event cell, including when today has no visible entries. A breathing dot marks that point on the spine, and
the hairline from there to the next mark is a repeating squiggle. Timeline does not show the day strip or outcome stats. Metric check-ins show the Pulse icon and Metric
scores on one row at the same height as brain dumps and Working now marks.
Brain dumps keep that row height when their read-only sticky opens. Pulse,
Metric, and brain dump icons stand in for names. The Timeline icon is picked
in Overview settings and heads the Overview Timeline tile.
