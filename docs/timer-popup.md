# Timer and Popup

Countdown, due behavior, and the Popup panels. Domain words live in
[`CONTEXT.md`](../CONTEXT.md). CSS hooks live in [`UI.md`](../UI.md).

Timer and Popup chrome, aria, and class names use Timer / Popup / due, never
check-in. The dashboard timer due phrase `time to check in!` is the exception.
Popup timer UI shows countdown only. Metric check-in remains the saved Pulse
scoring record.

## Timer

The **Greetings board** shows the countdown and controls its 5–30 minute
interval when Overview is showing it (not during Doing). When due it shows
"Timer due"; the Popup clock stays on the countdown and remains the Timer
surface while Doing.

At zero, the timer pauses, plays the system alert sound, and opens the
popup. It stays at `0:00` (glowing) until a new interval is picked.
Dismissing the popup or saving a Metric check-in does not start the next cycle.

Picking an interval on the clock starts that cycle immediately, including
when the timer is due.

Manually shown popups keep the live countdown and do not reset it when
completed or dismissed.

## Popup

The popup has the Timer bar across the top (countdown, interval, and a line
that drains with the remaining time; click the countdown to pick an
interval) and an icon-only strip down the left with one toggle per panel:
Brain dump, Tasks and metrics, and Chat. Each toggle shows or hides its own
panel, so any combination can be up, including none at all; the visible ones
share the width evenly, left to right in that order. Tasks and metrics holds
Metric scoring above the Active / Up next task list; extra tasks scroll.
Completed and Cancelled Tasks from the last 60 minutes sit above Active; the
list opens on Active, and scrolling up reveals them so they can be returned
to Active. Active rows have Up next to the left of Complete. Brain dump
holds the brain dump. Chat holds the same Chat workspace as the dashboard;
Assistant setup stays in the dashboard. Every summon restores the last
combination — manual or Timer-triggered alike, and even if the Timer is
still paused at zero. Brain dump is what shows the first time. Showing Brain
dump focuses its editor, Chat its composer, and Tasks and metrics the Metric
control; hiding the panel that holds focus returns focus to its toggle.

The Metric scoring panel opens on the first Metric of the first visible Pulse.
Metrics can hide a Pulse from the popup. A pulse toggle swaps among Pulses
shown there; finishing the last Metric of a Pulse saves a Metric check-in and
closes the popup. A Silence control beside the Metric title skips that Metric
for the Metric check-in interval. Once nothing is left to score, the due glow
stays off and so does the dot on Tasks and metrics, which the toggle keeps
while its panel is hidden.

⌘1, ⌘2 and ⌘3 toggle Brain dump, Tasks and metrics, and Chat in sidebar
order, including while typing in Brain dump or Chat. A held key repeats but
toggles once. None of the three is an editing chord, so Copy, Cut and Paste
stay themselves. The chords only count when the Popup itself has the
keystroke; with the Dashboard focused they belong to the Dashboard. Tab and
Shift+Tab are ordinary focus navigation, the panel toggles included. Timer,
Dashboard, task, and Silence controls are pointer-only; Metric ratings use
the bare 1–5 number keys, which ⌘ keeps apart from the panel chords.

Opening the dashboard from the popup dismisses it.
