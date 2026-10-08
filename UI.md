# Nest UI implementation

This file supplements the project-agnostic UI standards in
`.agents/standards/ui-standards.md`. Follow `.impeccable.md` for Nest's brand,
tone, and aesthetic direction. Preserve light and dark system themes.

## Copy and interaction

- Sections have no title; the Sidebar names the current place. The Greetings
  board greeting on Overview is not a Section title.
- Prefer domain words from `CONTEXT.md` in user-facing copy: Task, Blocker,
  Ready, Scope, Working now, Work stretch, Pulse, Brain dump, Timeline, Logs, Section,
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
  sibling toolbar; each Section keeps its own.
- Segmented controls: shared `ViewToggle` (`.view-toggle`), one size everywhere,
  for single-select only. No per-Section size overrides.
- Tasks: `.task-table`. Layout choice persists in `nest:task-view` (Table
  when unset). Column order, widths, and hidden columns persist in `nest:task-table`.
  Visible columns fill `.task-table-wrap`; a resize handle trades width with the
  next column. The table scrolls horizontally only when min widths exceed the wrap.
  No Working now play control or Readiness column in the table; start work from
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
  Column-header filter/sort menus use `.task-column-trigger` and portal-mounted
  `.task-column-menu` (`__head` with `__reset`, then `__row`s for Sort and
  Filter with a muted `__hint` and `__chevron`, and a muted `__row--action`
  for Hide column). Sort and Filter options open in a sibling
  `.task-column-menu--submenu` flyout placed by `placeSubmenu` (right of the
  menu, flipping left near the edge); it holds the `__presets` segmented
  control and `__search` for long Parent lists. A Sort-only column (Title)
  keeps a single `__section` with the options inline. The hidden-columns pill
  is `.task-filter-pill--columns` with `__icon` and a hover `__names` list whose rows carry their own remove
  buttons. In dark mode the menu
  lifts to `--surface-2` with a heavier shadow so it separates from the rows.
  Menu options mark selection with a trailing check only; row fills are for
  hover and focus. `.task-table-toolbar` holds `.task-table-summary` — the
  count in `.task-filter-result`, removable `.task-filter-pill` pills, and
  `.task-filter-clear` — on the left, and `.task-new-button` on the right.
  TasksView owns the single open column menu; outside pointer dismissal runs
  in capture phase so nested controls can stop bubbling safely.
  The `.task-table__move` grip supports column dragging.
  The one-line task composer renders only inside `.task-map__tray` on the Map.
  The table's `.task-new-button` opens `TaskCreateCard`: a `.task-create-overlay`
  scrim (z-index 75, under MenuSelect menus at 80) holding `.task-create-card`.
  Only a press on the scrim itself dismisses, because MenuSelect menus are
  React children of the card and their events bubble through it.
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
  configures the Timeline and Control panel icons. Sidebar Section icons are picked
  from the Sidebar, and feature tiles take their icon from their own pane
  (Tasks, Brain dump, and Metrics heads; those are Core panes). Timeline and
  Control panel are configured in Overview settings. Last hour always uses the shared Insights
  mark. Choices are stored in
  `nest:overview-tile-icons`. Last hour and Control panel keep the
  default `.overview-tile__head`; the other tiles inline that icon into their
  own header. Last hour renders Calendar's `InsightsPanel` with
  `variant="tile"` (`.insights-body--tile`): the four `.insight-list`
  sections sit side by side, wrap below about 11rem each, and scroll inside
  the tile body, with the head icon top-aligned to their headings. The resize grip lives on the tile's own
  lower-right corner. Saved grid layouts live in the Overview Section sidebar
  (`OverviewLayoutSidebar`, `.overview-layouts`); see
  `docs/time-surfaces.md` for the rules. Each row has a picked icon, an
  `.overview-layouts__edited` dot on the tile corner while the selected layout
  has unsaved changes, Save · Revert links under it, and a ⋯
  `.overview-layouts__menu` (Rename, Delete with an in-menu confirm). The ⋯
  stays out of the hit target until the row is hovered, focused, or open.
  Switching away from an edited board asks first in the inline
  `.overview-layouts__confirm`: Save and switch, or Save as new when the board
  belongs to no layout. The dashed `.overview-layouts__add` row turns into an
  inline name field. An outside press that finds text there saves the name
  without activating the control under the pointer. Below 861px, fields, Save ·
  Revert, and prompts open beside the rail. Layouts persist in
  `nest:overview-layout-snapshots` (a key
  kept from before the sidebar) and the selection with its edited flag in
  `nest:overview-layout-selection`. Tiles
  stack by stored y/x order below 861px, where drag and resize are disabled.
  `MetricCheckIn` is shared with the Popup for manual scoring. The read-only
  Tasks peek uses `TaskTable` (`readOnly`) and columns from `overviewTaskColumns()`. The
  Overview Timeline tile uses `LogsTimeline` for the same 30-day history as
  Calendar's Timeline presentation, with `dayChrome` on when expanded, the same
  `.logs-kind-filter` chips and Phases-only `.logs-raw-toggle` (kinds start as
  all four and are not stored), and no Phase totals. The chip row
  (`.logs-kind-filter`) scrolls sideways when the tile is too narrow.
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
  timetable `.tl` and Insights in `.calendar-body`, which gains
  `.calendar-body--both` while the toolbar's `.calendar-insights-toggle`
  (`aria-pressed`, right-panel glyph, inside `.calendar-panel-controls`) shows
  Insights (stored in `nest:calendar-display`, shown when unset). Both puts
  `.calendar-body__grid` and a 20rem
  `.calendar-body__insights` column side by side, each scrolling on its own;
  at a Section width of 640px or less Insights moves under Calendar. Week
  scrolls sideways once its days fall below `--tl-day-min` (7.5rem), with
  `.tl__heads`, `.tl__corner`, and `.tl__gutter` pinned. Last hour marks its
  window on today in Day with `.tl__span` in the lane and
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
  over `.insight-metric` rows with a wrapping `.insight-metric__ribbon` of
  compact shared `.rating-pill` scores and a right-aligned average). It shares Calendar's range in
  `nest:date-range` (Day, Week, or Last hour; Day when unset; also reads
  legacy `nest:insights-range`), picked in the range sidebar.
