# Popup

The Popup is a compact window for quick actions. Timer behavior lives in
[`timer.md`](./timer.md); domain words live in [`CONTEXT.md`](../CONTEXT.md).

## Window lifecycle

The Popup can be summoned manually, by the Timer becoming due, or when input
resumes after an idle stretch spent Resting. Each trigger opens the same
window and restores the same panel selection.

The Popup is fixed and non-resizable; its size lives in
`src-tauri/tauri.conf.json`. Opening the dashboard from the Popup dismisses it.

The Popup hosts a Timer bar across the top with the countdown, interval picker,
and a line that drains with the remaining time. This is a Timer surface inside
the Popup; the Popup's other behavior does not depend on why it was summoned.

## Panels

With `SIMPLIFIED_VIEW` enabled in `src/lib/simplifiedView.ts`, the Popup offers
Brain dump and Tasks and metrics. Chat stays unmounted and its ⌘3 shortcut is
disabled. Restored panel selections omit Chat; a Chat-only selection falls
back to Brain dump. An explicitly empty selection still hides every panel.

An icon-only strip down the left has one toggle per panel: Brain dump, Tasks
and metrics, and Chat. Each toggle shows or hides its panel, so any combination
can be visible, including none. Visible panels share the width evenly in that
order.

Tasks and metrics holds Metric scoring above the Active / Up next task list;
extra tasks scroll. Completed and Cancelled Tasks from the last 60 minutes sit
above Active. The list opens on Active, and scrolling up reveals those Tasks so
they can be returned to Active.

Active rows start or stop Working now with their leading control. While
working, a row shows the Task's total Worked time, including the open stretch.
Starting an Up next Task moves it to Active and starts Working now. Active rows
have Up next to the left of Complete.

Brain dump holds the brain dump. Chat holds the same Chat workspace as the
dashboard; Assistant setup stays in the dashboard. Chat drops the saved-chat
sidebar for a single chat switcher row and compact Popup controls. It mounts
the first time Chat shows and then stays mounted.

Every summon restores `nest:popup-panels`, even if the Timer is still paused at
zero. Brain dump shows on first use. Showing Brain dump focuses its editor,
Chat its composer, and Tasks and metrics the Metric control. Hiding the panel
that holds focus returns focus to its toggle.

## Metric scoring

The Metric scoring panel opens on the first Metric of the first visible Pulse.
Metrics can hide a Pulse from the Popup. A Pulse toggle swaps among Pulses
shown there. Finishing the last Metric of a Pulse saves a Metric check-in and
closes the Popup.

Metric scoring is manual and always available. It has no interval, due glow,
or due dot.

## Keyboard and focus

⌘1, ⌘2, and ⌘3 toggle Brain dump, Tasks and metrics, and Chat in sidebar order,
including while typing in Brain dump or Chat. A held key repeats but toggles
once. Copy, Cut, and Paste retain their normal behavior.

The chords apply only when the Popup has the keystroke; with the Dashboard
focused they belong to the Dashboard. Tab and Shift+Tab provide ordinary focus
navigation, including the panel toggles. Timer, Dashboard, and task controls
are pointer-only. Metric ratings use the bare 1–5 number keys, which ⌘ keeps
separate from the panel chords.
