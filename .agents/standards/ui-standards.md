# Frontend and UI standards

Supplements `coding-standards.md`. Applies to Nest’s functional surfaces
(dashboard, popup, forms) — not marketing pages.

Follow `.impeccable.md` for brand, tone, and aesthetic direction: calm, warm,
private, journal-like. Preserve light and dark system themes.

## Copy: say it once

- One heading per section. No eyebrow label or subtitle that just restates
  the title in other words.
- Remove descriptions that only enumerate content or states already visible
  in the section below. Keep unique context such as time ranges or caveats.
- Don't caption self-explanatory controls (a labeled field, a dropdown with
  clear options) with extra headings or helper text.
- Prefer domain words from `CONTEXT.md` in user-facing copy (Task, Blocker,
  Ready, Scope, Working now, Work stretch, Pulse, Brain dump, Logs). Avoid todo/subitem jargon.

## Components: no speculative flexibility

- No prop unless a caller actually passes a non-default value today.
- Delete props nothing sets.
- Don't scaffold UI libraries/primitives before they're wired into a real
  dashboard view or the popup.
- Reuse existing controls (`MenuSelect`, `NestIcon` / `IconPicker`, task
  menus, shared icons in `icons.tsx`) before adding new ones.

## Duplication: share the identical part, not the whole shape

- Near-duplicate components: extract only the byte-identical logic (action
  runners, badges, empty states, rename/create form chrome) into a shared
  module.
- Leave each caller's data types, fields, and copy in place — don't force
  both into one generic component with config props. That couples flows that
  should stay free to diverge.

## Interaction

- Follow `.impeccable.md` Design Principles (capture availability, progressive
  disclosure, draft preservation, accessible labels and focus, compact layout).
- Dashboard view behavior — Logs, Tasks, Overview, Calendar, Insights — lives
  in `CONTEXT.md`. This file holds implementation hooks only; don't restate
  product rules here.

## UI implementation

Shared controls and section anchors:

- Segmented controls: shared `ViewToggle` (`.view-toggle`), one size everywhere.
  No per-section size overrides.
- Tasks: `.task-table`. No Working now play control or Readiness column in the
  table — start work from the detail panel or Kanban.
- Overview: last-hour band `.overview-day`; three panels in `.overview-panels`
  (read-only Tasks `.overview-panel--tasks` with Open/Closed + Tasks jump;
  Timeline `.overview-panel--timeline` spanning the right column with
  Timeline / Brain dumps / Metrics filter via `ViewToggle`; dump composer
  `.overview-panel--dumps`). Shared table is `TaskTable` (`readOnly`);
  Overview columns from `overviewTaskColumns()`. Timeline today-only with
  `dayChrome={false}`. No dashboard dump modal or sidebar dump button.
- Calendar: timetable `.tl` under `.dash-section--calendar`.
- Insights: scoreboard `.dash-section--insights` with `.insight-mix`,
  `.insight-ledger`, and `.insight-pulses`. Range remembered in
  `nest:date-range` (Day when unset; reads legacy `nest:insights-range`).
- Logs: `.dash-section--logs` with one `ViewToggle` (Timeline / Brain dumps /
  Phases / Metrics / Raw). Last view in `nest:logs-preferences` (Raw when unset;
  migrates legacy `layout` + `rawFilter`). Phases is always aggregated. Raw and
  filtered panes share day-grouped `.timeline` / `.event` rows (`LogsEvents`);
  Timeline keeps `.logs-chrono`.
- Settings: `.dash-section--settings` with Metrics / Phases / Tags panes via
  shared `ViewToggle`. Last pane in `nest:settings-pane` (Metrics when unset).
  Panes stay mounted in `.settings-slot` (via `hidden`) so Metrics sub-state
  survives switches.
  Metrics pane: `.settings-pane--metrics` (Pulses / Metrics sub-toggle).
  Phase appearance uses `--phase-color` / `--colored` on header, Calendar rail
  and wash, Insights mix and totals, and Logs Phase rows.

Timeline grid (`TimelineGrid.tsx`):

- Place every span with percentage `top`/`height` from `placeOnWindow`, never
  `flex-grow`, so Work stretches and the Phase wash behind them align.
  Percentages are of the column's real span (DST-safe).
- Phase ground: continuous `.tl__wash` tint — no border, radius, label, or
  click target. Day adds `.tl__rail` of Phase icons left of hours; Week is wash
  only.
- Work stretch figure: `.tl-block` card above the wash, tinted via
  `taskHue(task.id)` / `--task-hue` (same hue as its Insights Worked time
  swatch). Open stretch: `.tl-block--open` (unfinished bottom edge). Concurrent
  stretches: `col` / `cols` on each `.tl-block`.
- `HOUR_PX` is the sole density knob — sets `--tl-hour` inline and label
  thresholds. Change it there, not in CSS.

Pointer and drag:

- List sorting and Task table columns share `startPointerDrag` for threshold,
  pointer capture, and listener cleanup; their ordering and resize rules stay
  in their own hooks.
- Draggable surfaces drag from their body only. Never start a drag from a
  nested control — pointer capture steals the click.
- Calendar drag, resize, snap, open-stretch lock, and inline editor placement
  are defined in `CONTEXT.md` under Phase; hook classes are `.tl-block` and
  `.tl-block--open`.

## Cleanup passes

- Rank biggest-cut-first: dead files/deps → dead props → duplication → copy.
- Apply safe deletions directly. Flag anything touching business logic
  before changing it.
- Run `npm run test:typecheck` and `npm test` after every deletion.
