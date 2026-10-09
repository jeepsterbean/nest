# Nest UI implementation

Shared dashboard controls and cross-surface rules. This file supplements the
project-agnostic UI standards in `.agents/standards/ui-standards.md`. Follow
`.impeccable.md` for Nest's brand, tone, and aesthetic direction. Preserve
light and dark system themes.

Each surface's behavior and storage keys live in its own doc: Tasks in
[`docs/interface/tasks.md`](./docs/interface/tasks.md); Calendar, Insights, Timeline, and Phases in
[`docs/calendar.md`](./docs/calendar.md), with rules shared by time surfaces in
[`docs/time-surfaces.md`](./docs/time-surfaces.md); Metrics in
[`docs/metrics.md`](./docs/metrics.md); Timer in
[`docs/timer.md`](./docs/timer.md); Popup in
[`docs/popup.md`](./docs/popup.md); Brain dump in
[`docs/brain-dump.md`](./docs/brain-dump.md). Non-obvious class
and layout constraints are commented beside their rules in
`src/dashboard/styles/`.

## Copy and interaction

- Section main content has no title and starts with its controls, in
  `.dash-section__head` or a sibling toolbar; the Sidebar names the current
  place. Core and Calendar also have a title in their Section sidebar.
- Prefer domain words from `CONTEXT.md` in user-facing copy: Task, Blocker,
  Ready, Scope, Working now, Work stretch, Pulse, Brain dump, Timeline, Logs,
  Section, Sidebar, and Background.

## Shared controls

Reuse these before adding a control:

- `ViewToggle` (`.view-toggle`): segmented control for single-select choices,
  one size everywhere. No per-Section size overrides.
- `MenuSelect`, task menus, `NestIcon`, and the shared icons in `icons.tsx`.
- `IconPickerButton`: the only way to open an icon picker. It closes after a
  pick, on Escape, and on an outside press; `controlClassName` /
  `triggerClassName` restyle it and `color` / `onColorChange` add Metric color
  swatches.
- `DateNavigation`: day and month paging for Brain dump, Tasks Day, Calendar,
  Timeline, and Metrics. Brain dump, Tasks Day, Timeline, and Metrics supply Go to
  today (`onToday`); Calendar's month pager does not.
- `DayCalendar`: in-app date picker, used instead of the OS date popup.
- `startPointerDrag`: threshold, pointer capture, and listener cleanup for
  every pointer drag. Ordering and resize rules stay in each feature's hook.
- `useDismiss`: outside-press and Escape dismissal for popovers.

Menus and popovers that must escape scrolling containers portal under
`.dashboard`, so they inherit its light/dark surfaces. Feature styling for a
portaled menu has to be scoped from a dashboard-level class, as
`.dashboard--tasks` does.

## Dashboard shell

- Dashboard CSS enters through `src/dashboard/Dashboard.css`, whose ordered
  imports from `src/dashboard/styles/` define the cascade.
- `DashboardSidebar` holds the two Sections, Calendar and Core; the dashboard
  opens on Calendar. Section icons are `NestIcon`s stored in
  `nest:overview-tile-icons`, a key kept from the retired Overview so saved
  choices carry over. Clicking an icon selects its Section; clicking the
  selected one opens its `IconPickerButton`. The Timer interval lives on the
  Popup; the macOS menu bar is a read-only Phase and countdown readout.
- The Background button sits at the foot of the Sidebar (`.dash-background`)
  and opens `BackgroundView` in a non-modal panel beside the rail
  (`.dash-background__panel`, `role="dialog"`). The panel follows the button in
  DOM order so Tab reaches its controls; `useDismiss` closes it on an outside
  press or Escape, and Escape returns focus to the button. Changes preview live
  and apply with Set background. Style persists in `nest:background-style`,
  speed and intensity in `nest:background-tuning`.
- Core and Calendar add a Section sidebar, `.section-sidebar` (grid
  class `.dashboard--section-sidebar`), between the Sidebar and
  `.dashboard__inner`. Rows are `.section-nav__button` icon-and-label buttons
  on tiles tinted with `--pane-tone`; selecting the selected row again opens
  its icon picker. Below 861px the rail keeps only the tiles, with accessible
  names and tooltips. Calendar's version is `.range-sidebar`
  (`.dashboard--range-sidebar`).
- Core panes are Brain dump / Tasks / Metrics / Phases, toned with their Logs
  kind colors (`--dump`, `--doing`, `--accent`, `--phase`). The last pane is
  stored in `nest:core-pane` (Brain dump when unset), and `.dashboard__inner`
  takes the active pane's layout class (`--brainDump`, `--tasks`, `--metrics`,
  `--phases`).
- Core keeps every pane mounted (`.core-slot`) and hides inactive ones with
  `hidden`, so filters, selection, and drafts survive pane switches.

## Shared surfaces

- `TimelineFrame.tsx` owns the Calendar chrome: gutter, rules, Phase rail and
  wash, now line, and scroll-to-now. Work stretch (`TimelineGrid`) and Logs
  (`LogsHours`) draw their figure through `renderLane`.
- The `logs-` CSS prefix covers both the Timeline presentation and Calendar's
  Logs figure.
- Saved and floating stickies, docked Note Board rows, the Note Board frame,
  and the Core Brain dump composer share one 6px corner radius.

## Tasks implementation

`taskGraph` / `TaskGraphProjection` indexes Parent/Child and Blocker/Dependent
edges for Table, Map, and Task details. The Map draws connectors as an SVG
overlay. Task surface behavior lives in [`docs/interface/tasks.md`](./docs/interface/tasks.md).
