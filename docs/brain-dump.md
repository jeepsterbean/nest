# Brain dump capture

Stickies, Note Board, saved-dump browsing, and Tags. Domain words live in
[`CONTEXT.md`](../CONTEXT.md). Editor ownership, caret, and TipTap behavior
live in [`docs/editor.md`](./editor.md). CSS hooks live in [`UI.md`](../UI.md).

## Capture

Overview, the popup, and the Core Brain dump pane on Today share the text and
selected-tag draft (Cmd/Ctrl+Enter to save). The Core Today composer header
shows the current clock time, updating each minute. Shift+Enter on Overview or the Core
Today composer peels the live draft into a floating sticky. Overview and the popup independently
browse the five most recent saved dumps. Saved
checklist boxes show their recorded state in history, Timeline, and Calendar Logs; edit the
content by forking it into a draft.

## Saved dumps

Expanding a saved dump in Timeline opens a read-only sticky 12px to the right of
the cursor, centered at its height, and it closes on an outside click or
Escape. It has no editing or action controls; collapsible lists are unfolded
for reading. The Brain dump pane of Core shows one local calendar day, starting at Today.
Previous and next arrows move one day at a time; the double-forward arrow
returns to Today. Next day is disabled on Today, keeping navigation within
Today and earlier days. Previous day has no earliest bound: days older than
the dashboard's 30-day history window are fetched one day at a time. Today
follows the clock across midnight; selected historical dates stay fixed. The
day navigator shares its controls with Calendar and Timeline. A horizontally scrolling Tag
filter strip sits on its own row below the day navigator, with All tags to clear the filter and an Add tag
button pinned at the right. Right-clicking a Tag (or Shift+F10 while focused)
opens Rename and Delete actions; deletion asks for confirmation.
History shows compact saved-sticky previews, newest first, that open the same
sticky. On Today a writeable composer occupies six cells (three rows by two
columns) of that grid. The three dumps beside it are two columns wide and one
row tall; from the fourth row, dumps are single cells. When the pane fits
fewer than four columns, the composer spans the full row and every dump is a
single cell.
Each preview pins a Tag strip to its bottom edge: its Tags scroll
sideways, and the `…` menu pinned at the right adds or removes Tags on that
saved dump right away. A top-right control copies that dump into a new
floating draft; the saved dump stays.
Timeline can edit a saved dump's Tags, and fork a saved dump into a new unsaved
floating draft (text and Tags). A saved brain dump being browsed in Overview
can also be copied into a new floating draft.

## Floating drafts

Overview drafts and the Core Today composer can be peeled into movable floating
drafts (Shift+Enter, or the header control) and resized from their lower-right
corner.

## Note Board

A **Note Board** sits on the same overlay as those floating drafts, on every
Section: a moveable, resizeable frame that is always present, even when empty.
Dragging a floating draft onto the expanded board docks that draft as a row
(the collapsed summary, with no expand). The minimised bar is not a drop
target. While the draft is held over the expanded board, the sticky itself is
hidden and a preview row appears in the list. Dragging a row out restores the
draft as a free sticky at the drop point, still expanded or minimised as it
was, snapped fully on screen. The board itself can be minimised to a single
row labelled Note Board, which counts the rows it is hiding. Hiding stickies
still only hides free drafts; docked rows stay in the board.

## Tags

The composer shows selected Tags followed by the five most recently used
unselected Tags; its overflow menu lists every Tag. Deleting a Tag removes it
from every historical brain dump.
