# Nest UI implementation

Shared dashboard controls and cross-surface rules. This file supplements the
project-agnostic UI standards in `.agents/standards/ui-standards.md`. Follow
`.impeccable.md` for Nest's brand, tone, and aesthetic direction. Preserve
light and dark system themes.

Each surface's behavior and storage keys live in its own doc: Tasks in
[`docs/interface/tasks.md`](docs/interface/tasks.md); Calendar, Insights, and Timeline in
[`docs/interface/calendar.md`](docs/interface/calendar.md), with the Phases pane in
[Phases interface](docs/interface/phases.md) and rules shared by time surfaces in
[`docs/interface/time-surfaces.md`](docs/interface/time-surfaces.md); Metrics in
[`docs/interface/metrics.md`](docs/interface/metrics.md); Timer in
[`docs/interface/timer.md`](docs/interface/timer.md); Popup in
[`docs/interface/popup.md`](docs/interface/popup.md); Brain dump in
[`docs/interface/brain-dump.md`](docs/interface/brain-dump.md). Non-obvious class
and layout constraints are commented beside their rules in
`src/dashboard/styles/`.

## Copy and interaction

- Section main content has no title and starts with its controls, in
  `.dash-section__head` or a sibling toolbar; the Sidebar names the current
  place. Core and Recap also have a title in their Section sidebar.
- Prefer domain words from `CONTEXT.md` in user-facing copy: Task, Blocker,
  Ready, Scope, Working now, Work stretch, Pulse, Brain dump, Timeline, Logs,
  Section, Sidebar, and Settings.

## Shared controls

Reuse these before adding a control:

- `ViewToggle` (`.view-toggle`): segmented control for single-select choices,
  one size everywhere. No per-Section size overrides.
- `MenuSelect`, task menus, `NestIcon`, and the shared icons in `icons.tsx`.
- `IconPickerButton`: the only way to open an icon picker. It closes after a
  pick, on Escape, and on an outside press; `controlClassName` /
  `triggerClassName` restyle it and `color` / `onColorChange` add Metric color
  swatches.
- `DateNavigation`: the shared day, week, and month pager. `onToday` adds Go to today,
  and `canGoPrevious` sets the earliest-day limit; which surfaces use each lives
  in [Time surfaces](docs/interface/time-surfaces.md#dates-and-ranges).
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
- `DashboardSidebar` holds the two Sections, Recap and Core; the dashboard
  opens on Recap. Section icons are `NestIcon`s stored in
  `nest:overview-tile-icons`, a key kept from the retired Overview so saved
  choices carry over. Clicking an icon selects its Section; clicking the
  selected one opens its `IconPickerButton` when Settings allows icon
  selection. The Timer interval lives on the Popup; the macOS menu bar is a
  read-only Phase and countdown readout.
- The Settings button sits at the foot of the Sidebar (`.dash-settings`) and
  opens an overlay (`.settings-overlay` scrim around `.settings-dialog`,
  `role="dialog"`). The overlay lists Background, Map, and Icons. Background
  previews live and applies with Set background; style persists in `nest:background-style`, speed and intensity in
  `nest:background-tuning`. Map and icon selection persist in `nest:settings`.
  Map is hidden until shown. Icon selection starts on; while it is off, a
  selected Sidebar or Core icon does not open the picker. A click on the
  scrim or Escape closes the overlay, and closing returns focus to the
  button. The rest of the dashboard is inert while the overlay is open.
- Core and Recap add a Section sidebar, `.section-sidebar` (grid
  class `.dashboard--section-sidebar`), between the Sidebar and
  `.dashboard__inner`. Rows are `.section-nav__button` icon-and-label buttons
  on tiles tinted with `--pane-tone`; selecting the selected row again opens
  its icon picker when Settings allows icon selection. Below 601px the Core rail
  keeps only the tiles, with accessible names and tooltips. Recap's version
  is `.range-sidebar`
  (`.dashboard--range-sidebar`); its rows are Calendar and Timeline, with
  fixed icons and no icon picker, and they keep their labels at every width.
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
  (`LogsHours`) draw their figure through `renderDayColumn`.
- The `logs-` CSS prefix covers both the Timeline presentation and Calendar's
  Logs figure.

## Tasks implementation

`taskGraph` / `TaskGraphProjection` indexes Parent/Child and Blocker/Dependent
edges for Day, Table, Map, and Task details. The Map draws connectors as an SVG
overlay. Task surface behavior lives in
[`docs/interface/tasks.md`](docs/interface/tasks.md).
