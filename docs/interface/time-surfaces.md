# Time surfaces interface

Rules shared by every surface that shows time: Calendar, Insights, and
Timeline, plus the day navigation that Brain dump, Tasks Day, and Metrics also
use. Each surface's own behavior lives in
[`docs/interface/calendar.md`](calendar.md); the Phases Section lives in
[Phases interface](phases.md). Range boundaries live in
[History domain](../domain/history.md#records-and-ranges). Domain words live in [`CONTEXT.md`](../../CONTEXT.md); Phase derivation lives in
[Phases](../domain/phases.md). Shared dashboard controls
live in [`UI.md`](../../UI.md).

## Dates and ranges

The dashboard loads a 30-day history window. Day and Week are anchored to real
dates rather than measured back from now. Today follows the clock across
midnight; historical dates stay fixed.

Day navigation (Brain dump, Tasks Day, Calendar, Timeline, Metrics, Phases Day) and the date picker's month
pager share one arrow control. Every surface opens on today when the app
launches, pages one local day (or month) at a time, and never moves past Today; shared navigation logic
enforces that limit as well as the controls. Calendar on Week pages a week at
a time through the same control. Day navigation also returns to
Today from any historical day; the month pager does not.

On each of those surfaces the date between the arrows opens the date picker:
a Monday-first month calendar under the date. It highlights the day or week on
screen. Picking a day selects it and closes the picker; Escape or a press
outside closes it unchanged. Escape and a pick return focus to the date.
Future dates and dates before the surface's earliest day are disabled. The
month has one Tab stop; arrow keys move focus by a day or week, Home / End
move to the week edges, and Enter / Space selects the focused date.

The earliest day depends on the surface. Calendar, Tasks Day,
and Timeline stop at loaded history: direct selections clamp to it, and paging
stops before a page starts outside it. Brain dump, Metrics, and Phases Day have
no earliest day and fetch older days on demand.

## Logs kinds

Insights, Timeline, and Calendar's Logs figure share four kinds: Brain dumps,
Tasks, Metrics, and Phases. All four are shown by default. Each Insights
heading has a hide control. Hiding a kind removes that section's body and
that kind from Logs and Timeline. The heading stays, so the kind can be shown
again, and the last shown kind stays shown. The choice is remembered in
`nest:logs-preferences` and still applies while Insights is closed. Work
stretch keeps its full timetable.

With Phases alone, an eye button on Timeline swaps the settled Phase rows for every Phase
checkpoint in the window; it starts off whenever Phases becomes the only kind
again and is not stored. Settled Phase rows use the
[Phase history interpretation](../domain/history.md#phase-history).

Task activity covers creation, status changes (including completion,
cancellation, and reopening), and Working now starts and stops. Lifecycle rows
use the stored status-event timestamps and current Task titles; deleting a
Task removes its history. Task rows share the configured Tasks icon and an
emphasized Task title. Every activity follows `Title — Activity`, with a
compact activity tag in past tense: Added, Started, Paused, Completed,
Cancelled, or Moved to Backlog / Up next / Active. Reopening a closed Task
shows Reopened to its destination status.

## Phase appearance

Each Phase has a fixed icon and color (set by migration, not editable), which
drive Calendar rail and wash, Insights mix and totals,
Timeline Phase rows, and the Timeline time column (quiet surface tone when
uncolored).

Historical checkpoints with no Phase display as **Idle**. Summary interpretation
lives in [History domain](../domain/history.md#phase-history).
