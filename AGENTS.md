# Agent documentation

Nest is a private self-care desktop app: Tauri 2 + React + TypeScript on the
frontend, Rust + SQLite on the backend. Prefer the smallest change that
preserves calm, private, flow-friendly behavior.

## Context routing

Read the source relevant to the task before changing it. Do not read every
reference by default.

| Task | Read |
|---|---|
| Any implementation | `.agents/standards/coding-standards.md` |
| Dashboard implementation | `src/dashboard/AGENTS.md` |
| Rust, SQLite, or Tauri backend implementation | `src-tauri/AGENTS.md` |
| Schema, migration, command payload, or shared DTO change | `.agents/skills/schema-ipc-change/SKILL.md` |
| Phase derivation, Working now, lifecycle, lock/sleep, or quit behavior | `docs/domain/phases.md`, then `.agents/skills/phase-lifecycle/SKILL.md` |
| Domain words, Ready/Blocked | `CONTEXT.md` |
| Terminology or documentation consistency audit | `.agents/skills/terminology-docs-audit/SKILL.md` |
| History ranges, Phase settling, or summary calculations | `docs/domain/history.md` |
| Phases pane interactions | `docs/interface/phases.md` |
| Task rules, relationships, readiness, or history | `docs/domain/tasks.md` |
| Tasks Day, Table, Map, or detail interactions | `docs/interface/tasks.md` |
| Calendar, Insights, or Timeline interactions | `docs/interface/calendar.md` (Insights: `#insights`, Timeline: `#timeline`), then `docs/interface/time-surfaces.md` for shared date, Last hour, and Logs kind rules |
| Pulse membership or Metric check-in records | `CONTEXT.md`, `docs/domain/metrics.md` |
| Metrics pane interactions | `docs/interface/metrics.md` |
| Timer countdown, interval, or due state | `docs/domain/timer.md` |
| Timer controls or readouts | `docs/interface/timer.md` |
| Popup | `docs/interface/popup.md` |
| Brain dump records or Tag rules | `docs/domain/brain-dump.md` |
| Brain dump capture, browsing, Note Board, or stickies | `docs/interface/brain-dump.md` |
| Brain dump editor, caret/focus, formatting menu, draft sync, TipTap, or ProseMirror | `.agents/skills/brain-dump-text-editor/SKILL.md` |
| Sidebar or Settings | `CONTEXT.md`, `UI.md` |
| Dashboard or popup presentation | `.agents/standards/ui-standards.md`, `.impeccable.md`, `UI.md` |
| Open product work | `BACKLOG-FEATURE-REQUESTS.md` |

## Which Nest doc to edit

| Change kind | File |
|-------------|------|
| Product language, shared domain distinctions | `CONTEXT.md` |
| Phase derivation, work recording lifecycle | `docs/domain/phases.md` |
| Phases pane interactions | `docs/interface/phases.md` |
| Task fields, relationships, readiness, history, deletion | `docs/domain/tasks.md` |
| Tasks dashboard interactions | `docs/interface/tasks.md` |
| History ranges, Phase settling, range summary calculations | `docs/domain/history.md` |
| Calendar, Insights, Timeline interactions | `docs/interface/calendar.md` |
| Rules shared across time surfaces (navigation, Last hour, Logs kinds, Phase appearance) | `docs/interface/time-surfaces.md` |
| Metric records and Pulse membership | `docs/domain/metrics.md` |
| Metrics pane behavior | `docs/interface/metrics.md` |
| Timer state and cadence | `docs/domain/timer.md` |
| Timer controls and readouts | `docs/interface/timer.md` |
| Popup | `docs/interface/popup.md` |
| Brain dump records and Tag rules | `docs/domain/brain-dump.md` |
| Brain dump capture / Note Board | `docs/interface/brain-dump.md` |
| Design feel / brand / UX principles | `.impeccable.md` |
| Shared dashboard controls, shell, cross-surface UI rules | `UI.md` |
| Non-obvious CSS or layout constraint | comment beside the rule |
| Brain dump editor invariants or library behavior | `docs/interface/editor.md` |
| Closing, parking, or adding durable product work | `BACKLOG-FEATURE-REQUESTS.md` |
| Engineering backlog | `BACKLOG-BACKEND.md` |
| Product status, setup, repo-wide guidance | `README.md` |
| Non-obvious implementation constraints | code comments |

