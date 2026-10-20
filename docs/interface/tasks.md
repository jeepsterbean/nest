# Tasks interface

Table, Map, and Task details interactions. Records and lifecycle rules live in
[Tasks domain](../domain/tasks.md), shared terminology in
[`CONTEXT.md`](../../CONTEXT.md), and dashboard controls in [`UI.md`](../../UI.md).

Each pane opens in Table after launch. Section switches, including visits to Recap,
preserve each pane's Table / Map selection, query changes, collapsed Parents, drafts,
and scroll position. Leaving Tasks closes Task details, creation dialogs, and query
menus. Settings can enable the Table / Map switch for the selected pane; hiding Map
returns panes to Table and closes Task details.

## Table

First visit selects Raw in a single pane. The Section sidebar lists saved views
as rows under a New task action. New task applies to the selected pane, whose
heading is highlighted. Nest by Parent is a toggle beside Filters, Sort, and
Hidden above the table. Collapsing the sidebar moves its controls into the
selected pane. Saved-view creation lives only in the pane heading's view menu. Each pane's heading shows its view and result count.
Filters, Sort, and Hidden open rule menus in a row above its table. Table rows
indicate Working now.

### Split panes

Drag a saved-view row onto a pane's left, right, top, or bottom edge to open it
in a new split. A preview shows the destination before release. Splits can be
nested in either direction. Dropping a saved view in the center loads it in that
pane, discarding that pane's unsaved query changes. Clicking a saved-view row
also loads it in the selected pane. Each pane's heading offers a view picker.

Drag a pane's grip to an edge of another pane to move it, or to the center to
swap their positions. Moving preserves its query, drafts, and table scroll
position. Dropping outside the workspace or onto the source pane leaves the
layout unchanged. Escape cancels a view drag.

Each pane keeps independent filters, sorts, columns, Nest by Parent, collapsed
Parents, and scrolling. Task edits update shared records in every pane; a Task
may appear in several panes when it matches their filters. Saving a view updates
its definition everywhere: other panes with that view refresh when their query
is unchanged, while panes with unsaved changes keep their local query. Revert
loads the latest saved definition. Deleting a view returns every pane showing
it to Raw.

Clicking or focusing a pane selects it. Drag dividers to resize; double-click a
divider to balance its split. Focused dividers support arrow keys and Home to
balance. Alt + an arrow key on a saved-view row or pane grip opens that view in
a split in the chosen direction. Escape during a divider drag restores the
previous proportions. Closing a pane expands its neighbor; the final
pane stays open. A workspace holds at most 16 panes; splitting past that does nothing. On narrow windows, the workspace scrolls to retain readable
pane sizes.

The layout, divider proportions, each pane's selected view, and selected pane
persist in `nest:task-pane-workspace`. Reload restores saved queries and discards
unsaved query changes. Pane state stays mounted across layout rearrangements.

### Columns and menus

Columns can be reordered, resized, and hidden, except Title stays visible.
Resizing trades width with the next column within their minimum widths; the last
column has no resize handle. Columns fill the pane or scroll horizontally when
their minimum widths exceed it.

Headers offer Sort, supported Filters, Hide column, and Reset for an active
filter or sort. Title opens sort options directly. Sort and Filter options open
on hover or click. Only one column or rule editor opens per pane at a time; outside press,
Escape, or outside scrolling dismisses it. Parent and sort selections
close the menu; other column filter selections keep it open.
Choosing a rule option or pressing Escape returns focus to its rule trigger;
if the rule disappears, focus moves to a surviving nearby query control.
Each heading has a property icon. Drag the heading to reorder; click it to open
its menu. Heading boundaries appear on hover or keyboard focus. Headers highlight
filter or sort changes from the saved view; sort directions remain available in
the menus and Sort rules.

### Filters

Filters combine. Parent, Worked on, Status changed, and Worked time have no
columns, so they cannot be sorted or hidden; they exist only as Filters. The
Filters heading's “+” lists every filter without a row. Picking one adds its
row and opens its editor; closing the editor with nothing set removes the row
again. “+” is disabled once every filter has a row, and stays above the table
when the sidebar is collapsed.

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

With Worked on set, the Worked time filter measures time clipped to the range under
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
text alphabetically, Status in lifecycle order, scores numerically, and dates
chronologically.

New columns append sort rules; changing direction preserves priority, and choosing
the active direction removes the rule. Rules break ties in order. Drag rules to
reorder them, or use Up / Down on the focused grip. Sorting starts unset;
clearing it restores incoming order.

### Nest by Parent

