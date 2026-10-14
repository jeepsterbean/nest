# Nest UI implementation

Shared dashboard controls and cross-surface rules. This file supplements the
project-agnostic UI standards in `.agents/standards/ui-standards.md`. Follow
`.impeccable.md` for Nest's brand, tone, and aesthetic direction. Preserve
light and dark system themes.

Each surface's behavior and storage keys live in its own doc: Tasks in
[`docs/interface/tasks.md`](docs/interface/tasks.md); Calendar, Insights, and Timeline in
[`docs/interface/calendar.md`](docs/interface/calendar.md), with the Phases Section in
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
  `.dash-section__head` or a sibling toolbar; the Section sidebar names the
  current place.
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
  `canGoPrevious` sets the earliest-day limit, and `picker` makes the label
  open the date picker (`.date-navigation__popover`); which surfaces use each lives
  in [Time surfaces](docs/interface/time-surfaces.md#dates-and-ranges).
  `singleDayPicker` builds `picker` for a surface that shows one day.
- `DayCalendar`: the month calendar inside the date picker and the Tasks table
  date filters, used instead of the OS date popup.
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
- `DashboardSidebar` holds the five Sections in `SECTIONS` order: Recap,
  Brain dump, Tasks, Metrics, Phases. The dashboard opens on Recap, and the
  last Section is not remembered. Section icons are `NestIcon`s stored in
  `nest:overview-tile-icons`, a key kept from the retired Overview so saved
  choices carry over. Clicking an icon selects its Section; clicking the
  selected one opens its `IconPickerButton` when Settings allows icon
  selection. The Timer interval lives on the Popup; the macOS menu bar is a
  read-only Phase and countdown readout.
- The Settings button sits at the foot of the Sidebar (`.dash-settings`) and
  opens an overlay (`.settings-overlay` scrim around `.settings-dialog`,
  `role="dialog"`). The overlay lists Background, Map, Work stretch, and Icons. Background
  previews live and applies with Set background; style persists in `nest:background-style`, speed and intensity in
  `nest:background-tuning`. Map, Work stretch, and icon selection persist in
  `nest:settings`. Map and Calendar's Work stretch figure are hidden until shown. Icon selection starts on; while it is off, a
  selected Sidebar icon does not open the picker. A click on the
  scrim or Escape closes the overlay, and closing returns focus to the
  button. The rest of the dashboard is inert while the overlay is open.
- Every Section has a Section sidebar, `.section-sidebar`, between the
  Sidebar and `.dashboard__inner`. It shows the Section's name. On Recap, `RecapInsights`
  portals Insights into it under that name, and renders under the figure
  once the sidebar collapses. On Tasks, `TasksView` portals Table's query
  (`.task-query`) into the Section sidebar. It renders in the Section's main
  content once the sidebar collapses. New task (`.task-new-button`) and the
  result count sit in `.task-table-bar` above the table.
- Recap's Day / Week and Calendar / Timeline
  switches are `ViewToggle`s that `Dashboard` passes to both presentations;
  each ends its toolbar with them in `.recap-toolbar__display`.
- `.dashboard__inner` takes the active Section's layout class (`--brainDump`,
  `--tasks`, `--metrics`, `--phases`; Recap uses `--calendar` or
  `--timeline`).
- Away from Recap, Brain dump, Tasks, Metrics, and Phases all stay mounted
  (`.section-slot`) and inactive ones are hidden with `hidden`, so filters,
  selection, and drafts survive switches between them. Tasks alone returns to
  Table and closes its Task detail on leaving. Opening Recap unmounts them.

## Shared surfaces

- `TimelineFrame.tsx` owns the Calendar chrome: gutter, rules, Phase rail and
  wash, now line, and scroll-to-now. Work stretch (`TimelineGrid`) and Logs
  (`LogsHours`) draw their figure through `renderDayColumn`.
- The `logs-` CSS prefix covers both the Timeline presentation and Calendar's
  Logs figure.

## Tasks implementation

`TasksView` owns the header's `.task-header__actions` group with a Table / Map
`ViewToggle` when Settings shows Map; with Map hidden, the header is left out.
Table's saved-view picker (`TaskViewPicker`) is the query's first row, above
Filters, Sort, and Hidden, so the Section sidebar head keeps only the title as
on every Section. In Table's query (`.task-query`), each filter and sort row is a `TaskQueryRuleMenu` that opens the
same `TaskFilterFields` or `TaskSortDirectionOptions` a column header menu shows. Tasks resets
to Table when leaving the Section; table queries and drafts stay mounted.

`taskGraph` / `TaskGraphProjection` indexes Parent/Child and Blocker/Dependent
edges for Table, Map, and Task details. The Map draws connectors as an SVG
overlay. Task surface behavior lives in
[`docs/interface/tasks.md`](docs/interface/tasks.md).
