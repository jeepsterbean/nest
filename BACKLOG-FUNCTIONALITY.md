# Functionality backlog

Track user-facing product work: behaviors, flows, and capabilities the app
should gain or change. Describe outcomes only — no implementation details,
APIs, schema, or code structure.

- rearrange elements to look more aesthetic

## Brain dump
show a nice, clean view of brain dumps on overview page

## Task section
show priotiy as 2 columns
have a all tasks view.

## overview page
Redesign task card to be more lean

## Dashboard sections
- Let every section except Overview use the full dashboard window for its own content; hide Reminders on Calendar, Insights, Log, and other non-overview sections.
- Move task toggles to the left side of each task.
- Show the current phase and timer value in the top-right corner of each non-overview section.

## Inactivity pause and resume
- After about three minutes of no activity, pause every Task that is Working now and move phase to Resting.
- When the user returns, open a short prompt asking whether they are still working on the same Task(s); Yes resumes what was paused, No leaves them paused.
- Treat sleep and lock as long inactivity under this rule rather than pausing and going Offline immediately.
- Open design call: overnight away would then land as Resting in history instead of Offline — confirm before shipping.