- Timeline presentation: `.dash-section--timeline` with multi-select filter chips
  (`.logs-kind-filter`: Brain dumps / Phases / Metrics / Tasks; double click
  isolates a kind; the row scrolls sideways when the toolbar is too narrow). Each chip uses its kind's timeline mark color (`--phase`
  for Phases); on chips are tinted with a filled square, off chips are dashed
  with a hollow one. Timeline marks are bare kind-colored icons on a hairline
  through the mark column, from the first icon to the last in each day (no
  ring). Today opens with `.logs-chrono__row--now`, the current time and an
  empty event cell. `.logs-chrono__now` is a breathing dot on the spine;
  `.logs-chrono__row--after-now` continues a repeating squiggle until the
  next icon. Metric ratings are flat icon + number pairs,
  so rows avoid a column of circles. `nest:logs-preferences`
  stores `kinds` (all four when unset or stored before multi-select; a stored
  `scale` from the retired List / Hours switch is ignored) and is shared with
  Calendar's Logs figure. The
  toolbar (`.logs-toolbar`) has two `.logs-toolbar__row`s: the selected day's
  `DateNavigation` (Previous day, Next day, Go to today), then the filter chips and the Phases-only eye. The list is `.logs-chrono`
  (`LogsTimeline`), without Phase totals. Day labels are `.day-group__open` buttons that open that day on Calendar's Logs figure,
  and groups follow the selected date range. Task lifecycle
  rows and Working now boundaries use the configured Tasks icon as their timeline
  mark. The `.task-log` body shows an emphasized Task title, an em dash,
  and a compact activity badge (`Title — Activity`). Rows wrap to preserve
  long titles. Phases on adds
  settled Phase rows and colors the time column (`colorsTimeColumn`); Phases
  off leaves it quiet. With Phases alone, an eye icon button
  (`.logs-raw-toggle`, not stored) swaps the settled rows for every checkpoint
  in the window. The Timeline icon is the `timeline` slot, picked in Overview
  settings, and it also heads the Overview Timeline tile.
