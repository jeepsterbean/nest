# Tasks interface

Table, Day, Map, and Task details interactions. Records and lifecycle rules live in
[Tasks domain](../domain/tasks.md), shared terminology in
[`CONTEXT.md`](../../CONTEXT.md), and dashboard controls in [`UI.md`](../../UI.md).

Tasks opens in Table on each visit. The header switches between Table and Day;
Settings can add Map to the switch, and hiding Map returns to Table and closes
Task details.

## Table

First visit selects Raw. The Section sidebar holds saved views and
[active rules](#active-rules-and-result-count); collapsing it moves the query
above the table. The result count sits left above the table, New task right.
Table rows indicate Working now.

### Columns and menus

Columns can be reordered, resized, and hidden, except Title stays visible.
Parent relationships appear in details and Map; Table has no Parent column.
Saved layouts discard the retired Parent column and its sort rules.
Resizing trades width with the next column within their minimum widths; the last
column has no resize handle. Columns fill the pane or scroll horizontally when
their minimum widths exceed it.

Headers offer Sort, supported Filters, Hide column, and Reset for an active
filter or sort. Title opens sort options directly. Sort and Filter options open
on hover or click. Only one column or rule menu opens at a time; outside press,
Escape, or outside scrolling dismisses it. Parent and sort selections
close the menu; other column filter selections keep it open.
Choosing a sidebar option or pressing Escape returns focus to its rule trigger;
if the rule disappears, focus moves to a surviving nearby query control.
Headers show sort direction and highlight filter or sort changes from the saved view.

### Filters

Filters combine. Worked on and Status changed have no columns: they remain the
first two Filters rows, reading “-” when unset.

| Filter | Choices and matching |
|---|---|
| Status | Open / Closed / All presets, or a set of individual statuses. |
| Parent | All parents, No parent, or a Task with direct children. Search appears above eight options. |
| Created / Updated / Closed | Creation, latest update, or [latest closure](../domain/tasks.md#closing-and-the-lock). A Closed filter excludes open Tasks. |
| Value / Effort | All, None (unscored), or a set of scores 1–5. All ticks every score and includes unscored Tasks. |
| Worked on | Positive Worked time overlapping the range. |
| Status changed | Any recorded status transition in the range, regardless of current status. Creation-only events and ordinary edits are excluded; each Task appears once. |

Parent also stays available in Filters because it has no Table column. Selecting a
Parent matches each Task with a direct connection to it; No parent matches Tasks
with zero Parents.

Date filters offer Any date, Today, This week (Monday–Sunday), This month,
Last 7 days, Last 30 days, and From / To calendar days. Either bound can be empty;
the date picker writes the active bound, starting with From. Presets move with
the calendar; explicit dates stay fixed.

Worked on changes the column label to “Worked time in range”. Its values, sorting,
and duration filter use time clipped to the range under
[history range rules](../domain/history.md#records-and-ranges). Clearing Worked on
restores all-time totals. Other date filters only select rows.

Worked time offers More than / Less than, using whole minutes and inclusive
thresholds: Less than 32m includes 32m59s. Minute stops come from Tasks matching
all other filters and remain fixed while the flyout is open; matching uses live
displayed totals. Its Reset clears the duration filter and sort independently
of Worked on.

Worked on and Status changed history loads on demand. New ranges show loading
or unavailable with Retry; refreshing the current range keeps existing rows visible.

### Sorting

Every column sorts in either direction, with empty values last at each level:
text alphabetically, Status in lifecycle order, scores and
displayed Worked time numerically, and dates chronologically.

New columns append sort rules; changing direction preserves priority, and choosing
the active direction removes the rule. Rules break ties in order. Drag rules to
reorder them, or use Up / Down on the focused grip. Sorting starts unset;
clearing it restores incoming order.

### Active rules and result count

The count sits left above the table and reads `42 tasks`, or `42 out of 380 tasks`
when an active filter differs from the saved view. Sort and column changes keep
the simple count.

Filters, Sort, and Hidden list rules with active counts. Empty groups retain their
headings in the sidebar and disappear above the table. With no filters, sorts, or
hidden columns, the sidebar says “Filter and sort from the column headers.”

Filter rows open the same editor as column menus, with Reset when set. Clearing
a column filter keeps its row until the editor closes. Sort rows offer both
directions; choosing the active direction removes the rule. Remove clears one
rule (Status returns to All); Filters and Sort offer Clear at two or more rules.
Hidden rows restore individual columns; Show all appears at two or more.

Rules mark differences from the saved view: filter values, sort column/direction/
priority, and columns newly hidden. Score labels compress runs of three or more
(`1–3`) or one missing interior score (`≠ 3`); status labels compress one missing
status (`≠ Cancelled`). Truncated values expose their full text in a tooltip.

### Saved views

A saved view keeps all filters, ordered sorts, and column order, widths, and
visibility. Up to five views, including Raw, appear in creation order; names are
unique ignoring case. Raw always loads all statuses, no filters or sorts, and
default columns. It cannot be renamed, overwritten, or deleted.

Changes expose Save and Revert; Save is disabled on Raw. Matching the selected
view clears the changed state. Switching views discards unsaved changes.
“Save current as view” creates and selects a view, and is disabled when the query
matches the selected view or five views exist. Duplicate queries are refused
with a link to the matching view.

Custom views support Rename and inline-confirmed Delete. Deleting the selected
view loads Raw. Views and selection persist across launches; unsaved changes are
discarded. Saved views apply only to Table; Map remains unfiltered.

Missing Parent filters are dropped after Tasks load, leaving the saved
view unchanged and the query marked changed. Revert restores the missing filter,
which is dropped again. Older views default Worked on and Status changed to unset
and load a legacy single sort as the first rule.

## Creating Tasks

Table’s “New task” opens an overlay. Only the name is required; Status defaults
to Backlog, with Description, Parents, Value, and Effort optional.
Parents can be added and unlinked individually before creation.
A fresh draft inherits the view’s Status when exactly one is selected.
Outside press, Escape, or Cancel closes the card and preserves the draft.
Adding clears the draft and opens the new Task’s details.

## Task details

### Opening and closing

Table details open as a modal overlay; Map shares its pane with details.
Outside press, Escape, or Close dismisses the overlay. Opening focuses details;
closing restores focus to the originating control when available.

### Status, fields, and work

The status control offers every status for open Tasks and Tasks closed today.
For [locked Tasks](../domain/tasks.md#closing-and-the-lock), it shows the closed
status, closing date, and “Create follow-up”. It checks the lock when opened.

The Table's Status column displays the status name alone. Elsewhere in Tasks,
status names carry a status icon before them: dashed ring for
Backlog, ring for Up next, half-filled ring for Active, check for Completed,
cross for Cancelled.
Details show creation, latest update, and closure timestamps, status, Working
now, and all-time Worked time in whole minutes (“<1m” under a minute),
independently of Table filters. Worked time is hidden while it is zero and the
Task is not Working now. Work controls live in the [Popup](popup.md). Value and
Effort each use five selectable dots, filled through the selected score. Clicking
the selected dot clears the score. Arrow keys adjust it, number keys 1–5 set it,
and 0, Backspace, or Delete clears it. Description editing saves on Enter or blur, inserts a line
break on Shift+Enter, and cancels on Escape.

### Relationships

A Relationships section groups Parent and Children, with linked Tasks as rows beneath each header.
Each header shows open / total linked Tasks as “x/y open” and a + picker.
Completed and Cancelled count as closed. Empty groups show only their header controls.
Each picker starts with “Create new task”, opening the New task overlay with the
current Task prefilled as a Parent for a new Child, or as a Child for a new Parent.
The relationship is saved when the new Task is added; dismissing preserves the draft.
Linking adds a connection and keeps that Task’s other Parents. Each Parent and
Child offers Unlink to remove only that connection while keeping both Tasks.
Clicking a row’s title opens that Task’s details in place of the current ones;
clicking its status icon opens the status menu for that Task.
Existing relationships stay visible regardless of status or closure age.
Add-parent pickers (including New task) and the existing-child picker default to
open Tasks and Tasks closed within the last seven days, sorted newest updated
first. Recency uses closure time, so editing an older closed Task keeps it
outside the default list. Title search adds older closed Tasks after open and
recently closed matches, and Enter in the search chooses the first match. Options show
status. Relationship pickers use all Tasks independently of Table filters.
Pickers exclude the Task itself and choices that would create a cycle; the
add-parent picker also excludes existing Parents, and the child picker excludes
existing direct Children.
The panel scrolls to keep relationships and controls accessible.

### History

[Task history](../domain/tasks.md#history-and-deletion) appears newest first,
grouped by local calendar day. The heading follows the topmost visible day,
labelling Today alongside its date. Entries show event time and recorded changes.

“Load earlier updates” pages backward. Switching Tasks or receiving recorded
changes, including from other windows, restarts at the newest page. Loading,
empty, and unavailable with Retry states are shown; a failed earlier page keeps
existing entries and retries that page.

The end reads “Beginning of history.” Tasks predating edit recording also show
“Edits recorded since [date]”; earlier status and work entries remain available.

## Day

Day outlines the Tasks of the local day as a Parent / Child tree: every open
Task and every Task [closed today](../domain/tasks.md#closing-and-the-lock).
Day follows the clock, so Tasks closed yesterday leave at midnight, and no
filter, sort, or saved view applies.

A Task whose Parent is also in the day nests under that Parent. A Parent closed
before today stays as dimmed context while any descendant is in the day, and
leaves once none remains. Root Tasks and siblings list open work first, in
status order (Active, Up next, Backlog), then Tasks closed today by closing
time. A closed Parent holding open Children sorts with its open work.

A Child with several Parents shows in full under its first Parent in this order
and as a dimmed “also shown above” row under the others. Each Parent shows
“x/y open” for its direct Children. Rows offer the status menu and open Task
details on a title click; New task works as in Table.

## Map

Map is a manually arranged canvas. Task boxes show title, status, Value /
Effort, and applicable Parent or Children relationships. Drag bare
canvas to pan; wheel zoom centres on the pointer, and zoom controls are available.
Pan, zoom, and Task positions persist across launches; deleting a Task removes
its position. Boxes may overlap.

The Map sidebar lists unplaced open Tasks. Dragging a Task places it at the
pointer; clicking places it in view. “Add an active task” creates an
Active Task and opens details. Collapsing the sidebar shows its Task count.

Connectors run from Parent to Child.
Edit relationships in details; [placement is independent of relationships](../domain/tasks.md#relationships).
Closed boxes remain placed. Dragging a box back to the sidebar or using Remove
takes it off the canvas.
