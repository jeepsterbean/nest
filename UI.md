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
- Segmented controls: shared `ViewToggle` (`.view-toggle`), one size everywhere,
  for single-select only. No per-Section size overrides.
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
  configures only the Control panel icon. Sidebar Section icons are picked
  from the Sidebar, and feature tiles take their icon from their own pane
  (Tasks, Brain dump, and Metrics heads; those are Core panes). The Timeline
  tile uses the Logs Sidebar icon. Last hour always uses the shared Insights
  mark. Choices are stored in
  `nest:overview-tile-icons`. Last hour and Control panel keep the
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
- Calendar: `.dash-section--calendar` (container `calendar`) holds the
  timetable `.tl` and Insights in `.calendar-body`, whose
  `.calendar-body--both` / `--calendar` / `--insights` follows the toolbar's
  `.calendar-display` toggle (stored in `nest:calendar-display`, Both when
  unset). Both puts `.calendar-body__grid` and a 20rem
  `.calendar-body__insights` column side by side, each scrolling on its own;
  at a Section width of 640px or less Insights moves under the grid. Week
  scrolls sideways once its days fall below `--tl-day-min` (7.5rem), with
  `.tl__heads`, `.tl__corner`, and `.tl__gutter` pinned. Last hour marks its
  window on today's Day grid with `.tl__span` in the lane and
  `.tl__span-mark` on the gutter.
- Insights (inside Calendar): `.insights-body` with `.insight-mix` (one grid of four
  `.insight-mix__row` Phase rows of name and duration),
  followed by Brain dumps, Tasks, and Metrics as direct `.insight-list` children
  of `.insights-body`. All four align left with 28px between rows and use
  the former right-column width: one third of the content width after a 48px
  column gap, with a 16rem minimum capped at the available width. At container
  widths of 720px or less, rows fill the available width. Its Tag list scrolls within
  8rem and uses the shared `.brain-dump-tag` pills with counts aligned right.
  Phases, Brain dumps, Tasks, and Metrics use matching `.insight-list` headings.
  Generic `.insight-list` list styles exclude `.insight-mix` (its shared
  name/duration grid) and `.insight-outcome__tasks` (its scroll box and
  `[hidden]` collapse).
  The Tasks row uses `.insight-ledger` (every range, Week included, is one ledger of
  `.insight-outcome` ledger lines: an `.insight-outcome__toggle` of
  `.insight-outcome__label` led by its `.insight-outcome__count`, then a
  dot-separated `.insight-outcome__total`, packed together; open, `.insight-outcome__tasks` lists swatch,
  title, time, in a scroll box about five rows tall whose
  `is-clipped-above` / `is-clipped-below` masks come from
  `useScrollOverflow`; an empty group is dimmed and disabled), and
  `.insight-pulses` (`.insight-pulse__toggle` disclosure per Pulse:
  `.insight-pulse__count` before `.insight-pulse__name`, then average,
  over one-line `.insight-metric` rows). It shares Calendar's range in
  `nest:date-range` (Day, Week, or Last hour; Day when unset; also reads
  legacy `nest:insights-range`). The toolbar title is a `DayPicker`
  (`.day-picker`, `.day-picker__panel`); Last hour hides Earlier / Later /
  Today and marks the title `.range-nav__live`.
