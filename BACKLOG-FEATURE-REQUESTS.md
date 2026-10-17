# Functionality backlog

Track user-facing product work: behaviors, flows, and capabilities the app
should gain or change. Describe outcomes only — no implementation details,
APIs, schema, or code structure.

## Notes
- add more view options
- for logged notes, when i try to add tags, the visuals look bad
- completely replace notion with this. or integrate it with notion so cleanly that im only using nest.

## Metrics
- P2 improve usability

## Task section
- P3: add task time feature
- P2: user never ever states the value and effort. need to think about how to encourage user to use it more

## Phases
- add activity tracking

## Inactivity pause and resume
- P2: When the user returns from inactivity, open a short prompt asking whether they are still working on the same Task(s); Yes turns Working now back on for them, No leaves Working now off.

- P2: its important to remember that the start session SOP is not only for the start of the day but everytime i sit back down. nest should open it everytime im back from being offline or from rest.

## Status
New data model. which basically, is textual summary of what the user is doing from time A to B

## insights page 
- i want to track user usage rate. how many tasks i create, how many tasks i start using. how many tasks are allocated V/E, how many notes are created

- Bring back Last hour (removed after commit 65a7391, which holds the previous version):
  - A Last hour control on Insights summarizes the rolling 60 minutes ending now, in place of the Day or Week on screen, and shows the clock span it covers (e.g. 2:04 PM – 3:04 PM).
  - Choosing it moves Recap to today and to Day. Calendar and Timeline keep showing that full day; only Insights reads the hour.
  - Turning it off, paging or picking another day, or choosing Week returns Insights to the range on screen.
  - The choice is remembered across restarts. A remembered Last hour opens on today in Day, never on a stored Week.
  - Phase mix and the Task ledger advance with the shared minute clock. Notes and Metric check-ins follow wall-clock now, so one saved a moment ago shows immediately.
  - Just after midnight the hour still includes the end of the previous day.

## Timeline
- Bring back the day export (removed after commit 65a7391, which holds the previous version):
  - Each day on Timeline has an Export control that downloads that calendar day as a Markdown file named `nest-timeline-YYYY-MM-DD.md`.
  - The file starts with a "Nest Timeline — <full date>" heading and lists every kind in chronological order, whatever kinds are hidden on screen. A day with nothing reads "_No settled happenings._".
  - Each entry is one line starting with its time: Phase with the Phase name; Metric check-in with the Pulse name and each Metric's score; Note with its Tags and the text quoted beneath; Task activity with its label and the Task title.
  - Phases appear as settled Phase changes, the same interpretation Timeline's Phase rows use.

## Work stretch
make work stretch something quick to add delete and edit. and allow to attach notes and metrics to work stretch.

## Popup
- add clock
