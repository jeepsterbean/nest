# Timer

The Timer is the recurring countdown. Popup behavior lives in
[`popup.md`](./popup.md); domain words live in [`CONTEXT.md`](../CONTEXT.md).

## Countdown and interval

The interval is 5–30 minutes in five-minute steps. Picking an interval starts
that cycle immediately, including when the Timer is due.

The macOS menu bar is a read-only Timer readout: Phase and the countdown.
The Popup is the only place that changes the interval. Its clock shows the
countdown and selected interval, and choosing it
opens the interval list.

## Due behavior

At zero, the Timer pauses at `0:00`, plays the system alert sound, and summons
the Popup. It remains due until a new interval is picked.

Dismissing the Popup or saving a Metric check-in does not start the next
cycle. Manually summoning or dismissing the Popup does not reset a running
Timer.
