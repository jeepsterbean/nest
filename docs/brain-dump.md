# Brain dump capture

Stickies, Note Board, saved-dump browsing, and Tags. Domain words live in
[`CONTEXT.md`](../CONTEXT.md). Editor ownership, caret, and TipTap behavior
live in [`docs/editor.md`](./editor.md). CSS hooks live in [`UI.md`](../UI.md).

## Capture

Overview and the popup share the text and selected-tag draft, and independently
browse the five most recent saved dumps (Cmd/Ctrl+Enter to save). Saved
checklist boxes show their recorded state in history and Logs; edit the
content by forking it into a draft.

## Saved dumps

Expanding a saved dump in Logs opens a read-only sticky 12px to the right of
the cursor, centered at its height, and it closes on an outside click or
Escape. It has no editing or action controls; collapsible lists are unfolded
for reading. Settings → Brain dump shows compact saved-sticky previews that
open that same sticky, newest first, filtered by the past 1, 3, or 7 days and
by Tag. The range defaults to 7 days and measures back from the current time.
Logs can edit a saved dump's Tags, and fork a saved dump into a new unsaved
floating draft (text and Tags). A saved brain dump being browsed in Overview
can also be copied into a new floating draft.

## Floating drafts

Overview drafts can be peeled into movable floating drafts and resized from
their lower-right corner.

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
