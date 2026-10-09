# Metrics domain

Record and membership rules shared by scoring and history surfaces. Setup
lives in [Metrics interface](../interface/metrics.md), scoring in
[Popup interface](../interface/popup.md#metric-scoring), and terminology in
[CONTEXT.md](../../CONTEXT.md).

## Metrics and Pulses

Metrics and Pulses have required names, trimmed and validated as non-empty.
A Pulse groups Metrics in a persisted order; Pulses also have a persisted
order. Removing a Metric from a Pulse removes that membership. Deleting a Pulse
removes its memberships and keeps its Metric check-ins, which still carry the
Pulse name recorded at submission.

## Metric check-ins

A Metric check-in records a Pulse, its name at submission, a timestamp, and
one or more Metric ratings. Each rating is an integer from 1–5 and must belong
to a Metric in that Pulse. The check-in and its ratings save atomically.

Scoring is manual and always available. Check-ins have no interval or due
state and preserve Timer state. Deleting a check-in removes its ratings.
Range averages follow [History domain](history.md#metric-summaries).
