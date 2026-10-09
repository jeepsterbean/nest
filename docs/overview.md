# Overview

The Overview Section: a tile board, its saved layouts, and the Greetings
board. Shared date, Last hour, and Logs kind rules live in
[`docs/time-surfaces.md`](./time-surfaces.md). Domain words live in
[`CONTEXT.md`](../CONTEXT.md). Shared dashboard controls live in
[`UI.md`](../UI.md).

## Simplified view

`SIMPLIFIED_VIEW` in `src/lib/simplifiedView.ts` enables the simplified interface.
When enabled, the dashboard starts on Calendar and offers Calendar and Core;
Overview, Assistant, and Settings are hidden. Setting it to `false` restores
all sections and Overview startup. Saved data and configuration remain in place,
including the background preferences used by the dashboard.

## Tile board

Overview is a persistent tile board with a Last hour summary, a read-only
Tasks peek (Status, Title, Value, Effort) with Open / Closed and a button that
opens Core on the Tasks pane, a Timeline of the 30-day happenings, a brain
dump composer that matches the popup (shared text and tag draft,
Cmd/Ctrl+Enter to save), and Metric check-in scoring.
Tiles can be hidden into the always-present control panel. Clicking a hidden
tile's chip restores it minimised at the first free spot; dragging the chip onto
the board drops it there when it fits. Moving a tile pushes its neighbours into
free space; when none can move, it trades places with the tile it covers most, and
the move is refused if either tile would fall below its minimum size. Metric
check-in is pinned to 4×2 and is not resizable, so it only moves once the board
has slack. Below
861px the tiles stack in board order and cannot be dragged or resized. The
board persists in `nest:overview-layout`. Tasks, Timeline, and Brain dump can be minimised to
counts, the three newest events, and a one-line capture field. Both capture
surfaces can independently browse the five most recent dumps as read-only
text with their tags. Full dump history lives in Timeline.

The Last hour tile is [Insights](./calendar.md#insights) for the rolling
[Last hour](./time-surfaces.md#last-hour): Phases, Brain dumps, Tasks, and
Metrics side by side, wrapping as the tile narrows and scrolling inside the
tile once an opened group outgrows it. Clicking its icon opens Calendar on
Last hour with Insights shown so the summary stays in view. A quiet hour
still shows every section, with 0s rather than gaps.

The Timeline tile uses the [Timeline](./calendar.md#timeline) list and its
formatting: marks, day labels, settled Phase rows when Phases is on, and
time-column coloring from the Phase in force. The minimised peek hides that
day chrome. Its [Logs kinds](./time-surfaces.md#logs-kinds) filter is
independent of Timeline's, with the Phases-only eye and load-older batching
when needed. It shows no Phase totals.

## Settings panel

Overview has its own configuration panel that opens over the right side of
the tile board from the Greetings board, closed by default. It lets
the user choose the Control panel and Timeline icons, stored with the other tile
icons in `nest:overview-tile-icons`. It closes on its close control, Escape, or
a press outside it, and its button sits on the Greetings board, so it cannot
open while Doing hides the board. The Overview Section icon is picked
from the Sidebar. Feature tiles (Tasks, Timeline, Brain dump, Metric check-in)
take their icon from their own pane (Tasks, Brain dump, and Metrics are Core
panes; Timeline is configured beside Control panel in Overview settings), and Last hour always uses the
Insights icon. General Settings contains no Last hour or Control panel panes.

## Saved grid layouts

Up to five **saved grid layouts** sit in the Overview Section sidebar, in the
order they were made, each with a name and a picked icon. Re-saving one does
not move its row. Choosing one loads it onto the board. Any change to the
board after that (move, resize, minimise, hide, or show) marks the selected
layout as having unsaved changes; moving a tile back does not clear it. Save
writes the board over that layout and Revert reloads it. Choosing another
layout while there are unsaved changes asks first: Save and switch, Discard,
or Cancel. When the board belongs to no saved layout, that prompt offers
Save as new instead, which names the current board and then switches. At five
saved layouts that action is unavailable until one is deleted. Saved layouts
are compared only on save: a save or a new layout whose arrangement matches
another saved layout is refused with a link to switch to that one. Names are
unique, ignoring case. New layout saves the current board and is unavailable
at five. Deleting the selected layout leaves the board as it is, belonging to
no saved layout, and switching away from that board also asks first.
A layout name field saves its text when the user presses outside it, without
activating the control under the pointer. Below 861px, name fields, Save ·
Revert, and prompts open beside the rail. Layouts persist in
`nest:overview-layout-snapshots` and the selection with its edited flag in
`nest:overview-layout-selection`.

## Greetings board

Overview shows the **Greetings board** except while Phase is Doing; every
other Section always gives its content the full content area beside the
Sidebar.
