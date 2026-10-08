# Tasks layouts

Table and Map behavior. Domain words live in [`CONTEXT.md`](../CONTEXT.md).
CSS hooks and persistence keys live in [`UI.md`](../UI.md).

The Tasks pane icon is picked from the Core sidebar and also heads the Overview
Tasks tile. The Core Section icon is picked separately on the main Sidebar.

## Table

Table is the default Tasks layout (Map is the other); last choice is
remembered (`nest:task-view`). The table filters by any set of persisted
statuses — Backlog, Up next, Active, Completed, Cancelled — with Open /
Closed / All presets; first visit is Open.

The header holds Table / Map. Sorting and filtering live in column-header
menus. Each menu starts with the column name and a Reset link (shown only when
that column is filtered or sorted). Below it, a column with more than one
action lists them as rows — Sort, Filter (Status, Scope, Parent), and Hide
column (every column but Title) — and hovering or clicking Sort or Filter
opens its options in a flyout beside the menu. The Sort and Filter rows show
the active sort or filter as a muted hint. Title has only Sort, so its menu
shows the sort options directly. Hidden columns show as one toolbar pill with
a crossed-out eye: up to two hidden columns are named (`Created, Updated`);
more show a count (`3 hidden`) and list every name on hover, each with its own
remove button to show just that column. Its remove button
shows them all again; it sits apart from the filter pills and Clear all. Every column
sorts ascending or descending with empty values last: Title, Scope, and Parent
(by the parent's title) sort A to Z or Z to A; Status sorts in lifecycle order; Value,
Effort, and Worked time sort lowest or highest first; Created and Updated sort
oldest or newest first. Choosing the active sort again removes it. Sorting
starts unset; removing it restores the incoming order.
Status offers Open / Closed / All as a segmented control above the individual
statuses; Scope offers All scopes and scope paths, including descendants.
Parent offers All parents, No parent, and Tasks with direct children, with a
search field once the list passes eight options. Filters combine. Selection is
shown by a trailing check; filter options show labels without counts.
The summary line above the table leads with the count — `380 tasks` when
nothing hides a Task, `42 of 380 tasks` otherwise — followed by pills for the
active filters and the single selected sort, then Clear all when there is more
than one pill. Each pill has a remove button; removing Status selects all
statuses.
Headers indicate active filters and sort direction. Only one column menu opens at a time. Menus dismiss on outside pointer press
(including another column trigger), Escape, or scrolling outside the menu.
Status supports multiple selections while its menu stays open; Scope, Parent,
and sort selections close their menu.
There is no scope sidebar. Table
columns can be reordered, resized, and hidden (`nest:task-table`). Visible
columns always fill the table: a resize handle trades width with the next
column and stops at each column's minimum. The last column has no handle.
When the minima are wider than the pane, the table scrolls horizontally.
Working now is started from the detail panel, not from the table or the Map.

Pills, the count, and a "New task" button share one toolbar row above the
table. The button opens the new-task card as an overlay.
Only the name is required; Status (default Backlog), Description, Scope
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
