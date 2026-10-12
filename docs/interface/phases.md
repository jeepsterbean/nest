# Phases interface

One day of Phases, and the Core guide to attention. Derivation and work
recording live in [Phases domain](../domain/phases.md).

## Phases pane

The Phases pane of Core has two layouts, Day and Guide. Day is the default, and
the last choice is remembered (`nest:phase-view`). Its icon is picked from the
Core sidebar. Phase icons and colors follow
[Phase appearance](time-surfaces.md#phase-appearance).

## Day

Day reads one local day at a time through the
[shared day navigation](time-surfaces.md#dates-and-ranges). The selected day
survives a switch to Guide and back.

Each of the four Phases is a row in guide order, 0m included: its name, a day
strip, and its total for the day. The strip runs midnight to midnight on the
same scale as the [Metrics day board](metrics.md#day-board); on today the hours
after now are shaded and sessions stop at now. Each settled session is a bar in
its Phase color, and overnight Offline keeps its full width. Sessions and
totals follow the [Phase history interpretation](../domain/history.md#phase-history),
so a checkpoint with no Phase counts as Offline. On today the current Phase is
marked. A day with no checkpoints shows four empty rows.

## Guide

Guide is read-only: how Phase is derived, then the four Phases (Doing, Scoping,
Resting, Offline) with their meanings. Both must mirror the
[Phase derivation](../domain/phases.md#phase-derivation). The current Phase is
marked.
