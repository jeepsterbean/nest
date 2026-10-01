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
- Reuse `MenuSelect`, `NestIcon`, task menus, and shared icons in
  `icons.tsx` before adding controls. Open icon pickers only through
  `IconPickerButton`, which closes after a pick, on Escape, and on an outside
  press; `controlClassName` / `triggerClassName` restyle it and
  `color` / `onColorChange` add Metric color swatches.
- Dashboard Section behavior lives in the files `AGENTS.md` names; this file
  records concrete implementation hooks.

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
- Tasks: `.task-table`. Layout choice persists in `nest:task-view` (Table
  when unset). Column order and widths persist in `nest:task-table`. No
  Working now play control or Readiness column in the table; start work from
  the detail panel.
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
  the board has slack). `.overview-settings` overlays the right edge of
  `.overview-workspace` so opening it never reflows the tile grid. It starts
  closed each launch, opens from the settings button at the end of the
  Greetings board row, and closes on its X, Escape, or a press outside it
  (so it is unreachable while Doing hides the Greetings board). It
  configures only the icons with no other home: the Overview Section and
  Control panel. Feature tiles take their icon from their own Section (Tasks,
  Logs, Brain dump, and Metrics heads), and Last hour always uses
  the shared Insights SVG. Choices are stored in `nest:overview-tile-icons`,
  with an `overview` slot for the Section. Last hour and Control panel keep the
  default `.overview-tile__head`; the other tiles inline that icon into their
  own header. The resize grip lives on the tile's own
  lower-right corner. The Greetings board row carries compact saved-layout
  controls beside the Timer: `.dash-header__layout-name` captures a snapshot
  name and `.dash-header__layout-save` stores the current board under that
  name, keeping up to five snapshots in `nest:overview-layout-snapshots`. Tiles
  stack by stored y/x order below 861px, where drag and resize are disabled.
  `MetricCheckIn` is shared with the Popup. The Metric title carries
  `.metric-step__silence`, a pointer-only control that skips that Metric for
  the Metric check-in interval (`nest:silenced-metrics`); the due glow drops
  only when the Pulse has no Metric left to score. The read-only Tasks peek
  uses `TaskTable` (`readOnly`) and columns from `overviewTaskColumns()`. Timeline
  uses the same 30-day history as Logs, with `dayChrome` on when expanded.
  There is no dashboard dump modal or Sidebar dump button.
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
- Insights: scoreboard `.dash-section--insights` with `.insight-summary`
  (outcome `.day-stats` plus `.insight-mix`), `.insight-ledger`, and
  `.insight-pulses`. Its range lives in `nest:insights-range-mode`, apart
  from Calendar's `nest:date-range` (Day when unset; Calendar also reads
  legacy `nest:insights-range`). The toolbar title is a `DayPicker`
  (`.day-picker`, `.day-picker__panel`); Last hour hides Earlier / Later /
  Today and marks the title `.range-nav__live`.
- Logs: `.dash-section--logs` with a `ViewToggle` (Timeline / Brain dumps /
  Phases / Metrics) and, only under Timeline, a second `ViewToggle` (Rail / Raw).
  `nest:logs-preferences` stores `view` and `timelineLayout` (Timeline + Raw
  when unset; migrates the retired `raw` view and legacy `layout` +
  `rawFilter`). Raw and filtered panes share day-grouped `.timeline` / `.event`
  rows (`LogsEvents`); Rail keeps `.logs-chrono`, which has no Phase rows. The toolbar ends with a
  `.dash-section__tile-icon` picker, shared with the Tasks, Brain dump, Metrics,
  and Phases heads, that writes the `timeline` slot in `nest:overview-tile-icons`.
- Sidebar: Overview, Logs, Tasks, Brain dump, Metrics, and Phases render their
  picked `NestIcon` from `nest:overview-tile-icons` (`overview` / `timeline` /
  `tasks` / `brainDump` / `metrics` / `phases`); other Sections keep their fixed
  SVGs.
- Assistant: `.dash-section--assistant` with Chat / Config panes via
  `ViewToggle`. Chat uses `.assistant-workspace` for the saved-chat list and
  thread; Config uses `.assistant-prompt-workspace` for the saved-prompt list
  and editor. Chat titles use `useInlineRename`. Composer and prompt drafts
  persist in `nest:assistant-chat-drafts` and `nest:assistant-prompt-drafts`.
  Popup Chat removes the sidebar: `.assistant-popup-chat-picker` keeps New
  chat and the chat switcher in one row, followed by a four-control context
  row sized for the Popup pane. Popup Chat uses compact 28px controls and
  reduced thread/composer type without changing Dashboard Assistant sizing.
  Config has a fixed icon-only left sidebar for Chat and System. The selected
  group's `ViewToggle` stays at the top-left: Chat contains the four signals
  and Prompt; System contains System instructions, Model, and Layout. Each
  Chat section has an `IconPickerButton` for the composer menu of that signal
  or Prompt; the choice persists in `nest:assistant-context` with the rest of
  Config. Those Nest icons ride in as `MenuSelect` markers, sized at 16px by
  `shared-controls.css` — the menu is portaled out of the composer, so marker
  styling cannot be scoped to a feature. The API key is in Settings →
  Assistant. Signal and Layout sections use `.assistant-signal`:
  a fixed 320px controls rail on the left and a `.assistant-output` preview
  of the current records on the right at every dashboard width.
  Option lists, defaults, Task detail, active System
  instructions and the template persist in `nest:assistant-context`; every Save also adds an immutable local instruction version. System instruction versions appear in a scrollable sidebar and open in a right panel. The Rust boundary streams OpenAI output; each user
  message stores its full sent message and system-instructions snapshot. Dashboard user messages have an `Open` control
  that reveals that record in a right overlay panel; the renderer never receives
  the API key; without a keyring platform-store feature the key never reaches
  the system keychain and Send stays disabled after restart.