Project-agnostic process rules live under `.agents/standards/`, which
`.claude/standards/` and `.codex/standards/` expose through symlinks. Keep
each fact in its closest authoritative source and link to it elsewhere.

## Writing documentation

Follow the table above when editing a Nest doc.

- `docs/domain/` owns records, validation, relationships, lifecycle, and shared
  calculations, wherever the implementation runs.
- `docs/interface/` owns frontend navigation, controls, keyboard and focus,
  drafts, display behavior, and surface preferences. Link to domain rules
  instead of repeating them. A surface-only topic needs no matching domain doc.
- Write the fact in the file that owns it, and link to that file from anywhere
  else. When the owner already says it, delete the copy.
- `CONTEXT.md` keeps domain definitions and distinctions several surfaces
  share, with links to the authoritative rules. Include naming guidance when
  it resolves an ambiguity; use the inline format of the existing entries.
- A surface doc keeps what that surface does: what is saved, what an action
  changes, keyboard and focus, empty and missing cases, and a boundary with
  another surface.
- Keep a sentence when leaving it out would let someone build the wrong
  behavior. Drop a sentence that only places a control, names a color or
  weight, or gives a size in pixels. A breakpoint, a shared row, and a corner
  radius stay in the CSS comment the table already names. A limit that exists
  so copy fits a control stays with that control, beside the CSS and the
  constant.
- When one sentence mixes a behavior rule with placement or paint, keep the
  rule.
- A negative earns its place when it settles a mix-up the other docs would
  leave open, such as the Tasks table having no scope sidebar. Skip a negative
  that repeats a positive rule already written beside it.
- Copy the interface must say stays in the surface doc. Class names, component
  names, and file paths stay in `UI.md` and `docs/interface/editor.md`.

## Package manager

- This repository uses npm. `package-lock.json` is the source of truth for JS
  dependency resolution. Rust dependencies use `src-tauri/Cargo.lock`.
- Use `npm install` for JS dependencies and `npm run <script>` for package
  scripts.
- Do not introduce Bun, Yarn, or pnpm, and do not commit `bun.lock`,
  `bun.lockb`, `yarn.lock`, or `pnpm-lock.yaml`.
- Keep `src-tauri/tauri.conf.json` `beforeDevCommand` / `beforeBuildCommand`
  aligned with the npm scripts they invoke.

## Repository-wide invariants

- The dashboard has two Sections, Calendar and Core, and starts on Calendar.
- Prefer domain vocabulary from `CONTEXT.md`. Do not invent synonyms in
  user-facing copy or new domain types.
- Distinguish persisted Task statuses (`backlog`, `up_next`, `active`,
  `completed`, `cancelled`) from derived readiness (`Ready` / `Blocked`).
  Ready/Blocked come from unresolved Blockers; they are not stored status
  values.
- Do not introduce `any` when an existing or inferred type can express the
  value. Keep TypeScript `strict` clean.
- At application seams, trim and reject empty names or titles in Tauri
  commands, validate statuses, scores, and intervals in Rust, and keep SQLite
  constraints as the last line of defense.
- Frontend invokes only through `src/lib/commands/` (import the folder barrel).
  The `commands/` and `types/` barrels are `export *` lines, so a new export
  needs no barrel edit; a new file needs one line.
- Shared DTO shapes live in `src/lib/types/` and must stay aligned with Rust
  models in `src-tauri/src/models/` and command payloads in
  `src-tauri/src/commands/`.
- Do not call `invoke` ad hoc from views when a command helper exists or belongs
  in `src/lib/commands/`.

## Language and copy

- The interface is English only. There is no locale picker and no i18n
  framework.
- User-facing copy should match the calm, private tone in `.impeccable.md` and
  the domain distinctions in `CONTEXT.md`.
- Timer and Popup chrome, aria, and class names use Timer / Popup / due, never
  check-in. Timer readouts live in `docs/interface/timer.md`.
- Prefer the shared formatters in `src/dashboard/lib/time.ts` for dashboard
  dates and times instead of scattering one-off `Intl` / `toLocale*` options
  across views.

## Verification

- Ordinary frontend or shared-type changes from the repository root:
  - `npm run test:typecheck`
  - `npm test`
  - `npm run build` when the change can affect bundling or `tsc` project refs
- Rust, SQLite, and Tauri checks live in `src-tauri/AGENTS.md`.
- There is no separate JS lint script today; rely on TypeScript strictness and
  tests. Do not add ESLint or Prettier unless requested.
- Follow a routed skill's additional verification when one applies.
