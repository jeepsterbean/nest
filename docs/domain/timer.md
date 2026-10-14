# Timer domain

Countdown and due-state rules shared by Timer surfaces. Controls live in
[Timer interface](../interface/timer.md).

## Countdown and interval

The interval is 5–30 minutes in five-minute steps. Picking an interval starts
that cycle immediately, including when the Timer is due.

## Due behavior

At zero, the Timer pauses at `0:00`, plays the system alert sound, and summons
the Popup. It remains due until a new interval is picked.

Dismissing the Popup or saving a Metric check-in leaves the Timer due.
Manually summoning or dismissing the Popup preserves a running countdown.
