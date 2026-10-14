# Phases domain

Phase derivation and work recording behavior. Domain definitions live in
[`CONTEXT.md`](../../CONTEXT.md); implementation and verification guidance lives
in the [Phase lifecycle skill](../../.agents/skills/phase-lifecycle/SKILL.md).

## Phase derivation

Phase is derived and recorded as a checkpoint when it changes. Apply these
rules in order:

1. **Doing** when any Task is Working now.
2. **Offline** when the Mac is locked, display-asleep, or system-asleep.
3. **Resting** after three minutes without keyboard or pointer input.
4. **Scoping** when the dashboard has attention, the Popup is up, or Notion
   desktop or Notion Calendar is frontmost.
5. **Resting** otherwise.

## Work recording lifecycle

Starting work makes the Phase Doing. Stopping work keeps it Doing while
another Task is Working now; stopping the last one lets attention, inactivity,
and lock/sleep determine the Phase. A Task leaving Active
[stops Working now](tasks.md#work), which closes its Work stretch and counts as
stopping work here.
Lock or sleep closes open Work stretches, preserves Active, and records Offline.
Quitting saves elapsed Worked time and closes open Work stretches; time with
Nest closed is untracked. After a crash, the next launch ends open stretches
at the last known live time.
Clicking another display leaves dashboard attention even if Nest remains key.

The frontend guide follows this derivation; see [Phases interface](../interface/phases.md).
Historical interpretation lives in [History domain](history.md#phase-history).

