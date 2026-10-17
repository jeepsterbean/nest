# History domain

Rules for interpreting records across Calendar, Insights, Timeline,
and Phases Day. Navigation, clocks, filters, and presentation live in
[Calendar interface](../interface/calendar.md) and
[Time surfaces interface](../interface/time-surfaces.md).

## Records and ranges

History combines notes, Metric check-ins, Phase checkpoints, Task status
events, and Work stretch boundaries. Calendar and Timeline present these
records. Task history follows [Tasks domain](tasks.md#history-and-deletion).

Day runs between local midnights; Week starts Monday. Ranges include their
start and exclude their end. Worked time
is clipped to the range, with an open stretch ending at now.

## Phase history

Settled Phase history uses a 60-second collapse: a burst of checkpoints lands
on the Phase it settled on; if that equals the Phase before the burst, it is
omitted. Settled rows and Phase sessions use this interpretation.
The underlying checkpoints remain available for inspection.

Historical checkpoints with no Phase count as Offline in summaries. Live
inactivity follows [Phase derivation](phases.md#phase-derivation).

## Range summaries

Saved notes count by their recorded time. A note carrying several Tags
contributes to each Tag count and once to the total; untagged notes have their
own count. Phase totals sum settled sessions clipped to the range and live end.

An outcome is what a Task came to within a range, so one Task can have a
different outcome on each day. Outcomes use status at the range's end:

- Completed / Cancelled: a closure inside the range that remains that outcome
  at its end, including Tasks with zero Worked time.
- Incomplete: other Tasks with Worked time in the range that end it open.

The three groups are exclusive. Reopening is limited to the closing day by the
[lock](tasks.md#closing-and-the-lock), so a finished day's outcomes stay as
they were. A closure reopened within the range contributes
no closure outcome; an open Task with zero Worked time is omitted. Created
counts Tasks by creation time, independently of outcome. Deleted Tasks and
their deleted history disappear from summaries.

## Metric summaries

Check-ins group by Pulse. A Pulse average is the mean of all its ratings in
the range; each Metric average is the mean of that Metric's ratings. A Pulse
with zero check-ins has count 0 and no average. Records follow
[Metrics domain](metrics.md).
