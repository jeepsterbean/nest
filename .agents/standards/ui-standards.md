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
  Ready, Scope, Working now, Pulse, Brain dump). Avoid todo/subitem jargon.

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
- Journal is a filtered history log: Raw / Brain dumps / Phases / Metrics.
  Phases adds a Raw | Aggregated sub-toggle (60s settle collapse). Keep switches
  compact under `.dash-section--journal .view-toggle`. No day strip or outcome
  stats in Journal.
- Overview’s last-hour band (`.overview-day`) is lean: outcome stats and Phase
  duration totals only — no strip. Always show Completed / Value / Effort /
  Check-ins and Doing / Scoping / Resting / Offline for the selected window,
  using 0 when nothing happened. Insights owns the strip and range filters
  (1h / 24h / 7d / 30d) under `.dash-section--insights`. Remember the last
  range (`nest:insights-range`); 24h only when nothing is stored. Stats stay a quiet
  inline meta row (`.day-stats`). Compact range toggle matches Journal.
- A draggable surface drags from its own body. Never start a drag from a
  control nested inside it — pointer capture eats the control's click, so the
  press lands as a move instead of the action the user aimed at.

## Cleanup passes

- Rank biggest-cut-first: dead files/deps → dead props → duplication → copy.
- Apply safe deletions directly. Flag anything touching business logic
  before changing it.
- Run `npm run test:typecheck` and `npm test` after every deletion.
