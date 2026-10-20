# Notes interface

Stickies, Note Board, saved-note browsing, and Tags. Domain words live in
[`CONTEXT.md`](../../CONTEXT.md). Editor ownership, caret, and TipTap behavior
live in [`docs/interface/editor.md`](editor.md). Shared dashboard controls live in
[`UI.md`](../../UI.md).

Domain rules live in [Notes domain](../domain/notes.md).

## Capture

The text supports emphasis, per-row sizes, and bulleted, numbered, checklist,
and collapsible lists. The popup and the Notes Section on Today share
the text and selected-tag draft (Cmd/Ctrl+Enter to save), persisted in
`nest:note-draft` and `nest:note-draft-tags`. A save clears that draft, or
removes a sticky, only when its text and Tags have not changed since that
save started. The Today composer and popup editor headers show the current
clock time, updating each minute.
Shift+Enter on the Today composer peels the live draft into a floating
sticky. The popup browses the five most recent saved notes. Saved checklist
boxes show their recorded state in history, Timeline, and Calendar Logs; edit
the content by forking it into a draft.

## Saved notes

Expanding a saved note in Timeline opens a read-only sticky, and it closes on
an outside click or Escape. It has no editing or action controls; collapsible
lists are unfolded for reading. The Notes Section shows one local
calendar day through the [shared day navigation](time-surfaces.md#dates-and-ranges). The Tag filter
lives in the Section sidebar, with one row per Tag and a count of saved notes
on the selected day beside each name. All tags clears the filter and shows the
day’s total. The list scrolls while Add tag stays pinned at the bottom. When
the sidebar collapses, the filters move above the saved notes. Right-clicking a
Tag (or Shift+F10 while focused) opens Rename and Delete actions; deletion asks
for confirmation.
History shows saved-sticky previews, newest first, that open the same sticky.
On Today, a writeable composer leads the grid of previews.
Each preview's `…` menu adds or removes Tags on that saved note right away. A
top-right control copies that note into a new floating draft; the saved note
stays.
Timeline can edit a saved note's Tags, and fork a saved note into a new unsaved
floating draft (text and Tags).

## Floating drafts

The Today composer can be peeled into movable floating
drafts (Shift+Enter, or the header control) and resized. Each draft has a
paper color (paper, blush, sage, sky, or lilac) picked from swatches in its
header; drafts persist in `nest:floating-notes`.

## Note Board

A **Note Board** sits on the same overlay as those floating drafts, on every
Section: a moveable, resizeable frame that is always present, even when empty.
Dragging a floating draft onto the expanded board docks that draft as a row
(the collapsed summary, with no expand). The minimised bar is not a drop
target. While the draft is held over the expanded board, the sticky itself is
hidden and a preview row appears in the list. Dragging a row out restores the
draft as a free sticky at the drop point, still expanded or minimised as it
was, snapped fully on screen. The board itself can be minimised to a single
row labelled Note Board, which counts the rows it is hiding. Its geometry persists in
`nest:floating-note-board`. Hiding stickies
still only hides free drafts; docked rows stay in the board.

## Tags

The composer shows selected Tags followed by the five most recently used
unselected Tags; its overflow menu lists every Tag. Tag validation and deletion follow the
[domain rules](../domain/notes.md#tags).
