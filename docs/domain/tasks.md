# Tasks domain

Rules shared by every Task surface. Dashboard interactions live in
[Tasks interface](../interface/tasks.md); shared terminology lives in
[`CONTEXT.md`](../../CONTEXT.md).

## Fields and status

A Task has a required, non-empty title and a description, which may be
empty. Scope, Parent, Value, and Effort are optional. Value and Effort are 1–5 scores.

Task statuses are Backlog, Up next, Active, Completed, and Cancelled.
Completed and Cancelled are closed; the others are open.
Readiness is separate from status.

## Relationships and readiness

Parent / Child describes work breakdown. A Task has at most one Parent and
can have several Children; the hierarchy must be acyclic.

Blocker / Dependent describes readiness independently of the hierarchy.
A Task can have several Blockers and Dependents; these relationships must
also be acyclic. Making a Task a Child creates no Blocker relationship.

An open Task is Ready when all its Blockers are Completed, otherwise Blocked.
A Cancelled Blocker still blocks its Dependents. Closed Tasks have no
Ready / Blocked classification.

Scope categorizes Tasks by path independently of their relationships.
Map placement creates no Task relationships.

## Work

Working now is available on Active Tasks, and several Tasks can be Working
now together. Leaving Active stops Working now; stopping work preserves
Active.

Each span of Working now is a Work stretch; an open stretch has no end yet.
Worked time sums finished stretches and the elapsed time in the open stretch,
across all days and statuses. Correcting a stretch updates the total.
Recording, recovery, and Phase behavior live in [Phases](../phases.md).

## History and deletion

Task creation and status changes are recorded as status events. Other Task
edits are not historical events. Work stretches record when work happened.

Deleting a Task removes its status events, Work stretches, and Blocker /
Dependent relationships. Its Children remain and become Tasks with no Parent.
Deleted Task history therefore disappears from Day, Calendar, and Timeline.
