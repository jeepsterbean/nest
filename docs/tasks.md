# Tasks layouts

Table and Map behavior. Domain words live in [`CONTEXT.md`](../CONTEXT.md).
CSS hooks and persistence keys live in [`UI.md`](../UI.md).

The Tasks pane icon is picked from the Core sidebar and also heads the Overview
Tasks tile. The Core Section icon is picked separately on the main Sidebar.

## Table

Table is the default Tasks layout (Map is the other); last choice is
remembered (`nest:task-view`). The table filters by any set of persisted
statuses — Backlog, Up next, Active, Completed, Cancelled — with Open /
Closed / All presets; first visit is the Raw saved view.

### Saved views

A **saved view** names one table query: the status set, Scope, Parent,
Created, Updated, Value, Effort, Worked time, the ordered sort rules, and the columns:
their order, widths, and which are hidden. Views saved before they carried columns
take the layout every view shared then. The view picker leads the
toolbar, alongside its filter pills and task count. Up to five
views are kept, in the order they were made; names are unique ignoring case.
The built-in Raw view (every status, no filters, no sort) cannot be renamed,
overwritten, or deleted, so there is always an empty view to fall back to.
The picker trigger is a fixed 10-character field so switching views does not
shift the pills; names are at most 10 characters, and longer ones ellipsize.

Changing any filter, the sort, or the columns after loading a view replaces the picker chevron with Save and Revert icons (Save is disabled on Raw), and marks each pill whose filter,
sort, or hidden columns differ from the saved query with a stronger neutral border and tint; matching
the saved query again clears it. Choosing another view switches without asking and drops unsaved
changes, because a few filter changes are quick to redo. The picker's "Save
current as view" row names the current query as a new view and selects it; it
is disabled while the table still matches the selected view, and when five
views are already saved. A save or new view whose query matches another view
is refused with a link to switch to that one. Custom rows reveal Rename and Delete on hover or focus; Delete
confirms inline, and deleting the selected view loads Raw. The selected view
is remembered across launches; unsaved changes are not. When a view's Scope
or Parent no longer exists, that filter is dropped once Tasks load, which
marks the view edited until it is saved or reverted. Views apply to the Table
only: the Map is never filtered, and its composer adds unscoped Tasks.

