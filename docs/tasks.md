# Tasks layouts

Table and Map behavior. Domain words live in [`CONTEXT.md`](../CONTEXT.md).
CSS hooks and persistence keys live in [`UI.md`](../UI.md).

## Table

Table is the default Tasks layout (Map is the other); last choice is
remembered (`nest:task-view`). The table filters by any set of persisted
statuses — Backlog, Up next, Active, Completed, Cancelled — with Open /
Closed / All presets; first visit is Open. New tasks are created Active.

The **Tasks scope sidebar** belongs to the table; the Map has none. Table
columns can be reordered and resized (`nest:task-table`). Working now is
started from the detail panel, not from the table or the Map.

The "Add an active task" composer is in both layouts — above the table, and
at the top of the Map sidebar.

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

## Tasks scope sidebar

The Scopes filter panel beside the Tasks table. It starts collapsed, and the
Map does not show it.