“Nest by Parent” regroups the rows the current filters and sorts produce, each
Task under its [Parent](../domain/tasks.md#relationships), indented, with a
chevron to collapse or expand its Children. It changes display only: the result
count, filters, and Worked time filter stays as it is. A Task whose Parent is
not in the result shows at top level, so every filter still lists all its
matches. Sorting orders siblings within each Parent and roots among themselves
rather than the whole list. All Tasks start expanded, and collapse state resets
on reload.

### Active rules and result count

The count sits in each pane heading and reads `42 tasks`, or `42 out of 380 tasks`
when an active filter differs from the saved view. Sort and column changes keep
the simple count.

Filters, Sort, and Hidden list rules with active counts. Empty groups retain their
headings in the sidebar and disappear above the table. With no filters, sorts, or
hidden columns, the sidebar says “Add filters with +, and sort from the column headers.”

Filter rows open the same editor as column menus, with Reset when set. Clearing
a filter keeps its row until the editor closes. Sort rows offer both
directions; choosing the active direction removes the rule. Remove clears one
rule (Status returns to All); Filters and Sort offer Clear at two or more rules.
Hidden rows restore individual columns; Show all appears at two or more.

Rules mark differences from the saved view: filter values, sort column/direction/
priority, and columns newly hidden. Score labels compress runs of three or more
(`1–3`) or one missing interior score (`≠ 3`); status labels compress one missing
status (`≠ Cancelled`). Truncated values expose their full text in a tooltip.

### Saved views

A saved view keeps all filters, ordered sorts, Nest by Parent, and column order,
widths, and visibility. Up to five views, including Raw, appear in creation order; names are
unique ignoring case. Raw always loads all statuses, no filters or sorts, and
default columns. It cannot be renamed, overwritten, or deleted.

Changes expose Save and Revert; Save is disabled on Raw. Matching the selected
view clears the changed state. Switching views discards unsaved changes.
Each saved view has an icon shown before its name in the sidebar and the view
menu. A new view gets a random icon no saved view uses; clicking the icon opens a
grid to change it. Raw's icon is fixed, and a view saved before icons existed
receives one on load. Escape closes the icon grid and returns focus to its
trigger, keeping the view menu open.

“Save current as view” creates and selects a view, and is disabled when the query
matches the selected view or five views exist. Duplicate queries are refused
with a link to the matching view.

Custom views support Rename and inline-confirmed Delete. Deleting the selected
view loads Raw. Saved views persist across launches; pane selection and query restoration follow
[Split panes](#split-panes). Saved views apply only to Table; Map remains unfiltered.

Missing Parent filters are dropped after Tasks load, leaving the saved
view unchanged and the query marked changed. Revert restores the missing filter,
which is dropped again. Older views default Nest by Parent off, Worked on and Status changed to unset
and load a legacy single sort as the first rule.

## Creating Tasks

Table’s “New task” opens an overlay. Only the name is required; Status defaults
to Backlog, with Description, Parent, Value, and Effort optional.
A fresh draft inherits the view’s Status when exactly one is selected.
Outside press, Escape, or Cancel closes the card and preserves the draft.
Adding clears the draft and opens the new Task’s details. Each pane keeps its
own creation draft; New task uses the selected pane.

## Task details

### Opening and closing

Table details open as a modal overlay across the Tasks workspace, making the
other panes and sidebar controls inert; Map shares its pane with details.
Outside press, Escape, or Close dismisses the overlay. Opening focuses details;
closing restores focus to the originating control when available.

### Status, fields, and work

The status control offers every status for open Tasks and Tasks closed today.
For [locked Tasks](../domain/tasks.md#closing-and-the-lock), it shows the closed
status, closing date, and “Create follow-up”. It checks the lock when opened.

Details show creation, latest update, and closure timestamps, status, Working
now, and all-time Worked time in whole minutes (“<1m” under a minute),
independently of Table filters. Worked time is hidden while it is zero and the
Task is not Working now. Work controls live in the [Popup](popup.md). Value and
Effort use five selectable dots. Clicking the selected dot clears it; arrow keys
adjust the score, 1–5 sets it, and 0, Backspace, or Delete clears it. Description grows with its content up to a scrollable maximum. Relationships
follow Description, then independently scrolling History. Description editing saves on Enter or blur, inserts a line
break on Shift+Enter, and cancels on Escape.

The Table Status column shows the status icon and name, with no dropdown caret.
Clicking the icon or name opens the status selector.
Status icons distinguish Backlog (dashed ring), Up next (ring), Active (half-filled ring),
Completed (check), and Cancelled (cross).

### Relationships

Details group Parent and Children under Relationships. Each group shows its
open / total count; Completed and Cancelled count as closed. Its + picker offers
“Create new task” and existing Tasks. Creating opens New task with the current
Task prefilled as Parent or Child; the relationship saves on Add task and
dismissing preserves the draft. Choosing a Parent replaces the previous Parent.
Each linked row offers Unlink, a title that opens its details, and a status
control. Browsing related Tasks preserves the original row as the focus
return destination when details close. Unlink keeps both Tasks.

Parent pickers (including New task) and the existing-child picker default to
open Tasks and Tasks closed within the last seven days, sorted newest updated
first. Recency uses closure time, so editing an older closed Task keeps it
outside the default list; the current Parent stays in the default list even
when closed. Title search adds older closed Tasks after open and recently
closed matches, and Enter in the search chooses the first match. Options show
status. Relationship pickers use all Tasks independently of Table filters.
Pickers exclude the Task itself and choices that would create a cycle; the
child picker also excludes existing direct Children.
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
