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
  color persists in `nest.floating-brain-dumps`. The top-right
  `.floating-brain-dumps-toggle` hides or restores every sticky without
  minimising or changing its saved state.
- Calendar: timetable `.tl` under `.dash-section--calendar`.
- Insights: scoreboard `.dash-section--insights` with `.insight-mix`,
  `.insight-ledger`, and `.insight-pulses`. Range is remembered in
  `nest:date-range` (Day when unset; reads legacy `nest:insights-range`).
- Logs: `.dash-section--logs` with one `ViewToggle` (Timeline / Brain dumps /
  Phases / Metrics / Raw). Last view is stored in `nest:logs-preferences` (Raw
  when unset; migrates legacy `layout` + `rawFilter`). Phases is always
  aggregated. Raw and filtered panes share day-grouped `.timeline` / `.event`
  rows (`LogsEvents`); Timeline keeps `.logs-chrono`.
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

`BrainDumpSurface` is the only component that mounts several times on one
screen and reaches for browser singletons, which is what turns its bugs into
cross-instance ones. Three kinds of instance can be live at once: the Overview
`brainDump` tile, one per expanded `.floating-brain-dump` sticky, and the popup
composer. Each owns a separate TipTap editor with its own document, selection,
and undo stack; there is no active-editor registry, and focus moves natively.

The rule: anything a surface does to a process-wide resource must be
conditional on that surface owning it. Both long-standing caret bugs were that
rule broken.

Process-wide resources it touches:

- The document selection (`window.getSelection()`). Only the focused surface
  may change it; see `dismissTransientUi`.
- Focus. `handleDOMEvents.focus` only reports it outward, so a sticky can raise
  its z-index.
- `document.body`. Every visible bubble menu is appended there through
  `appendTo`, so menus from different surfaces are siblings and a menu's
  `parentNode` is the body rather than its own surface.
- Document-level capture listeners for `pointerdown` and `focusin`, one per
  surface with `dismissPopupsOnOutsideInteraction`. Each fires for clicks
  landing in every other surface.
- `window` `keydown`, from `useRecentBrainDumpHistory`: Cmd/Ctrl+[ and ] are
  global and navigate the Overview dump's history even while a sticky is
  focused.

Invariants that are easy to break:

- `lastLocalTextRef` suppresses the echo of this surface's own
  `onTextChange`. Without it every keystroke re-enters through `text`, and
  `setContent` throws the caret to the end of the document.
- History browsing reuses the same editor read-only. `setEditable(!readOnly,
  false)` must keep `emitUpdate` false, or leaving history publishes the
  displayed saved dump into the live draft.
- Minimising a sticky or hiding the board unmounts the surface, destroying its
  editor, selection, and undo stack. Expanding rebuilds from `text` with the
  caret at the start.

## Third-party editor behaviour

Behaviour we depend on that appears in neither the libraries' documentation nor
their types, only in their source. Each claim names the version it was read
from; re-verify them when bumping `@tiptap/*` or `prosemirror-*`.

- `commands.blur()` is deferred to `requestAnimationFrame` and then clears the
  whole document's selection rather than just this editor's (`@tiptap/core`
  3.31.3, `src/commands/blur.ts:18,24`). With more than one editor mounted it
  lands after a click has already placed a caret in another one. Use
  `editor.view.dom.blur()` instead: synchronous and local.
- The bubble menu cannot be relied on to hide when its editor blurs
  (`@tiptap/extension-bubble-menu` 3.31.3, `src/bubble-menu-plugin.ts:454,460`).
  It skips the hide while `preventHide` is set, which any mousedown on the menu
  sets (`:420`) and only the next blur clears; and again when the blur's
  `relatedTarget` sits inside `element.parentNode`, which is `document.body`
  whenever `appendTo` points there (`:599`). Hide it explicitly by dispatching
  the `'hide'` meta on a known plugin key (`:637`).
- `commands.focus()` is also deferred to `requestAnimationFrame`, and its
  `scrollIntoView` defaults to true (`@tiptap/core` 3.31.3,
  `src/commands/focus.ts:40,61`), so a toolbar press can scroll the surface.
- `commands.setContent()` replaces the whole document
  (`src/commands/setContent.ts:66`), so the selection maps to the end and the
  caret jumps there. Every external text sync pays this, which is why
  `lastLocalTextRef` exists.
- `useEditor(options, [])` keeps one instance but re-applies options whenever
  they compare unequal (`@tiptap/react` 3.31.3, `src/useEditor.ts:172,225`).
  Extension arrays and `editorProps` must be hoisted or memoized, or every
  render runs `setOptions` again.
- ProseMirror re-asserts the DOM selection 20ms after an editor gains focus
  (`prosemirror-view` 1.42.3, `src/input.ts:842`). A click that moves focus
  therefore repairs a broken caret by itself, while a click inside the already
  focused editor does not. A caret bug visible only in the second case points
  at something clearing the selection globally, not at click handling.

## Diagnosing caret and focus bugs

- First decide whether it is one surface or many: hide the stickies with
  `.floating-brain-dumps-toggle` so the Overview dump is the only live editor,
  then retry. A symptom that survives is local; one that disappears is a
  cross-instance problem with a browser singleton.
- Note whether the caret dies on a click that moves focus or on a click inside
  the already focused editor. Because of the 20ms repair above, only the second
  case exposes a global selection wipe.
- Paste this into the dev window's console (right-click, Inspect Element), then
  reproduce with a single click. The stack names whatever clears the selection.

```js
(() => {
  const at = () => "\n" + new Error().stack.split("\n").slice(2, 7).join("\n");
  const rar = Selection.prototype.removeAllRanges;
  Selection.prototype.removeAllRanges = function () {
    console.warn("WIPE removeAllRanges" + at());
    return rar.apply(this, arguments);
  };
  const bl = HTMLElement.prototype.blur;
  HTMLElement.prototype.blur = function () {
    console.warn("BLUR " + (this.className || this.tagName) + at());
    return bl.apply(this, arguments);
  };
  document.addEventListener("selectionchange", () => {
    const sel = getSelection();
    console.log("ranges=" + sel.rangeCount, document.activeElement?.className);
  });
  ["pointerdown", "mouseup", "focusin", "focusout"].forEach((type) =>
    document.addEventListener(type, (event) =>
      console.log(type, event.target.className || event.target.tagName), true));
})();
```

- `ranges=0` after mouseup means something cleared the selection, and the stack
  says who. A `focusout` on the editor means something blurred it. Neither,
  with the range still on the clicked node, means the selection is intact and
  the caret is simply not painted — a WKWebView rendering problem, so look at
  CSS rather than at handlers.
