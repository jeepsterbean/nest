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
| Phase derivation, Working now, lifecycle, lock/sleep, or quit behavior | `.agents/skills/phase-lifecycle/SKILL.md` |
| Domain words, statuses, Ready/Blocked, Phase derivation | `CONTEXT.md` |
| Terminology or documentation consistency audit | `.agents/skills/terminology-docs-audit/SKILL.md` |
| Tasks table or Map | `docs/tasks.md` |
| Calendar, Insights, Timeline, or the Phases pane | `docs/calendar.md` (Insights: `#insights`, Timeline: `#timeline`), then `docs/time-surfaces.md` for shared date, Last hour, and Logs kind rules |
| Overview tiles, saved layouts, or `SIMPLIFIED_VIEW` | `docs/overview.md`, then `docs/time-surfaces.md` |
| Metrics pane, Pulses, or Metric check-in behavior | `CONTEXT.md`, `docs/metrics.md` |
| Timer | `docs/timer.md` |
| Popup | `docs/popup.md` |
| Brain dump capture, Tags, Note Board, or stickies | `docs/brain-dump.md` |
| Brain dump editor, caret/focus, formatting menu, draft sync, TipTap, or ProseMirror | `.agents/skills/brain-dump-text-editor/SKILL.md` |
| Assistant, chat context, or OpenAI IPC | `docs/assistant-context.md` |
| Reminders, Greetings board, Sidebar, or Settings panes | `CONTEXT.md`, `UI.md` |
| Dashboard or popup presentation | `.agents/standards/ui-standards.md`, `.impeccable.md`, `UI.md` |
| Open product work | `BACKLOG-FEATURE-REQUESTS.md` |

## Which Nest doc to edit

| Change kind | File |
|-------------|------|
| Product language, lifecycle invariants | `CONTEXT.md` |
| Tasks table / Map behavior | `docs/tasks.md` |
| Calendar, Insights, Timeline, Phases pane | `docs/calendar.md` |
| Overview | `docs/overview.md` |
| Rules shared across time surfaces (dates, Last hour, Logs kinds, Phase appearance) | `docs/time-surfaces.md` |
| Metrics pane behavior | `docs/metrics.md` |
| Timer | `docs/timer.md` |
| Popup | `docs/popup.md` |
| Brain dump capture / Note Board | `docs/brain-dump.md` |
| Assistant context assembly | `docs/assistant-context.md` |
| Design feel / brand / UX principles | `.impeccable.md` |
| Shared dashboard controls, shell, cross-surface UI rules | `UI.md` |
| Non-obvious CSS or layout constraint | comment beside the rule |
| Brain dump editor invariants or library behavior | `docs/editor.md` |
| Closing, parking, or adding durable product work | `BACKLOG-FEATURE-REQUESTS.md` |
| Engineering backlog | `BACKLOG-BACKEND.md` |
| Product status, setup, repo-wide guidance | `README.md` |
| Non-obvious implementation constraints | code comments |

Project-agnostic process rules live under `.agents/standards/`, which
`.claude/standards/` and `.codex/standards/` expose through symlinks. Keep
each fact in its closest authoritative source and link to it elsewhere.

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

- `SIMPLIFIED_VIEW` in `src/lib/simplifiedView.ts` is currently `true`, which
  hides the Overview, Assistant, and Settings Sections and starts the dashboard
  on Calendar. Changes to those Sections stay invisible until it is `false`.
  Scope and restore behavior: `docs/overview.md#simplified-view`.
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
  check-in. The dashboard timer due phrase is `Timer due`. Popup timer UI
  shows countdown only. Metric check-in remains the
  saved Pulse scoring record.
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
