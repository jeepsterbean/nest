# Time surfaces interface

Rules shared by every surface that shows time: Calendar, Insights, and
Timeline, plus the day navigation that Brain dump, Tasks Day, and Metrics also
use. Each surface's own behavior lives in
[`docs/interface/calendar.md`](calendar.md); the Phases pane lives in
[Phases interface](phases.md). Range boundaries live in
[History domain](../domain/history.md#records-and-ranges). Domain words live in [`CONTEXT.md`](../../CONTEXT.md); Phase derivation lives in
[Phases](../domain/phases.md). Shared dashboard controls
live in [`UI.md`](../../UI.md).

## Dates and ranges

The dashboard loads a 30-day history window. Day and Week are anchored to real
dates rather than measured back from now. Today follows the clock across
midnight; historical dates stay fixed.

Day navigation (Brain dump, Tasks Day, Timeline, Metrics) and Calendar's month
pager share one arrow control. Every surface opens on today when the app
launches, pages one local day (or month) at a time, and never moves past Today; shared navigation logic
enforces that limit as well as the controls. Day navigation also returns to
Today from any historical day; the month pager does not.

The earliest day depends on the surface. Calendar and its sidebar, Tasks Day,
and Timeline stop at loaded history: direct selections clamp to it, and paging
stops before a page starts outside it. Brain dump and Metrics have no earliest
day and fetch older days on demand.

## Last hour

Last hour is a rolling 60 minutes from now. Calendar, Phase mix, and the
Insights task ledger advance that window on one shared minute clock.
Insights brain dumps and Metric check-ins use wall-clock now instead, so a
just-saved item shows immediately. Calendar's Last hour range and Insights
share the window; the two clocks are described under
[Insights](calendar.md#insights).

## Logs kinds

Timeline and Calendar's Logs figure filter
history by four kinds: Brain dumps, Phases, Metrics, and Tasks. All four are
on by default. A click toggles one kind, and the last kind on stays on. A
double click keeps only that kind, and double clicking the kind already alone
turns all four back on. Timeline and Calendar Logs share one selection in
`nest:logs-preferences`.

With Phases alone, an eye button swaps the settled Phase rows for every Phase
checkpoint in the window; it starts off whenever Phases becomes the only kind
again and is not stored. Settled Phase rows and the day export use the
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
