# Calendar Section

The Calendar Section (Calendar and Timeline presentations, with Insights
beside Calendar) and the Phases pane of Core. Shared date, Last hour, Logs
kind, and Phase appearance rules live in
[`docs/time-surfaces.md`](./time-surfaces.md). Domain words and Phase
derivation live in [`CONTEXT.md`](../CONTEXT.md). Shared dashboard controls
live in [`UI.md`](../UI.md).

## Range sidebar

The Calendar Section switches between Calendar and Timeline in its range
sidebar. The presentation is remembered in `nest:calendar-presentation`
(Calendar when unset). Each presentation keeps its own range, so switching
away and back restores where it was, including its selected date. These anchors
survive Section navigation during the current dashboard session; app restarts
open on today.

The Calendar presentation offers Last hour, Day, and Week. The choice is
remembered in `nest:date-range` (first visit is Day). The range selection
lives in a Section sidebar matching Core: a Last hour / Day / Week segmented
control over an always-visible Monday-first month calendar. The calendar's
highlight is the range, so the sidebar shows no range title text: it
highlights the selected day or week, and Last hour highlights the dates it
overlaps. Dates outside the loaded history and future dates are disabled;
picking a date during Last hour switches to Day. At a Section width of 600px or
less, the range controls move above the content. The month calendar has one Tab
stop; arrow keys move focus by a day or week, Home / End move to the week
edges, and Enter / Space selects the focused date.

Timeline uses the same sidebar: the Calendar / Timeline selector, then an
always-visible month calendar, separated from the presentation selector by a
quiet divider. Calendar groups Last hour / Day / Week with its month calendar
below that divider. Timeline is fixed to Day and shows only the month calendar;
older saved range modes are ignored. The mini calendar dots dates with
recorded entries.

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

## Calendar

A control at the top left chooses the figure on Calendar, remembered in
`nest:calendar-figure` (Work stretch on first visit). Work stretch is the
timetable of recorded work. Logs places history on that same Calendar. Choosing
Logs reveals the [Logs kinds](./time-surfaces.md#logs-kinds) filter, shared
with Timeline. Insights stays beside either figure.

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

## Timeline

The history presentation inside Calendar. Not a stored record: Metric check-ins, brain dumps, and
Phase checkpoints each stand on their own. Its [Logs kinds](./time-surfaces.md#logs-kinds)
filter is the same selection Calendar's Logs figure uses.

The list contains only entries in the selected day, with older batches loaded as
needed. Selecting another day resets the batch.
The toolbar shows the selected
day with Previous day, Next day, and Go to today controls shared with Brain dump,
followed by kind filters and the Phases-only eye. Previous day stops at loaded
history, and Next day stops at Today. Each day's entries retain their own Export.
Files use the Nest Timeline heading and `nest-timeline-*` name.
A day label switches to the Calendar presentation, opens that day on its Logs
figure, and switches Calendar's range to Day.
Left / Right arrows page the selected day and `t` returns to Today
while focus is outside interactive controls.

The list is one day-grouped layout whatever the filter. Phases on adds settled Phase rows and
colors the time column by the Phase in force; everything else stays the same.
Timeline and the Overview Timeline tile show no Phase totals. Each visible day
has an Export control that downloads a chronological Markdown timeline of every
event type for that calendar day, regardless of the active kind filter.

In Timeline and the Overview Timeline, each day's icons sit on a hairline
through the mark column, from the first mark to the last. When the selected
range includes now, today opens with the current time and an empty event
cell, including when today has no visible entries. A breathing dot marks that
point on the spine, and the hairline from there to the next mark is a
repeating squiggle. Timeline does not show the day strip or outcome stats.
Metric check-ins show the Pulse icon and Metric scores on one row at the same
height as brain dumps and Working now marks. Brain dumps keep that row height
when their read-only sticky opens. Pulse, Metric, and brain dump icons stand
in for names. The Timeline icon is picked in Overview settings and heads the
Overview Timeline tile.

## Phases pane

The Phases pane of Core is a read-only guide: how Phase is derived, then the
four Phases (Doing, Scoping, Resting, Offline) with their meanings from
`src/dashboard/lib/phaseGuide.ts`. The current Phase is marked, and its icon
breathes a halo in its color. Its icon is picked from the Core sidebar;
Phases has no Overview tile. Phase icons and colors follow
[Phase appearance](./time-surfaces.md#phase-appearance).
