# Metrics pane

The Metrics pane of Core: one day of Metric check-ins, and Pulse and Metric
setup. Domain words (Pulse, Metric, Metric check-in) live in
[`CONTEXT.md`](../CONTEXT.md). Shared dashboard controls live in
[`UI.md`](../UI.md). Its icon is picked from the Core sidebar.

## Day board

The pane reads one local day at a time through the shared day navigation:
previous, next, and back to today. It opens on today and cannot pass it. Days
older than the dashboard's history window load on demand.

Each Pulse is a group headed by its icon and name, marked `Hidden from popup`
when hidden. Metrics outside every Pulse follow in a `Not in a pulse` group.
Each Metric row reads its name, a day strip, and its latest rating as a number
tinted by its rating color (`—` when none). The strip runs midnight to
midnight; on today the hours after now are shaded. Each Metric check-in is a
rating pill placed at its time, and one within 45 minutes of the previous
lifts into a second lane so neither hides the other. A Pulse row plots only
that Pulse's check-ins.

## Edit

The header `Edit` / `Done` toggle switches to setup and is not remembered.
Strips hide. Pulse headings gain a grip, icon picker, click-to-rename name,
`Show in popup` switch, and delete; Metric rows gain a grip, icon and color
picker, click-to-rename name, and remove (×), all always visible. Pulses drag
by their heading, and Metrics drag within their Pulse. That order is how
Pulses, and the Metrics inside a Pulse, appear in the Popup. `Add metric` offers
existing Metrics or `New metric…`, which creates and adds in one step;
`New pulse` closes that list. Leaving Edit drops open composers. Pulses hidden
from the Popup persist in `nest:hidden-pulse-ids`.
