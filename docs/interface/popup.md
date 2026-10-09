# Popup interface

The Popup is a compact window for quick actions. Timer behavior lives in
[`timer.md`](timer.md); domain words live in [`CONTEXT.md`](../../CONTEXT.md).

## Window lifecycle

The Popup can be summoned with ⌘⇧E, by the Timer becoming due, or when input
resumes after an idle stretch spent Resting. Each trigger opens the same
window and restores the same panel selection.

The Popup is fixed and non-resizable; its size lives in
`src-tauri/tauri.conf.json`. Opening the dashboard from the Popup dismisses it.

The Popup hosts the Timer bar, described in [Timer interface](timer.md). The
Popup's other behavior does not depend on why it was summoned.

## Panels

Brain dump and Tasks and metrics each have a toggle. Each toggle shows or hides
its panel, so any combination can be visible, including none.

Tasks and metrics holds Metric scoring and the Active / Up next task list;
extra tasks scroll. Completed and Cancelled Tasks from the last 60 minutes sit
above Active. The list opens on Active, and scrolling up reveals those Tasks so
they can be returned to Active.

Active rows start or stop Working now with their leading control. While
working, a row shows the Task's total Worked time, including the open stretch.
Starting an Up next Task moves it to Active and starts Working now. Active rows
have Up next and Complete.

Every summon restores `nest:popup-panels`, even if the Timer is still paused at
zero. Brain dump shows on first use. A saved selection naming the retired Chat
panel drops it, and one naming only Chat falls back to Brain dump; an
explicitly empty selection still hides every panel. Showing Brain dump focuses
its editor, and Tasks and metrics the Metric control. Hiding the panel
that holds focus returns focus to its toggle.

## Metric scoring

The Metric scoring panel opens on the first Metric of the first visible Pulse.
Metrics can hide a Pulse from the Popup. A Pulse toggle swaps among Pulses
shown there. Finishing the last Metric of a Pulse saves a Metric check-in and
closes the Popup.

Scoring follows [Metrics domain](../domain/metrics.md#metric-check-ins).
The scoring controls have no due glow or due dot.

## Keyboard and focus

⌘1 and ⌘2 toggle Brain dump and Tasks and metrics in sidebar order, including
while typing in Brain dump. A held key repeats but toggles once. Copy, Cut, and Paste retain their normal behavior.

The chords apply only when the Popup has the keystroke; with the Dashboard
focused they belong to the Dashboard. Tab and Shift+Tab provide ordinary focus
navigation, including the panel toggles. Timer, Dashboard, and task controls
are pointer-only. Metric ratings use the bare 1–5 number keys, which ⌘ keeps
separate from the panel chords.
