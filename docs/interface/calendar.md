# Calendar interface

The Recap Section (Calendar and Timeline presentations, with Insights
beside either) and its history review surfaces. The Core guide lives in
[Phases interface](phases.md). Shared date, Logs
kind, and Phase appearance rules live in
[`docs/interface/time-surfaces.md`](time-surfaces.md). Domain words live in [`CONTEXT.md`](../../CONTEXT.md); Phase derivation lives in
[Phases](../domain/phases.md). Shared dashboard controls
live in [`UI.md`](../../UI.md).

## Range sidebar

The Recap sidebar switches between Calendar and Timeline, remembered in
`nest:recap-presentation` (Calendar when unset). Calendar then
offers Day and Week, remembered in `nest:date-range` (first visit is Day).
Timeline has no Week: it always shows the
selected day and leaves Calendar's Day / Week choice stored, so returning to
Calendar on Week opens the week that contains that day. Calendar and Timeline
share the selected day. These anchors survive Section navigation during the
current dashboard session; app restarts open on today.

The Section sidebar holds the presentation switch and an always-visible
Monday-first month calendar. Calendar's Day / Week control sits to the right
of its date navigation. The calendar's highlight is
the range, so the sidebar shows no range title text. Dates outside the loaded
history and future dates are disabled. In a narrow window, the sidebar
moves above the content. The month calendar has one Tab stop; arrow keys move
focus by a day or week, Home / End move to the week edges, and Enter / Space
selects the focused date. On Timeline the mini calendar dots dates with
recorded entries.

Calendar, Timeline, and Insights share that one day or week. Insights always
sits beside the figure, each scrolling on its own. When the Section is too
narrow for both columns, Insights moves under the figure.

## Calendar

The toolbar opens with the
[shared date navigation](time-surfaces.md#dates-and-ranges) for the day or
week on screen; on Week it pages a week at a time and names the week's first
and last day. Left / Right arrows page that range and `t` returns to Today
while focus is outside interactive controls. The sidebar month calendar and
this toolbar select the same range.

A control beside Day / Week chooses the figure on Calendar, remembered in
`nest:calendar-figure` (Work stretch on first visit). Work stretch is the
timetable of recorded work. Logs places history on that same Calendar.
[Logs kinds](time-surfaces.md#logs-kinds) are chosen from Insights and shared
with Timeline. Hiding Tasks leaves the Work stretch timetable whole. Insights
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
now. That stretch cannot be moved or resized on Calendar, and Working now is
cleared from the Task, not from Calendar. Clicking a stretch opens an editor
beside that stretch — left or right of the selected block, toward its outer edge when two share the hour, flipping
so the editor stays on screen and closing once its stretch scrolls out of
view. The Task title can be renamed there. Start and end each have a date and
a time, locked while the stretch is still open, and save first, since only
the times can be refused. Dragging a closed stretch moves it; dragging a
start or end edge resizes that bound. Calendar drag snaps to fifteen minutes
and will not shrink a stretch below fifteen minutes unless now is closer (a
stretch cannot end in the future). That floor is only for dragging on
Calendar; a recorded stretch may already be shorter.

Logs uses that same Calendar. Day is a single day. Week is one Calendar with
a column per day, a shared hour gutter, and pinned day heads. Every hour keeps
its full height, quiet ones included, and Calendar opens on now or else the
first logged hour. While Phases is shown, it paints the Phase wash in each
column and the Phase rail on Day; everything else lands as icons in the hour it happened, in
time order. Each
Metric check-in and brain dump is its own icon. A Task changed in that hour
(created, status change, Working now start or stop) gets one icon, tinted like
its Calendar card and using the configured Tasks icon; a Task Working now through an
hour without a change has no icon there. Hover previews an icon: Pulse and
scores, brain dump summary, or Task title and latest change. A click pins the
full view: the read-only sticky, the check-in with delete, or every change the
Task had that hour with times. Busy hours scroll horizontally to keep every icon
reachable.

## Insights

Insights sits beside Calendar and beside Timeline. It shows Phases, Brain dumps,
Tasks, and Metrics, in that order. Each heading hides that kind; the heading
stays so it can be shown again. The last shown kind stays shown. That choice
is the [Logs kinds](time-surfaces.md#logs-kinds) selection.

Range membership, Tag counts, Phase totals, and Task outcomes follow
[History domain](../domain/history.md#range-summaries). Untagged leads the
Brain dumps list, including at 0; Tags follow in frequency then name order.
The Brain dumps summary initially shows Untagged and the three most frequent
Tags. Show more reveals the remaining Tags; Show less returns to that compact
list. An empty range shows 0 and a quiet empty message. Every range opens on the
Phase mix, with a row for each live Phase (0m included), then the Task ledger.

The ledger's three outcome groups (Completed, Cancelled, Incomplete) always
show, in that order, even when empty. Each row shows the outcome title and
its Task count at the right edge. Only the outcome title is
clickable: it opens Tasks in Core on today, without filtering the outcome.
Rows show summaries without expanding into individual Tasks.

Metric check-ins are grouped by Pulse, with counts from
[Metric summaries](../domain/history.md#metric-summaries). Every Pulse is
listed, including one with no check-ins in the range. A range with no Pulses
and no check-ins stays quiet. Each row shows the clickable Pulse title and
its check-in count at the right edge. Only the Pulse title
is clickable: it opens Metrics in Core on today, without selecting a Pulse.
Rows show summaries without expanding into individual Metric ratings.
The summary clips at live now, so a just-saved rating appears as soon as data
reloads.

## Timeline

The history presentation inside Recap, one day at a time. Not a stored record: Metric check-ins, brain dumps, and
Phase checkpoints each stand on their own. Its [Logs kinds](time-surfaces.md#logs-kinds)
are the same selection Calendar's Logs figure and Insights use. Insights
sits beside the list, on the same day.

The list contains only entries in the selected day, with older batches loaded as
needed. Selecting another day resets the batch.
The toolbar shows the selected
day with the [shared day navigation](time-surfaces.md#dates-and-ranges),
then the Phases-only eye when Phases is the only kind shown. The sidebar month calendar
and this toolbar both stay: month jump and day-step select the same day. The list
does not repeat that day.
Left / Right arrows page the selected day and `t` returns to Today
while focus is outside interactive controls.

The list is one day-grouped layout whatever the filter. Phases on adds settled Phase rows and
colors the time column by the Phase in force; everything else stays the same.
Timeline shows no Phase totals.

When the selected range includes now, today opens with the current time and an
empty event cell, including when today has no visible entries. Timeline does
not show the day strip or outcome stats. Metric check-ins show the Pulse icon
and Metric scores. Pulse, Metric, and brain dump icons stand in for names.