- Logs: `.dash-section--logs` with multi-select filter chips
  (`.logs-kind-filter`: Brain dumps / Phases / Metrics / Tasks; double click
  isolates a kind). Each chip uses its kind's timeline mark color (`--phase`
  for Phases); on chips are tinted with a filled square, off chips are dashed
  with a hollow one. Timeline marks are bare kind-colored icons on a hairline
  through the mark column, from the first icon to the last in each day (no
  ring). Today opens with `.logs-chrono__row--now`, the current time and an
  empty event cell. `.logs-chrono__now` is a breathing dot on the spine;
  `.logs-chrono__row--after-now` continues a repeating squiggle until the
  next icon. Metric ratings are flat icon + number pairs,
  so rows avoid a column of circles. `nest:logs-preferences`
  stores `kinds` (all four when unset or stored before multi-select) and
  `scale` (`list` when unset; not `layout`, which older storage used). The
  toolbar (`.logs-toolbar`) has two `.logs-toolbar__row`s: `RangeNav` with a
  `DayPicker` (`markedDays` dots `.has-entries`), the selected day's
  `.day-group__export`, and the List / Hours `ViewToggle` in
  `.logs-toolbar__end`; then the filter chips and the List-only eye. List is `.logs-chrono`
  (`LogsTimeline`), without Phase totals. Hours (`LogsHours`) is one day on
  `TimelineFrame`; List day labels are `.day-group__open` buttons into Hours,
  and groups carry `data-day-key` for the selected-day scroll; each
  `.logs-hour` band scrolls horizontally when crowded and holds fixed-width
  `.logs-hour__mark` buttons (Tasks tinted by
  `--task-hue`), hover shows a `.logs-hour-card--preview` and a click pins the
  full `.logs-hour-card`, placed by `placeStretchEditor`. Task lifecycle
  rows and Working now boundaries use the configured Tasks icon as their timeline
  mark. The `.task-log` body shows a stronger Task title. Work starts show only
  that title; creation adds a Plus icon. Ordinary status changes show a leading
  middle dot, compact status badges with shared status dots, an arrow, and an
  em dash before the title. Completion, cancellation, and work stops retain
  muted action labels with Check, X, and Stop icons respectively. Rows wrap to
  preserve long titles and status transitions. Phases on adds
  settled Phase rows and colors the time column (`colorsTimeColumn`); Phases
  off leaves it quiet. With Phases alone, an eye icon button
  (`.logs-raw-toggle`, not stored) swaps the settled rows for every checkpoint
  in the window. The Logs icon is the `timeline` slot, picked from the Sidebar,
  and it also heads the Overview Timeline tile.
- Sidebar: every Section icon is a `NestIcon` from `nest:overview-tile-icons`
  (`overview`, `calendar`, `timeline` for Logs, `core`,
  `assistant`, `settings`). The first click selects that Section. Clicking the
  icon again while it is already selected opens `IconPickerButton`; a pick,
  Escape, or an outside press closes it. Core pane icons live in the separate
  Core navigation rail
  (slots `tasks` / `brainDump` / `metrics` / `phases`). Selecting the active
  pane again opens its icon picker. Tasks, Brain dump, and Metrics also mark
  their Overview tiles. Phases has no Overview tile.
- Core: one main Sidebar entry. `.core-sidebar` sits between the main Sidebar
  and `.dashboard__inner` as a quieter bordered panel under a serif `Core`
  heading, with four icon-and-label rows (Brain dump / Tasks / Metrics /
  Phases). Each icon sits on a tile tinted with that pane's Logs kind color
  (`--pane-tone`: `--dump`, `--doing`, `--accent`, `--phase`); the selected
  row is raised on `--surface` with a solid tile. Below 861px it drops the
  heading and labels and keeps the tiles, with accessible names and tooltips.
  Pane headers hold their own controls. The last pane
  is stored in `nest:core-pane` (Brain dump when unset). Panes stay mounted in
  `.core-slot` through `hidden` so filters, selection, and unsent names survive
  switches. `.dashboard__inner` also takes the active pane's layout class
  (`--brainDump`, `--tasks`, `--metrics`, `--phases`) so each pane keeps its
  former Section height rules.
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
  the `phases` slot (no Overview tile, and not the Core Sidebar icon) and the
  Phase appearance list.
  Phase appearance uses `--phase-color` / `--colored` on the Greetings board,
  Calendar rail and wash, Insights mix and totals, and Logs Phase rows.
- Settings: `.dash-section--settings` with Assistant / Reminders / Background
  panes via shared `ViewToggle`. Last pane is stored in `nest:settings-pane`
  (Assistant when unset). Panes stay mounted in `.settings-slot` through
  `hidden` so Assistant drafts survive switches.

## Timeline grid

- `TimelineFrame.tsx` owns the shared grid (gutter, rules, rail, wash, now
  line, scroll-to-now). Calendar's `TimelineGrid` and Logs Hours draw their
  figure through `renderLane`.
- Place every span with percentage `top` / `height` from `placeOnWindow`,
  never `flex-grow`, so the figure and the Phase wash align. Percentages use
  the column's real span and remain DST-safe.
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
The Brain dump pane of Core (`BrainDumpView`, `.dash-section--brain-dump`) has a
head with a History / Tags `ViewToggle`. The Core navigation rail holds its
Overview tile icon picker. The last pane is stored in `nest:brain-dump-pane` (History when
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
