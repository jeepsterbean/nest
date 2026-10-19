# Tasks domain

Rules shared by every Task surface. Dashboard interactions live in
[Tasks interface](../interface/tasks.md); shared terminology lives in
[`CONTEXT.md`](../../CONTEXT.md).

## Fields and status

A Task has a required, non-empty title and a description, which may be
empty. Parent, Value, and Effort are optional. Value and Effort are 1–5 scores.

Task statuses are Backlog, Up next, Active, Completed, and Cancelled.
Completed and Cancelled are closed; the others are open.

## Closing and the lock

A closed Task's status can change only on the local day it closed. From the
next midnight it is locked: its status is fixed, while edits, relationships,
Work stretches, and deletion stay available.

Closed at is the time of a Task's latest closure, so a Task reopened and closed
again takes the later time; an open Task has none. Locked is derived from
closed at and the clock and is never stored.

A locked Task offers a Follow-up: a new Backlog Task copying its title,
description, Value, and Effort and recording which Task it follows. It
takes no relationships, Worked time, or history from the original, and stays
when the original is deleted.

## Relationships

Parent / Child describes work breakdown. A Task has at most one Parent and
can have several Children; the hierarchy must be acyclic.

Map placement creates no Task relationships.

## Work

Working now is available on Active Tasks, and several Tasks can be Working
now together. Leaving Active stops Working now; stopping work preserves
Active.

Each span of Working now is a Work stretch; an open stretch has no end yet.
Worked time sums finished stretches and the elapsed time in the open stretch,
across all days and statuses. Correcting a stretch updates the total.
Work stretches are independent of status history: a corrected stretch may
fall before the Task was created or after it closed.
Recording, recovery, and Phase behavior live in [Phases](phases.md).

## History and deletion

Task creation and status changes are recorded as status events. Work stretches
record when work happened; correcting or removing them changes the work entries
shown in a Task's [History](../interface/tasks.md#history). Separate
append-only edit records preserve title, Value, Effort, description
changes (without description text), relationships, Follow-up links, and work
corrections and removals. Corrections retain old and new times and are dated
when made. Reordering is excluded.

Relationship changes appear on both Tasks. Reparenting records the change on
the child and both affected Parents. Related titles are snapshots that survive
renaming and deletion. Deletion records relationship removals on surviving
Tasks, including either side of a Follow-up link. Existing Tasks retain their status and work history; edit recording
starts at the upgrade, whose time is saved. Unchanged saves add no edit record.

Deleting a Task removes its own edit records, status events, and Work stretches. Its Children remain and become Tasks with no Parent.
Deleted Task history therefore disappears from Calendar and Timeline.
