# Functionality backlog

Track user-facing product work: behaviors, flows, and capabilities the app
should gain or change. Describe outcomes only — no implementation details,
APIs, schema, or code structure.

- rearrange elements to look more aesthetic

## Brain dump
- i want to be able to look at the past brain dumps at a glance, at least the previous one
- does it make sense to promote a brain dump to a sticky note, we have a board and some brain dumps can be attached an removed from the board
- overview page needs to see this view of sticky notes 

## Task section
show priotiy as 2 columns

## overview page
replace the current task view to be the same view as the task open view, and it has a button that redirects to the tasks section

also add a small logs section

and add a metrics view

## Dashboard sections
- Let every section except Overview use the full dashboard window for its own content; hide Reminders on Calendar, Insights, Log, and other non-overview sections.
- Move task toggles to the left side of each task.
- Show the current phase and timer value in the top-right corner of each non-overview section.

## Inactivity pause and resume
- After about three minutes of no activity, pause every Task that is Working now and move phase to Resting.
- When the user returns, open a short prompt asking whether they are still working on the same Task(s); Yes resumes what was paused, No leaves them paused.
- Treat sleep and lock as long inactivity under this rule rather than pausing and going Offline immediately.
- Open design call: overnight away would then land as Resting in history instead of Offline — confirm before shipping.