- Popup: 1040×460 (`tauri.conf.json`), not resizable. `.popup-workspace` is a
  grid with the Timer across the top (`grid-column: 1 / -1`) and a 48px
  `.popup-tabs` strip on the left. The strip holds one toggle per panel, each
  `aria-pressed` for its own panel, so any of the eight combinations can be
  showing. Tasks and metrics keeps `.popup-tabs__tab--due` for the Metric
  check-in dot even while its panel is hidden; silencing every shown Metric
  clears it. Panels are `.popup-pane` in one grid row, placed left to right in
  DOM order: Brain dump, Tasks and metrics, Chat.
  The element's own `grid-template-columns` is `48px repeat(n, minmax(0, 1fr))`
  for the n visible panels, so they split the width evenly;
  hidden panes are `display: none`, so they hold no column open, and
  `.popup-pane:not([hidden]) ~ .popup-pane:not([hidden])` rules only between
  panels. The combination persists in `nest:popup-panels` (an empty string is
  the valid "nothing showing" choice), migrated once from the superseded
  `nest:popup-tab`. Timer-due summons use the plain `#/popup` route. Popup
  Assistant mounts the first time Chat is shown,
  including when it is part of the restored combination, then stays mounted.
- Metrics: `.dash-section--metrics` with Pulses / Metrics panes via shared
  `ViewToggle` and a `.dash-section__tile-icon` picker for the `metrics` slot.
  Last pane is stored in `nest:metrics-pane` (Pulses when unset). Panes stay
  mounted in `.metrics-section__pane` through `hidden` so Pulse selection and
  an unsent Metric name survive switches.
- Phases: `.dash-section--phases` with a `.dash-section__tile-icon` picker for
  the `phases` Sidebar slot (no Overview tile) and the Phase appearance list.
  Phase appearance uses `--phase-color` / `--colored` on the Greetings board,
  Calendar rail and wash, Insights mix and totals, and Logs Phase rows.
- Settings: `.dash-section--settings` with Assistant / Reminders / Background
  panes via shared `ViewToggle`. Last pane is stored in `nest:settings-pane`
  (Assistant when unset). Panes stay mounted in `.settings-slot` through
  `hidden` so Assistant drafts survive switches.

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
  are defined in [`docs/time-surfaces.md`](./docs/time-surfaces.md#calendar).
  Hook classes are `.tl-block` and `.tl-block--open`.

## Brain dump surface

`SavedBrainDump` renders static rich text, recorded checklist states, timestamp,
and Tags on the shared sticky surface. `SavedBrainDumpPopover` is a fixed,
read-only sticky positioned 12px to the right of the opening cursor and centered
on its y-coordinate. It closes on an outside click or Escape.
The Brain dump Section (`BrainDumpView`, `.dash-section--brain-dump`) has a
head with a History / Tags `ViewToggle` and, at its right end, the Overview tile
icon picker. The last pane is stored in `nest:brain-dump-pane` (History when
unset). Both panes stay mounted in `.brain-dump-section__pane` through `hidden`
so History filters and an unsent Tag name survive switches.
`BrainDumpHistory` has range/tag controls and groups previews under local-day
labels (`.brain-dump-history__day`), each with a responsive
`.brain-dump-history__grid` of 154px-tall `.brain-dump-history__item` stickies
in a light `--dump` wash; inside a day, previews show only the time. Text cuts
off inside `.brain-dump-history__open`, which opens the same cursor-positioned
sticky, above a `BrainDumpTags` strip pinned to the bottom edge
(`selectedOnly`): the dump's Tags as static chips in a sideways-scrolling row,
with the `…` menu pinned at the right; it opens downward and adds or removes
Tags on the saved dump immediately.

Editor ownership, synchronization, dependency findings, diagnosis, and manual
checks live in [docs/editor.md](./docs/editor.md). For changes to editable
surfaces or editor dependencies, use the
[brain-dump-text-editor skill](./.agents/skills/brain-dump-text-editor/SKILL.md).
