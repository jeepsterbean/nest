# Timer interface

Controls and readouts follow [Timer domain](../domain/timer.md).
Window interactions live in [Popup interface](popup.md).

The macOS menu bar is a read-only Timer readout: Phase and countdown.
The Popup is the only place that changes the interval. Its clock shows the
countdown and selected interval; choosing it opens the interval list.
Selecting an interval starts the new cycle under the domain rules.
