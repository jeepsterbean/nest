# Tasks interface

Table, Map, and Task details interactions. Records and lifecycle rules live in
[Tasks domain](../domain/tasks.md), shared terminology in
[`CONTEXT.md`](../../CONTEXT.md), and dashboard controls in [`UI.md`](../../UI.md).

Tasks opens in Table on each visit. Settings can enable the Table / Map switch;
hiding Map returns to Table and closes Task details.

## Table

First visit selects Raw. The Section sidebar holds saved views and
[active rules](#active-rules-and-result-count); collapsing it moves the query
above the table. The result count sits left above the table, New task right.
Table rows indicate Working now.

### Columns and menus

Columns can be reordered, resized, and hidden, except Title stays visible.
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
text alphabetically (Parent by title), Status in lifecycle order, scores and
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
to Backlog, with Description, Parent, Value, and Effort optional.
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

Details show creation, latest update, and closure timestamps, status, Working now,
and Worked time labelled “all time”, independently of Table filters. Work controls
live in the [Popup](popup.md). Value and Effort are editable. Description
editing saves on Enter or blur, inserts a line break on Shift+Enter, and cancels
on Escape.

### Relationships

Details show Parent and Children. Empty states read “No parent” or “No children”;
populated Children lists use “Add child…”.
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
