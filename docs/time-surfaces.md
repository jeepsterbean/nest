# Time surfaces

Rules shared by every surface that shows time: Calendar, Insights, and
Timeline. Each surface's own behavior lives in
[`docs/calendar.md`](./calendar.md) (Calendar, Insights, Timeline, Phases
pane). Domain words and Phase
derivation live in [`CONTEXT.md`](../CONTEXT.md). Shared dashboard controls
live in [`UI.md`](../UI.md).

## Dates and ranges

The dashboard loads a 30-day history window. Day and Week (Week starts Monday)
are anchored to real dates rather than measured back from now; history stops
where the loaded 30 days end. Today follows the clock across midnight;
historical dates stay fixed. Date selection and paging enforce the Today limit
in shared navigation logic as well as in the controls. Direct selections clamp
to loaded history; paging stops before a page starts outside it. Day
navigation and the month header share one arrow control with Brain dump,
Tasks Day, Timeline, and Metrics, with fixed button positions and centered
icons. Those four supply Go to today.

## Last hour

Last hour is a rolling 60 minutes from now. Calendar, Phase mix, and the
Insights task ledger advance that window on one shared minute clock.
Insights brain dumps and Metric check-ins use wall-clock now instead, so a
just-saved item shows immediately. Calendar's Last hour range and Insights
share the window; the two clocks are described under
[Insights](./calendar.md#insights).

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
60-second settle collapse (a burst lands on the Phase it settled on; if that
equals the Phase before the burst, it is omitted).

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
