# Nest UI implementation

This file supplements the project-agnostic UI standards in
`.agents/standards/ui-standards.md`. Follow `.impeccable.md` for Nest's brand,
tone, and aesthetic direction. Preserve light and dark system themes.

## Copy and interaction

- Sections have no title; the Sidebar names the current place. The Greetings
  board greeting on Overview is not a Section title.
- Prefer domain words from `CONTEXT.md` in user-facing copy: Task, Blocker,
  Ready, Scope, Working now, Work stretch, Pulse, Brain dump, Logs, Section,
  Sidebar, and Greetings board.
- Reuse `MenuSelect`, `NestIcon` / `IconPicker`, task menus, and shared icons in
  `icons.tsx` before adding controls.
- Dashboard Section behavior lives in `CONTEXT.md`; this file records concrete
  implementation hooks.

## Shared controls and Section anchors

- Greetings board: `DashboardHeader` (`.dash-header`) on Overview only
  (typewriter greeting, live Phase, Timer). Other Sections omit it so content
  fills the area beside the Sidebar.
- Sections show no title. Top controls stay in `.dash-section__head` or a
  sibling toolbar such as `RangeToolbar`; each Section keeps its own.
- Segmented controls: shared `ViewToggle` (`.view-toggle`), one size everywhere.
  No per-Section size overrides.
- Tasks: `.task-table`. No Working now play control or Readiness column in the
  table; start work from the detail panel or Kanban.
- Overview: last-hour band `.overview-day`; three panels in `.overview-panels`
  (read-only Tasks `.overview-panel--tasks` with Open/Closed + Tasks jump;
  Timeline `.overview-panel--timeline` spanning the right column with Timeline
  / Brain dumps / Metrics filter via `ViewToggle`; dump composer
  `.overview-panel--dumps`). Shared table is `TaskTable` (`readOnly`); Overview
  columns come from `overviewTaskColumns()`. Timeline is today-only with
  `dayChrome={false}`. There is no dashboard dump modal or Sidebar dump button.
- Calendar: timetable `.tl` under `.dash-section--calendar`.
- Insights: scoreboard `.dash-section--insights` with `.insight-mix`,
  `.insight-ledger`, and `.insight-pulses`. Range is remembered in
  `nest:date-range` (Day when unset; reads legacy `nest:insights-range`).
- Logs: `.dash-section--logs` with one `ViewToggle` (Timeline / Brain dumps /
  Phases / Metrics / Raw). Last view is stored in `nest:logs-preferences` (Raw
  when unset; migrates legacy `layout` + `rawFilter`). Phases is always
  aggregated. Raw and filtered panes share day-grouped `.timeline` / `.event`
  rows (`LogsEvents`); Timeline keeps `.logs-chrono`.
- Settings: `.dash-section--settings` with Metrics / Phases / Tags panes via
  shared `ViewToggle`. Last pane is stored in `nest:settings-pane` (Metrics when
  unset). Panes stay mounted in `.settings-slot` through `hidden` so Metrics
  sub-state survives switches. Metrics uses `.settings-pane--metrics` (Pulses /
  Metrics sub-toggle). Phase appearance uses `--phase-color` / `--colored` on
  the Greetings board, Calendar rail and wash, Insights mix and totals, and
  Logs Phase rows.

## Timeline grid

- In `TimelineGrid.tsx`, place every span with percentage `top` / `height` from
  `placeOnWindow`, never `flex-grow`, so Work stretches and the Phase wash
  align. Percentages use the column's real span and remain DST-safe.
- Phase ground is a continuous `.tl__wash` tint with no border, radius, label,
  or click target. Day adds a `.tl__rail` of Phase icons left of hours; Week is
  wash only.
- A Work stretch is a `.tl-block` card above the wash, tinted through
  `taskHue(task.id)` / `--task-hue`, matching its Insights Worked time swatch.
  Open stretches use `.tl-block--open`; concurrent stretches use `col` / `cols`.
- `HOUR_PX` is the sole density control. It sets `--tl-hour` inline and label
  thresholds; change it there rather than in CSS.

## Pointer and drag

- List sorting and Task table columns share `startPointerDrag` for threshold,
  pointer capture, and listener cleanup. Their ordering and resize rules stay
  in their own hooks.
- Calendar drag, resize, snap, open-stretch lock, and inline editor placement
  are defined in `CONTEXT.md` under Phase. Hook classes are `.tl-block` and
  `.tl-block--open`.
