# Tasks interface

Dashboard interactions for Day, Table, Map, and Task details. Task rules live
in [Tasks domain](../domain/tasks.md); shared terminology lives in
[`CONTEXT.md`](../../CONTEXT.md) and dashboard controls in
[`UI.md`](../../UI.md).

The Tasks Section icon is picked from the Sidebar and also marks Task events
in Logs. Section icon behavior lives in [`UI.md`](../../UI.md#dashboard-shell).

## Day

Tasks opens in Day on each visit. The view button offers Table in Day and
Day in Table. Day is a task-focused daily report over the
same 30-day history window as Calendar,
paged with the [shared day navigation](time-surfaces.md#dates-and-ranges).

The summary has two groups, each read from one history so its stats compare.
Changes counts Tasks Created, Completed, and Cancelled that day, from status
history; a Task closed with no work that day still counts. Work counts distinct
Tasks Worked on, from Work stretches, and Incomplete as the part of Worked on
still open when the day ended, shown as "N of" the Worked on count.
Worked time is shown per Task and not totalled across Tasks.
Outcomes and clipping follow the
[range summary rules](../domain/history.md#range-summaries) for a one-day range.

Selecting any non-empty stat reveals the Tasks that contributed to it. Created,
Completed, and Cancelled show the recorded time; Incomplete and Worked on
show each Task's Worked time for the day. Selecting a Task opens its
detail panel. A Task is counted once in each lifecycle stat even if it reaches
that outcome more than once that day. Available history follows the
[Task history rules](../domain/tasks.md#history-and-deletion).

Each stat lists the Tasks one set of [table filters](#filters) would show for
that day, so Day and Table agree row for row:

| Day stat | Table filters |
|---|---|
| Created | Created on the day |
| Completed | Status Completed, Closed on the day |
| Cancelled | Status Cancelled, Closed on the day |
| Worked on | Worked on the day |
| Incomplete | Worked on the day, leaving out Tasks Closed on or before it |

The [lock](../domain/tasks.md#closing-and-the-lock) fixes a closed Task's
status after its closing day, which is why its status and Closed date now
give its outcome on that day. Incomplete has no single table query: the
table cannot select Tasks that were still open when a past day ended.

On today only, Open lists every open Task in Active, Up next, and Backlog
groups; a past day's leftovers already show as Incomplete. Within a group,
Working now Tasks lead and [Blocked](../domain/tasks.md#relationships-and-readiness)
Tasks follow the Ready ones, muted and showing how many unresolved Blockers they
have. Other rows show the Task's Worked time today when it has any. Selecting a
row opens its detail panel.

## Table

The table filters by any set of [Task statuses](../domain/tasks.md#fields-and-status)
with Open / Closed / All presets; first visit is the Raw saved view. There is
no scope sidebar; Scope is a column filter.

### Saved views

A **saved view** names one table query: the status set, Scope, Parent, Created,
Updated, Closed, Worked on, Value, Effort, Worked time, the ordered sort rules, and the
columns: their order, widths, and which are hidden. Up to five views, including Raw, are
kept, in the order they were made; names are unique ignoring case. The built-in
Raw view (every status, no filters, no sort, default columns) cannot be renamed,
overwritten, or deleted, so there is always an unfiltered view to fall back to. Edits
made while on Raw are never kept; it always loads as built.

Changing any filter, the sort, or the columns after loading a view exposes Save
and Revert (Save is disabled on Raw), and marks each pill whose filter, sort, or
hidden columns differ from the saved query; matching the saved query again
clears it. Choosing another view switches without asking and drops unsaved
changes. The picker's "Save current as view" row names the current query as a
new view and selects it; it is disabled while the table still matches the
selected view, and when five views are already saved. A save or new view whose
query matches another view is refused with a link to switch to that one. Custom
rows reveal Rename and Delete on hover or focus; Delete confirms inline, and
deleting the selected view loads Raw. Saved views and the selected view are
remembered across launches (`nest:task-table-views`); unsaved changes are not.
When a view's Scope or Parent no longer exists, that filter is dropped from the
live query once Tasks load. The saved view is left unchanged, so the picker
shows Save and Revert until the view is saved (Revert restores the missing
filter, which is then dropped again). Saved views apply only to Table; the Map
is never filtered.

### Column menus

Each column header opens a menu, and only one menu opens at a time. The menu
offers Reset when that column is filtered or sorted. Columns with more than one
action offer Sort, Filter (Status, Scope, Parent, Created, Updated, Closed,
Value, Effort, Worked time), and Hide column (every column but Title); hovering or
clicking Sort or Filter opens its options. Title has only Sort, so its menu
shows the sort options directly. Menus dismiss on outside pointer press
(including another column trigger), Escape, or scrolling outside the menu.
Status, Created, Updated, Closed, Value, Effort, and Worked time keep their
menu open while choosing; Scope, Parent, and sort selections close their menu. Headers
indicate sort direction and highlight only when that column's filter or sort
differs from the saved view.

### Sorting

Every column sorts ascending or descending with empty values last: Title,
Scope, and Parent (by the parent's title) sort A to Z or Z to A; Status sorts
in lifecycle order; Value, Effort, and Worked time sort lowest or highest first
(Worked time uses the displayed time for the active Worked on range, or the
all-time total when unset, including an open stretch); Created, Updated, and
Closed sort oldest or newest first, with open Tasks last under Closed. Choosing a new column appends a sort rule;
changing its direction keeps its priority. Choosing the active direction again
removes only that rule. Rules apply in order to break ties, with empty values
last at each level. Sorting starts unset; removing it restores the incoming
order.

### Filters

Filters combine. Status offers Open / Closed / All and individual statuses;
Scope offers All scopes and scope paths, including descendants. Parent offers
All parents, No parent, and Tasks with direct children, with a search field
once the list passes eight options. Created, Updated, and Closed offer a dropdown of Any
date, Today, This week (Monday–Sunday, matching Calendar), This month, Last 7
days, and Last 30 days, plus From and To calendar days chosen with the in-app
date picker; either bound may be left empty. Picking a day writes the active
bound (From first, then To). Closed shows and filters by
[closed at](../domain/tasks.md#closing-and-the-lock); an open Task has no
Closed date, so any Closed filter leaves it out. Value and Effort offer All, None (unscored), and
scores 1–5; All shows every Task and ticks every score, None only unscored, and
the numbers are a set of scored values.

The table toolbar offers a standalone **Worked on** date control beside the
saved-view picker. It defaults to All dates and uses the same date presets and
From / To calendar days as the date columns. The control stays open while
choosing dates and closes on an outside press, Escape, or outside scrolling.
A Task matches
when it has positive Worked time overlapping any part of the selected range;
a stretch crossing midnight contributes to both days. Either bound may be
empty. Work history for the selected range is fetched independently of Day's
30-day window. While a newly chosen range loads, the table shows a loading
state; a failed fetch shows an unavailable state with Retry. When recorded
work changes, the rows already shown stay in place until the refreshed
history arrives.

With Worked on set, the column reads “Worked time in range”; its values,
sorting, and duration filter all use Worked time clipped to that range,
following [history range rules](../domain/history.md#records-and-ranges).
Reset in the Worked on control, choosing All dates, or removing its query pill
clears the date filter and restores all-time Worked time. The Worked time
column menu resets its duration filter and sort independently.
Created, Updated, and Closed only select rows and leave the Worked time period unchanged. Saved views keep
Worked on: presets such as This week move with the calendar, while explicit
dates stay fixed. Older saved views load with Worked on unset.

Worked time offers More than / Less than and a line of minute stops taken from
the Tasks already in view (every other filter, not this one). The line is
captured when the flyout opens so a live Working now total cannot move the
stops; matching still uses the displayed time for the active range or all time,
rounded down to whole minutes, with an inclusive threshold. For example, Less than 32m includes 32m59s.

### Query pills and result count

The count reads `42 tasks` for the current result, or `42 out of 380 tasks` when
an active filter differs from the saved view; sort and column edits keep the
simple count. Pills summarize active filters, sorting, and hidden columns. Each
pill's remove button shows on hover or focus; removing Status selects all
statuses.

Two or more filters use one `Filter: N rules` pill that opens a list of
individually removable filters, each marked when it differs from the saved
view. A single sort uses an arrow-and-column pill with a remove button. Two or
more sorts use one `Sort: N rules` pill that opens a list of those same pills.
List order determines priority: newly sorted columns append to the list. Drag a
rule by its grip to reorder it; the focused grip also supports Up / Down arrow
keys. Directions change through column-header menus; each pill removes its
rule. Inside the sort list, each rule is marked separately when its column,
direction, or priority differs from the rule at that position in the saved
view. Existing saved views with a single sort load it as the first rule.

Hidden columns show as one pill that names up to two columns
(`Created, Updated`); more show a count (`3 hidden`) and list every name on
hover, each with its own remove button to show just that column. The pill's
remove button shows all columns again.

Pill values stay short: score sets collapse runs of three or more into a range
(`1–3`) and a set missing one interior score into what it leaves out (`≠ 3`); a
status set missing one status reads `≠ Cancelled`. Longer values are cut off
with an ellipsis, and the full text is the pill's tooltip.

### Columns

Table columns can be reordered, resized, and hidden, and each saved view keeps
its own. Visible columns always fill the table: a resize handle trades width
with the next column and stops at each column's minimum. The last column has no
handle. When the minima are wider than the pane, the table scrolls
horizontally.

## Task details

Selecting a Task in Day or Table opens its detail panel as an overlay. The
underlying layout ignores presses; pressing the dimmed area, Escape, or the
panel's close control dismisses it. The Map shares the pane with the detail
panel. Opening details focuses the panel; closing returns focus to the
originating control when it is still available.

The status control lists every status for an open Task and for one closed
today. On a [locked](../domain/tasks.md#closing-and-the-lock) Task it shows
the closed status with its closing date and one action, "Create follow-up".
The lock is checked when the control opens, so a dashboard left open past
midnight shows it.

Details show when the Task was created and last updated, and a closed Task
also shows the date and time it was Completed or Cancelled.
Details show status, Working now, and Worked time across every day, labelled
“all time” independently of the table’s Worked on filter. Table rows
also indicate Working now. Work controls live in the [Popup's Tasks and metrics
panel](popup.md). Scope, Value, and Effort can be edited in details. The
description is edited in place and the editor grows with its text: Enter saves,
Shift+Enter breaks the line, Escape cancels, and leaving the field saves.
Parent, Children, Blocked by, and Blocks (only when the Task blocks others) are
labelled rows in the panel. An empty row names its state ("No parent", "No
children", "No blockers"); once a row lists Tasks, its control reads "Add
child…" or "Add blocker…". Each Blocker row's status dot
shows whether it is Completed.

## Creating Tasks

The "New task" button is available in Day and Table and opens
the new-task card as an overlay. Only the name is required; Status (default
Backlog), Description, Scope, Parent, Value, Effort, and Blockers are optional.
In Table, a fresh draft takes the view's Status when it shows exactly one and
its Scope filter. In Day, a fresh draft starts unscoped with Status Backlog. Pressing
outside the card, Escape, or Cancel dismisses it and keeps the draft for the
next open; adding clears the draft and opens the new Task's detail panel.

## Map

Map is a free-form canvas the user arranges by hand. Each placed Task is an
**entity box** showing its title and attributes (status, scope, value / effort,
and parent, children or blocked by when they apply). The canvas is far larger
than the screen and is panned by dragging bare canvas, zoomed with the wheel
about the pointer or with the zoom controls; pan and zoom are remembered
(`nest:task-map-view`). Open Tasks wait in the **Map sidebar**; dragging one
onto the canvas drops it wherever the pointer is, and clicking it drops it in
view. Boxes go anywhere and may overlap. The distinction between placement and
relationships lives in [Tasks domain](../domain/tasks.md#relationships-and-readiness). Connectors
are solid from Parent to child, dashed from Blocker to the Task it blocks.
Completed and Cancelled boxes stay on the Map, so a chain still reads end to
end; drag a box back to the sidebar, or use its remove button, to take it off.
Relations are added and removed in the detail panel, not on the Map. Positions
live in the browser (`nest:task-map-v2`), keyed by Task id, and are dropped when
the Task is deleted.

### Map sidebar

The Map sidebar lists all unplaced open Tasks. "Add an active task" creates an
unscoped Active Task and opens its details. The sidebar collapses to a button
showing the unplaced open Task count.
