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

- Dashboard styles are loaded through `src/dashboard/Dashboard.css`; that file
  preserves cascade order by importing focused files from `src/dashboard/styles/`.
- Greetings board: `DashboardHeader` (`.dash-header`) on Overview except while
  Phase tone is Doing (typewriter greeting, live Phase, Timer). Other Sections
  always omit it; Overview during Doing adds `.dashboard__inner--no-greetings`
  so content fills the area beside the Sidebar. Timer stays on the Popup.
- Sections show no title. Top controls stay in `.dash-section__head` or a
  sibling toolbar such as `RangeToolbar`; each Section keeps its own.
- Segmented controls: shared `ViewToggle` (`.view-toggle`), one size everywhere.
  No per-Section size overrides.
- Tasks: `.task-table`. No Working now play control or Readiness column in the
  table; start work from the detail panel.
- Tasks Map: `.task-map` fills the workspace. `.task-map__viewport` clips a
  6000x4000 `.task-map__canvas` that carries the pan/zoom transform; the
  sidebar `.task-map__tray` (composer row plus unplaced open tasks) and
  `.task-map__zoom` float over it. Each placed Task is an entity box
  `.task-entity` (header plus `.task-entity__field` attribute rows), and
  relation lines are an SVG overlay `.task-map__edges` — solid for
  Parent → child, dashed for Blocker → blocked. Layout is stored in
  `nest:task-map-v2`, pan/zoom in `nest:task-map-view`. Drags use
  `startPointerDrag` (box drags move, bare-canvas drags pan); every drag has a
  click fallback (sidebar click places, box remove button unplaces).
  The scope panel renders only in the table view; the task composer renders in
  both, inside `.task-map__tray` on the Map.
- Overview: `.overview-grid` holds six movable `.overview-tile` surfaces with
  ids `lastHour`, `tasks`, `timeline`, `brainDump`, `metrics`, and
  `controlPanel`. The control panel is always present, cannot be hidden, and
  shows hidden tiles as chips. Hiding a tile removes it from
  `nest:overview-layout`; clicking its chip restores it minimised at the first
  free spot, and dragging the chip onto the grid drops it at that spot when the
  rect fits. The 12-column / 12-row rules and defaults live in
  `overviewGrid.ts`; layout persists in `nest:overview-layout`. A drag first
  tries to push neighbours into free space; the default board fills all 144
  cells, so when there is nowhere to push the dragged tile trades slots with
  whichever tile it covers most, and the swap is refused if either tile would
  breach its minimum (Metric check-in is pinned to 4x2, so it only moves once
  the board has slack). Tile heads show a `NestIcon` chosen in Settings and
  stored in `nest:overview-tile-icons`; the resize grip lives on the tile's own
  lower-right corner. The Greetings board row carries compact saved-layout
  controls beside the Timer: `.dash-header__layout-name` captures a snapshot
  name and `.dash-header__layout-save` stores the current board under that
  name, keeping up to five snapshots in `nest:overview-layout-snapshots`. Tiles
  stack by stored y/x order below 861px, where drag and resize are disabled.
  `MetricCheckIn` is shared with the Popup. The read-only Tasks peek uses
  `TaskTable` (`readOnly`) and columns from `overviewTaskColumns()`. Timeline
  is today-only with
  `dayChrome={false}`. There is no dashboard dump modal or Sidebar dump button.
  Floating stickies are `.floating-brain-dump` (`data-color` paper / blush /
  sage / sky / lilac) with `.floating-sticky-colors` swatches in the header;
  color persists in `nest.floating-brain-dumps`. The Note Board is
  `.floating-note-board` (minimised: `--minimised`), always on the overlay
  with a warm ruled ink fill; its geometry persists in `nest.floating-note-board`.
  Docked drafts are `.floating-brain-dump--docked` rows inside it; a drag in
  progress adds `--lifting`. Hovering a free sticky over the expanded board
  hides that sticky (`--over-board`) and shows a
  `.floating-note-board__preview` row; the minimised bar is not a
  drop target. The top-right
  `.floating-brain-dumps-toggle` hides or restores
  free stickies without minimising them or hiding the Note Board.
- Calendar: timetable `.tl` under `.dash-section--calendar`.
- Insights: scoreboard `.dash-section--insights` with `.insight-mix`,
  `.insight-ledger`, and `.insight-pulses`. Range is remembered in
  `nest:date-range` (Day when unset; reads legacy `nest:insights-range`).
- Logs: `.dash-section--logs` with one `ViewToggle` (Timeline / Brain dumps /
  Phases / Metrics / Raw). Last view is stored in `nest:logs-preferences` (Raw
  when unset; migrates legacy `layout` + `rawFilter`). Phases is always
  aggregated. Raw and filtered panes share day-grouped `.timeline` / `.event`
  rows (`LogsEvents`); Timeline keeps `.logs-chrono`.
- Assistant: `.dash-section--assistant` with Chat / Config panes via
  `ViewToggle`. Chat uses `.assistant-workspace` for the saved-chat list and
  thread; Config uses `.assistant-prompt-workspace` for the saved-prompt list
  and editor. Chat titles use `useInlineRename`. Composer and prompt drafts
  persist in `nest:assistant-chat-drafts` and `nest:assistant-prompt-drafts`.
  Popup Chat removes the sidebar: `.assistant-popup-chat-picker` keeps New
  chat and the chat switcher in one row, followed by a four-control context
  row sized for the Popup pane. Popup Chat uses compact 28px controls and
  reduced thread/composer type without changing Dashboard Assistant sizing.
  Config has a fixed left sidebar: Chat contains the four signals and Prompt;
  System contains System instructions and Layout. The API key is in Settings →
  Assistant. Signal and Layout sections use `.assistant-signal`: a fixed 320px
  controls rail on the left and a `.assistant-output` sample preview on the
  right at every dashboard width.
  Option lists, defaults, Task detail, System
  instructions and the template persist in `nest:assistant-context`. The Rust boundary streams OpenAI output; each user
  message stores its selected context snapshot and the renderer never receives
  the API key; without a keyring platform-store feature the key never reaches
  the system keychain and Send stays disabled after restart.
- Settings: `.dash-section--settings` with Metrics / Phases / Tags / Reminders /
  Last hour / Tasks / Timeline / Brain dump / Control panel / Background panes
  via shared `ViewToggle`. Last pane is stored in `nest:settings-pane`
  (Metrics when unset). Panes stay mounted in `.settings-slot` through
  `hidden` so Metrics sub-state survives switches. Metrics uses
  `.settings-pane--metrics` (Pulses / Metrics sub-toggle), and tile icon panes
  reuse `.tile-settings` with the phase-settings controls. Phase appearance
  uses `--phase-color` / `--colored` on the Greetings board, Calendar rail and
  wash, Insights mix and totals, and Logs Phase rows.

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

## Brain dump surface

`SavedBrainDump` renders static rich text, recorded checklist states, timestamp,
and Tags on the shared sticky surface. `SavedBrainDumpPopover` is a fixed,
read-only sticky positioned 12px to the right of the opening cursor and centered
on its y-coordinate. It closes on an outside click or Escape.
Settings uses `BrainDumpSettings` with shared range/tag controls and a responsive
`.brain-dump-history__grid` of 154px-tall saved-sticky previews; clicking a
preview opens the same cursor-positioned sticky.

Editor ownership, synchronization, dependency findings, diagnosis, and manual
checks live in [docs/editor.md](./docs/editor.md). For changes to editable
surfaces or editor dependencies, use the
[brain-dump-text-editor skill](./.agents/skills/brain-dump-text-editor/SKILL.md).