The header holds Table / Map. Sorting and filtering live in column-header
menus. Each menu starts with the column name and a Reset link (shown only when
that column is filtered or sorted). Below it, a column with more than one
action lists them as rows — Sort, Filter (Status, Scope, Parent, Created,
Updated, Value, Effort, Worked time), and Hide column (every column but Title) — and hovering or clicking
Sort or Filter
opens its options in a flyout beside the menu. The Sort and Filter rows show
the active sort or filter as a muted hint. Title has only Sort, so its menu
shows the sort options directly. Hidden columns show as one toolbar pill with
a crossed-out eye: up to two hidden columns are named (`Created, Updated`);
more show a count (`3 hidden`) and list every name on hover, each with its own
remove button to show just that column. Its remove button
shows them all again; Clear leaves it alone. Every column
sorts ascending or descending with empty values last: Title, Scope, and Parent
(by the parent's title) sort A to Z or Z to A; Status sorts in lifecycle order; Value,
Effort, and Worked time sort lowest or highest first (Worked time uses the
displayed total, including an open stretch); Created and Updated sort
oldest or newest first. Choosing a new column appends a sort rule; changing its direction keeps its priority. Choosing the active direction again removes only that rule. Rules apply in order to break ties, with empty values last at each level. Sorting
starts unset; removing it restores the incoming order.
Status offers Open / Closed / All as a segmented control above the individual
statuses; Scope offers All scopes and scope paths, including descendants.
Parent offers All parents, No parent, and Tasks with direct children, with a
search field once the list passes eight options. Created and Updated offer a dropdown of Any date, Today, This week
(Monday–Sunday, matching Calendar), This month, Last 7 days, and Last 30 days,
plus From and To calendar days painted with the shared DayCalendar; either
bound may be left empty. Picking a day writes the active bound (From first,
then To). Value and Effort offer All and None (unscored) as a segmented control
above 1–5; All shows every Task and ticks every score, None only unscored,
and the numbers are a set of scored values. Worked time offers More than / Less than as a segmented control and a single
line of minute stops taken from the Tasks already in view (every other filter,
not this one). The line is captured when the flyout opens so a live Working
now total cannot move the stops; matching still uses the displayed total
(banked plus the open stretch), inclusive of the chosen minute. Filters combine. Selection is
shown by a trailing check; filter options show labels without counts.
New task sits on the Table / Map row, flush right, and shows only in Table.
The toolbar places the view picker and count on the same row. The count reads
`42 tasks` for the current result, or `42 out of 380 tasks` when an active
filter differs from the saved view; sort and column edits keep the simple count.
The picker
row continues with pills when something shapes the table: a quiet pill for a single active filter (field name muted,
value emphasized), sorting, and the hidden-columns pill. Two or more filters
use one `Filter: N rules` pill that opens a list of individually removable
filters, each marked when it differs from the saved view. A single sort
uses an arrow-and-column pill with a remove button. Two or more sorts use
one `Sort: N rules` pill that opens a vertical list of those same pills.
List order determines priority: newly sorted columns append to the list.
Drag a rule by its grip to reorder it; the focused grip also supports Up / Down arrow keys.
Directions change through column-header menus; each pill removes its rule.
Inside the sort list, each rule is marked separately when its column, direction,
or priority differs from the rule at that position in the saved view.
Existing saved views with a single sort load it as the first rule.
Each pill's remove button shows on hover or focus; removing Status selects
all statuses. Pill values stay short: score sets collapse runs of three or
more into a range (`1–3`) and a set missing one interior score into what it
leaves out (`≠ 3`); a status set missing one status reads `≠ Cancelled`.
Longer values are cut off with an ellipsis, and the full text is the pill's
tooltip.
Headers indicate sort direction. They highlight only when that column's filter
or sort differs from the saved view. Only one column menu opens at a time. Menus dismiss on outside pointer press
(including another column trigger), Escape, or scrolling outside the menu.
Status, Created, Updated, Value, Effort, and Worked time keep their menu open
while choosing; Scope, Parent, and sort selections close their menu.
There is no scope sidebar. Table
columns can be reordered, resized, and hidden, and each saved view keeps its own. Visible
columns always fill the table: a resize handle trades width with the next
column and stops at each column's minimum. The last column has no handle.
When the minima are wider than the pane, the table scrolls horizontally.
Task rows keep a fixed height as columns change. Text stays on one line and
truncates with an ellipsis; hovering a truncated title reveals its full text.
Working now is started from the detail panel, not from the table or the Map.
Selecting a table row opens that panel as an overlay over the table. The panel
fills the workspace vertically and takes the right half of the table, becoming
full-width on narrow screens. The table dims and ignores presses; pressing the
dim, Escape, or the panel's close control dismisses it. The Map still shares
the pane with the detail panel.

The detail panel's header holds the status, a breathing dot while the Task is
Working now, and Worked time. It does not start or stop work. Directly below
the title, Scope, Value, and Effort share one compact row; Value and Effort use
dropdowns. The description follows as body text; an empty one shows a two-line box to write in. It is edited in
place and the editor grows with its text: Enter saves, Shift+Enter breaks the
line, Escape cancels, and leaving the field saves.
Parent, Children,
Blocked by, and Blocks (only when the Task blocks others) are labelled rows
at the bottom of the panel, directly above Created and Updated. An empty row
names its state ("No parent", "No children", "No blockers");
once a row lists Tasks, its control reads "Add child…" or "Add blocker…".
Ready / Blocked has no badge: each Blocker row's status dot shows whether it is
completed. In the full-height table panel the relations and dates sit at the
bottom; the in-flow Map panel is as tall as its content, so they follow the
description directly.

The "New task" button opens the new-task card as an overlay.
Only the name is required; Status (default Backlog, or the view's status when
it shows exactly one), Description, Scope
(seeded from the table's Scope filter), Parent, Value, Effort, and Blockers are
optional. Pressing outside the card, Escape, or Cancel dismisses it and keeps
the draft for the next open; adding clears the draft and opens the new Task's
detail panel. The Map sidebar keeps its one-line "Add an active task"
composer, which creates Active tasks.

## Map

The other Tasks layout: a free-form canvas the user arranges by hand, drawn
like a data model. Each placed Task is an **entity box** — a title header over
attribute rows (status, scope, value / effort, and parent, children or blocked
by when they apply). The canvas is far larger than the screen and is panned by
dragging bare canvas, zoomed with the wheel about the pointer or with the
corner zoom controls; pan and zoom are remembered (`nest:task-map-view`).
Open Tasks wait in the **Map sidebar**; dragging one onto the canvas drops it
wherever the pointer is, and clicking it drops it in view. Boxes go anywhere
and may overlap; a box's position is only the user's arrangement and never
creates or implies a relation. Connectors are right-angled and arrowed: solid
from Parent to child, dashed from Blocker to the Task it blocks. Completed
and Cancelled boxes stay on the Map, dimmed, so a chain still reads end to
end; drag a box back to the sidebar, or use its remove button, to take it
off. Relations are added and removed in the detail panel, not on the Map.
Positions live in the browser (`nest:task-map-v2`), keyed by Task id, and are
dropped when the Task is deleted.

`taskGraph` / `TaskGraphProjection` indexes Parent/Child and Blocker/Dependent
edges for both layouts and the detail panel. The Map draws those edges as an
SVG overlay; hooks and constants live in `UI.md`.

## Map sidebar

The panel floating over the Map canvas: an "Add an active task" row above the
list of open Tasks not yet placed. It collapses to a button showing that count.
The Map is not scope-filtered — the sidebar lists every open Task.
