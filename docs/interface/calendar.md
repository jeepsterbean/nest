# Calendar interface

The Recap Section (Calendar and Timeline presentations, with Insights
in the Section sidebar) and its history review surfaces. The Phases guide lives in
[Phases interface](phases.md). Shared date, Logs
kind, and Phase appearance rules live in
[`docs/interface/time-surfaces.md`](time-surfaces.md). Domain words live in [`CONTEXT.md`](../../CONTEXT.md); Phase derivation lives in
[Phases](../domain/phases.md). Shared dashboard controls
live in [`UI.md`](../../UI.md).

## Presentation and range

Recap's Section sidebar holds [Insights](#insights). The toolbar of both
presentations ends with a Day / Week switch and then a Calendar / Timeline switch. The presentation is
remembered in
`nest:recap-presentation` (Calendar when unset). Calendar then
offers Day and Week, remembered in `nest:date-range` (first visit is Day).
Timeline has no Week: it always shows the
selected day and leaves Calendar's Day / Week choice stored, so returning to
Calendar on Week opens the week that contains that day. Calendar and Timeline
share the selected day. These anchors survive Section navigation during the
current dashboard session; app restarts open on today.

On Timeline the Day / Week switch shows Day and Week is disabled. A date is
chosen from the
[date picker](time-surfaces.md#dates-and-ranges) on the toolbar date. On Week
the picker highlights the whole week, and picking a day opens the week that
contains it. In a narrow window, both switches and Calendar's figure control
wrap under the date navigation.

Calendar, Timeline, and Insights share that one day or week. Insights sits
in the Section sidebar for both presentations and scrolls on its own. When
the window is narrow enough to collapse the Section sidebar, Insights moves
under the figure.

## Calendar

The toolbar opens with the
[shared date navigation](time-surfaces.md#dates-and-ranges) for the day or
week on screen; on Week it pages a week at a time and names the week's first
and last day. Left / Right arrows page that range and `t` returns to Today
while focus is outside interactive controls.

Calendar draws one of two figures. Logs places history on Calendar. Work
stretch is the timetable of recorded work, hidden until Settings shows it.
While it is shown, the figure control sits beside Day / Week and names Work
stretch or Logs; a click switches to the other, remembered in
`nest:calendar-figure` (Work stretch when unset). While it is hidden, Calendar
draws Logs with no figure control and keeps the stored choice. A recorded
stretch can be moved, resized, or deleted only on the Work stretch figure.
[Logs kinds](time-surfaces.md#logs-kinds) are chosen from Insights and shared
with Timeline. Hiding Tasks leaves the Work stretch timetable whole. Insights
stays shown for either figure.

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

Insights sits in Recap's Section sidebar, for Calendar and for Timeline. It shows Brain dumps, Tasks,
Metrics, and Phases, in that order, matching the Sidebar. Each heading shows
that kind's Section icon beside the title; the title opens that Section. Each
heading has a hide control; the heading stays so the kind can be shown again.
The last shown kind stays shown. That choice is the
[Logs kinds](time-surfaces.md#logs-kinds) selection.

Range membership, Tag counts, Phase totals, and Task counts follow
[History domain](../domain/history.md#range-summaries). Untagged leads the
Brain dumps list, including at 0; Tags follow in frequency then name order.
The Brain dumps summary initially shows Untagged and the three most frequent
Tags. Show more reveals the remaining Tags; Show less returns to that compact
list. An empty range shows a quiet empty message. The Phases section is
the mix, with a row for each live Phase (0m included).

The Tasks ledger counts Created, Completed, and Cancelled, always in that
order, even at 0. All three read from status history. Each row shows the title and its Task count at the
right edge. Rows show summaries without expanding into individual Tasks.

Metric check-ins are grouped by Pulse, with counts from
[Metric summaries](../domain/history.md#metric-summaries). Every Pulse is
listed, including one with no check-ins in the range. A range with no Pulses
and no check-ins stays quiet. Each row shows the Pulse title and
its check-in count at the right edge.
Rows show summaries without expanding into individual Metric ratings.
The summary clips at live now, so a just-saved rating appears as soon as data
reloads.

## Timeline

The history presentation inside Recap, one day at a time. Not a stored record: Metric check-ins, brain dumps, and
Phase checkpoints each stand on their own. Its [Logs kinds](time-surfaces.md#logs-kinds)
are the same selection Calendar's Logs figure and Insights use. Insights
reviews the same day.

The list contains only entries in the selected day, with older batches loaded as
needed. Selecting another day resets the batch.
The toolbar shows the selected
day with the [shared day navigation](time-surfaces.md#dates-and-ranges),
then the Phases-only eye when Phases is the only kind shown, and ends with
the [Day / Week and presentation switches](#presentation-and-range). The list
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

