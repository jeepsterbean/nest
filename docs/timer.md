# Timer

The Timer is the recurring countdown. Popup behavior lives in
[`popup.md`](./popup.md); domain words live in [`CONTEXT.md`](../CONTEXT.md).

Timer chrome, aria, and class names use Timer / due, never check-in. The
dashboard due phrase is `Timer due`. A Metric check-in remains the saved Pulse
scoring record.

## Countdown and interval

The interval is 5–30 minutes in five-minute steps. Picking an interval starts
that cycle immediately, including when the Timer is due.

The **Greetings board** shows the countdown and interval control when Overview
is showing it (not during Doing). The Popup hosts another Timer surface whose
clock shows the countdown only.

## Due behavior

At zero, the Timer pauses at `0:00`, plays the system alert sound, and summons
the Popup. It remains due and glowing until a new interval is picked.

Dismissing the Popup or saving a Metric check-in does not start the next
cycle. Manually summoning or dismissing the Popup does not reset a running
Timer.
