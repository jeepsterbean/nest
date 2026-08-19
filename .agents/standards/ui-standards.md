# Frontend and UI standards

Supplements `coding-standards.md`. Applies to Nest’s functional surfaces
(dashboard, check-in popup, forms) — not marketing pages.

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
  dashboard view or the check-in popup.
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

- Keep reflection and capture actions immediately available.
- Prefer quiet progressive disclosure over modal or oversized controls.
- Preserve drafts when switching views or collapsing detail.
- Interactive controls need accessible names and visible focus states.
- Compact targets are fine when clearly labeled; don't crowd the workspace
  with decorative chrome.
- Logs is filtered history: Raw / Brain dumps / Phases / Metrics.
  Phases adds a Raw | Aggregated sub-toggle (60s settle collapse). No heading,
  day strip, or outcome stats — the view filters are the only chrome.
- Every segmented control uses the shared `ViewToggle` (`.view-toggle`) at one
  size. No per-section size overrides; don't reinvent it per view.
- Overview’s last-hour band (`.overview-day`) is lean: outcome stats and Phase
  duration totals only — no strip. Always show Completed / Value / Effort /
  Check-ins and Doing / Scoping / Resting / Offline for the selected window,
  using 0 when nothing happened. The dump panel (`.overview-panel--dumps`)
  matches the check-in popup composer: one textarea, shared draft,
  Cmd/Ctrl+Enter. Dump history is Logs-only; there is no dashboard dump
  modal or sidebar dump button.
- Calendar owns the timetable (`.tl`) under `.dash-section--calendar`. Insights
  is the ranged scoreboard under `.dash-section--insights`: Phase mix
  (`.insight-mix`), Tasks with Worked time grouped by status as of that day's
  end (`.insight-ledger`), including Completions and Cancellations with no
  Working now that day, and Pulse Metric scores (`.insight-pulses`) for the
  range — the column stays when there are no check-ins. Outcome
  counts stay on Overview. Both share Day / Week
  and Earlier / Later / Today. Remember the last range (`nest:insights-range`);
  Day only when nothing is stored. Compact range toggle matches Logs.
- Drag a `.tl-block` body to move the Work stretch; drag a start or end edge to
  resize. Times snap to 15-minute marks. Resize will not shrink below 15 minutes
  unless now is closer. That floor is calendar-drag only. An open stretch's live
  end stays pinned to now. Click still opens the editor if the pointer barely
  moves. The editor sits beside the selected stretch, left or right of that
  block — toward its outer edge when two share the hour, otherwise toward
  whichever side has room. It flips if the preferred side would leave the
  window. It closes once its stretch has scrolled out of the grid, so a card
  fixed to the viewport never outlives the block it edits. The Task title is
  editable. Start and end each have a date and a time; the times save before the
  rename, since only the times can be refused.
- The grid is a linear clock running down the page: place every span with
  percentage `top`/`height` from `placeOnWindow`, never `flex-grow`, so a Work
  stretch and the Phase wash behind it agree. Percentages are of the column's
  own real span, so a DST day still lands correctly.
- Phase is ground: a continuous `.tl__wash` tint behind the lane, no border, no
  radius, no label, never clickable. Day adds a `.tl__rail` of Phase icons left
  of the hours; Week is wash only. Concurrent Work stretches sit side by side
  (`col` / `cols` on each `.tl-block`) because multiple Tasks may be Working
  now. A stretch is figure: a `.tl-block` card above the wash, tinted by
  `taskHue(task.id)` through `--task-hue`, the same hue its swatch carries in
  the Insights Worked time list.
- `HOUR_PX` in `TimelineGrid.tsx` is the one density knob — it sets `--tl-hour`
  inline and decides which blocks are tall enough to carry a label. Change it
  there, not in CSS.
- A draggable surface drags from its own body. Never start a drag from a
  control nested inside it — pointer capture eats the control's click, so the
  press lands as a move instead of the action the user aimed at.

## Cleanup passes

- Rank biggest-cut-first: dead files/deps → dead props → duplication → copy.
- Apply safe deletions directly. Flag anything touching business logic
  before changing it.
- Run `npm run test:typecheck` and `npm test` after every deletion.