- Sidebar: every Section icon is a `NestIcon` from `nest:overview-tile-icons`
  (`overview`, `calendar`, `core`, `assistant`, `settings`). The first click selects that Section. Clicking the
  icon again while it is already selected opens `IconPickerButton`; a pick,
  Escape, or an outside press closes it. Core pane icons live in the separate
  Core navigation rail
  (slots `tasks` / `brainDump` / `metrics` / `phases`). Selecting the active
  pane again opens its icon picker. Tasks, Brain dump, and Metrics also mark
  their Overview tiles. Phases has no Overview tile.
- Section sidebar: Core, Overview, and Calendar add a second rail, `.section-sidebar`
  (grid class `.dashboard--section-sidebar`), between the main Sidebar and
  `.dashboard__inner`: a quieter bordered panel under a serif Section heading
  with `.section-nav__button` icon-and-label rows. Each icon sits on a tile
  tinted with `--pane-tone`; the selected row is raised on `--surface` with a
  solid tile, and selecting it again opens its icon picker. Below 861px the
  rail drops the heading and labels and keeps the tiles, with accessible names
  and tooltips.
- Core: one main Sidebar entry. Its Section sidebar rows are Brain dump /
  Tasks / Metrics / Phases, each toned with that pane's Logs kind color
  (`--dump`, `--doing`, `--accent`, `--phase`).
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
  showing. Panels are `.popup-pane` in one grid row, placed left to right in
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
- Metrics: `.dash-section--metrics` reads one local day at a time through the
  shared `DateNavigation` (previous, next, back to today; it opens on today and
  cannot pass it). Days older than the dashboard's history window load on
  demand through `useDayRecords`. Its icon is picked from the Core Sidebar. `.metrics-board`
  lists one `.metric-group` per Pulse (icon and serif name, `Hidden from popup`
  when hidden), then a `Not in a pulse` group for Metrics outside every Pulse.
  Each `.metric-row` (46px, columns from `--metric-columns`) reads name, a
  `.metric-day` strip, and the latest rating as a serif number tinted by its
  rating color (`—` when none). The strip runs midnight to midnight: hour
  ticks every 3 hours, on today a shaded `.metric-day__later` from now to the
  end of the day, and one `.metric-day__dot` rating pill per Metric check-in placed at
  its time. A check-in within 45 minutes of the previous one lifts into a
  second lane. A Pulse row only plots that Pulse's check-ins. A sticky
  `.metric-axis` above the groups labels 6, 12 and 18 o'clock on the same
  columns, and hides under 860px, where the strip wraps under the name.
  Setup lives behind the header `Edit` / `Done` toggle (not persisted): strips
  hide; Pulse headings gain a grip, icon picker, click-to-rename name,
  `Show in popup` switch and delete; Metric rows gain a grip, icon and color
  picker, click-to-rename name and remove (×), all always visible. Pulses drag
  by their heading, Metrics within their Pulse. `Add metric` offers existing
  Metrics or `New metric…`, which creates and adds in one step; `New pulse`
  closes the list. Leaving Edit drops open composers.
- Phases: `.dash-section--phases` is a read-only `.phase-guide`: an intro on
  how Phase is derived and one bordered `.phase-list` (`<ol>` as Doing,
  Scoping, Resting, Offline from `src/dashboard/lib/phaseGuide.ts`). Each
  `.phase-row` reads a 24px tinted `.phase-row__icon`, the name, and
  `.phase-row__meaning` in the column to its right; under a 480px container the
  meaning wraps beneath the name. The current Phase's row carries
  `data-current`, and its icon breathes a halo in its color. Its icon is picked from the Core
  Sidebar; Phases has no Overview tile.
  Phase appearance uses `--phase-color` on the Phases list, Greetings board,
  Calendar rail and wash, Insights mix and totals, and Timeline Phase rows.
- Settings: `.dash-section--settings` with Assistant / Reminders / Background
  panes via shared `ViewToggle`. Last pane is stored in `nest:settings-pane`
  (Assistant when unset). Panes stay mounted in `.settings-slot` through
  `hidden` so Assistant drafts survive switches.

## Calendar timetable

- `TimelineFrame.tsx` owns the shared Calendar chrome (gutter, rules, rail, wash, now
  line, scroll-to-now). Calendar's `TimelineGrid` and Logs figure draw their
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
single History surface in `.brain-dump-section__pane`. The Core navigation rail
holds its Overview tile icon picker. `BrainDumpHistory` defaults to Today;
previous/next arrows navigate local calendar days, and a double-forward
chevron returns to Today. Next day is disabled on Today; navigation is capped
at Today. `.brain-dump-filter-tags__scroll`
holds all Tag filters and All tags on a separate row below the day navigator;
Add tag stays pinned alongside it. `DateNavigation` is shared with the
Calendar/Timeline month picker: centered 14px chevrons in 26px buttons, common
focus/disabled styles, and stationary arrow positions. The day label occupies
a fixed 220px; the month label fills the fixed sidebar width between arrows.
Only Brain dump supplies the optional double-forward Today action.
Tag context menus support right-click and Shift+F10, with Rename and Delete.
The menus and Tag name forms use a portal under `.dashboard` to escape
scrolling containers while inheriting the opaque light/dark theme surfaces.
The selected day has a responsive
`.brain-dump-history__grid` of 154px-tall `.brain-dump-history__item` stickies
in a light `--dump` wash; inside a day, previews show only the time. On Today,
`.brain-dump-history__item--composer` spans two columns and three rows and
holds a writeable `BrainDumpSurface` (`layout="overview"`) that shares the
Overview/popup draft. Its frame, editor padding, and Tag strip match the
Overview dump tile; saved history stickies, floating drafts, docked Note Board
rows, the Note Board frame, and `SavedBrainDump` / its popover use that same
6px corner radius. The header shows the live clock time on the left and a
control that peels the live draft on the right. Each saved dump has
`.brain-dump-history__peel` at the top right to copy it into a floating draft.
The next three dumps use `.brain-dump-history__item--wide` (two columns, one
row); later dumps are single cells. Past days keep the dump grid only.
Text cuts
off inside `.brain-dump-history__open`, which opens the same cursor-positioned
sticky, above a `BrainDumpTags` strip pinned to the bottom edge
(`selectedOnly`): the dump's Tags as static chips in a sideways-scrolling row,
with the `…` menu pinned at the right; it opens downward and adds or removes
Tags on the saved dump immediately.

Editor ownership, synchronization, dependency findings, diagnosis, and manual
checks live in [docs/editor.md](./docs/editor.md). For changes to editable
surfaces or editor dependencies, use the
[brain-dump-text-editor skill](./.agents/skills/brain-dump-text-editor/SKILL.md).

- Calendar range sidebar: `.dashboard--range-sidebar` reserves a 224px
  Section rail (200px below 861px). `.range-sidebar` holds the Section title,
  a full-width Calendar / Timeline `ViewToggle` stored in
  `nest:calendar-presentation`, and a `.range-sidebar__dates` group separated
  by spacing and a subtle divider. Calendar's date group holds a full-width
  Last hour / Day / Week `ViewToggle` and the inline `DayCalendar`
  with a muted month header (faded in Last hour until hovered; Timeline dots
  `.has-entries` days). Calendar remembers its range in `nest:date-range`.
  Timeline stays on Day and shows only `DayCalendar`; saved `nest:logs-range`
  modes are ignored. Each presentation keeps its selected date for the session.
  The highlighted days are the range;
  there is no range title text. At 600px or
  less the range controls move above the content beside the main Sidebar.
  `.calendar-panel-controls` holds a Work stretch / Logs `ViewToggle` at the
  left (`nest:calendar-figure`, Work stretch when unset). Logs reveals the
  kind chips. The Insights toggle stays at the right; Calendar is
  always shown. Logs Week is one shared week: one hour gutter and a
  column per day. Calendar Logs (`LogsHours`) draws `.logs-hour` bands on
  `TimelineFrame`; each band scrolls horizontally when crowded and holds
  fixed-width `.logs-hour__mark` buttons (Tasks tinted by `--task-hue`).
  Hover shows a `.logs-hour-card--preview` and a click pins the full
  `.logs-hour-card`, placed by `placeStretchEditor`.
