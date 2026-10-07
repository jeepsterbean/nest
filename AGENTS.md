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
| Domain words, statuses, Ready/Blocked, Phase derivation | `CONTEXT.md` |
| Tasks table or Map | `docs/tasks.md` |
| Overview, Calendar (and its Insights), Timeline, or Phases | `docs/time-surfaces.md` |
| Metrics section, Pulses, or Metric check-in interval | `CONTEXT.md`, `UI.md` |
| Timer or Popup | `docs/timer-popup.md` |
| Brain dump capture, Tags, Note Board, or stickies | `docs/brain-dump.md` |
| Brain dump editor, caret/focus, formatting menu, draft sync, TipTap, or ProseMirror | `.agents/skills/brain-dump-text-editor/SKILL.md` |
| Assistant, chat context, or OpenAI IPC | `docs/assistant-context.md` |
| Dashboard or popup presentation | `.agents/standards/ui-standards.md`, `.impeccable.md`, then relevant `UI.md` sections |
| Rust, SQLite, IPC, types, migrations, or Task lifecycle | the matching sections below |
| Open product work | `BACKLOG-FEATURE-REQUESTS.md` |

## Which Nest doc to edit

| Change kind | File |
|-------------|------|
| Product language, lifecycle invariants | `CONTEXT.md` |
| Tasks table / Map behavior | `docs/tasks.md` |
| Overview, Calendar (and its Insights), Timeline, Phases | `docs/time-surfaces.md` |
| Metrics section chrome, Pulses / Metrics panes | `UI.md`, `CONTEXT.md` |
| Timer / Popup | `docs/timer-popup.md` |
| Brain dump capture / Note Board | `docs/brain-dump.md` |
| Assistant context assembly | `docs/assistant-context.md` |
| Design feel / brand / UX principles | `.impeccable.md` |
| CSS hooks, component constraints, layout constants | `UI.md` |
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

## Domain and types

- Prefer domain vocabulary from `CONTEXT.md`. Do not invent synonyms in
  user-facing copy or new domain types.
- Distinguish persisted Task statuses (`backlog`, `up_next`, `active`,
  `completed`, `cancelled`) from derived readiness (`Ready` / `Blocked`).
  Ready/Blocked come from unresolved Blockers; they are not stored status
  values. `paused` is not a live status.
- Do not introduce `any` when an existing or inferred type can express the
  value. Keep TypeScript `strict` clean.
- At application seams, trim and reject empty names or titles in Tauri
  commands, validate statuses, scores, and intervals in Rust, and keep SQLite
  constraints as the last line of defense.

## IPC and shared types

- Frontend invokes only through `src/lib/commands/` (import the folder barrel).
  The `commands/` and `types/` barrels are `export *` lines, so a new export
  needs no barrel edit; a new file needs one line.
- Shared DTO shapes live in `src/lib/types/` and must stay aligned with Rust
  models in `src-tauri/src/models/` and command payloads in
  `src-tauri/src/commands/`.
- Do not call `invoke` ad hoc from views when a command helper exists or belongs
  in `src/lib/commands/`.

## Database and Rust backend

- Persistence is local SQLite via rusqlite. Schema changes go through forward
  migrations in `src-tauri/src/migrations.rs`; never rewrite a migration that
  may already have run on a real database.
- Keep authorization simple: this is a single-user local app. Still validate
  inputs and preserve relational integrity (foreign keys, cycle checks for
  Blocker edges, status checks).
- When a schema or command payload changes, update Rust models, TypeScript
  types, command helpers, and tests in the same change.
- Prefer `cargo test` coverage next to the Rust modules that own the behavior
  (`task_graph` for Parent/Blocker integrity, migrations, commands).
- Task commands that can change Working now (`delete_task`, `set_task_status`,
  `set_task_working`, `stop_all_working_now`, `update_task_work_stretch`,
  `delete_task_work_stretch`) go through `with_phase_tx` so Phase sync and emit
  stay in the same transaction. Lock/sleep Offline is a separate path
  (`phase.rs`) because it also writes PhaseSignals.
- `src-tauri/src/commands/` holds only frontend-invoked Tauri commands, one
  singular-named file per domain (`task.rs`, `brain_dump.rs`, matching
  `models/` and `src/lib/commands/`). `lib.rs` registers each by full path
  (`commands::task::list_tasks`); do not glob re-export from `commands`.
  Logic that also runs outside a command lives in a top-level module of the
  same domain: Timer state, cadence and persistence in `timer.rs`; Phase
  derivation and lock/sleep Offline in `phase.rs`; OpenAI streaming and the
  keychain API key in `assistant.rs`; work-stretch upkeep driven by app
  lifecycle events (startup recovery, quit, heartbeat) in `task_lifecycle.rs`.
  Task row reads and the Updated stamp live in `task.rs`, shared by task
  commands and that lifecycle upkeep.
- Rust tests live in a `#[cfg(test)] mod tests` inside the file that owns the
  behavior.
- Working now, Worked time and the live start are derived from
  `task_work_stretches` in `TASK_COLUMNS`, never stored on `tasks`, so a
  corrected stretch moves the total. Selects using it must alias `tasks` as
  `t`; `RETURNING` cannot carry it because SQLite forbids subqueries there.

## Frontend structure

- Entry: `src/main.tsx` / `src/App.tsx`. Two windows share the SPA: dashboard
  (default) and popup (`#/popup`).
- Shared IPC and window-agnostic helpers live under `src/lib/` (`commands/`,
  `types/`, drafts, Pulse visibility, reorder).
- Dashboard code lives under `src/dashboard/` (views, `task/`, context, lib,
  components, hooks). Popup code lives under `src/popup/`. Sections are
  Overview, Calendar, Core, Assistant, and Settings. Calendar switches between
  Calendar and Timeline, and holds Insights beside Calendar. Core
  holds Brain dump, Tasks, Metrics, and Phases.
- Keep view files thin when possible: data loading and mutation go through
  `DashboardDataContext`; pure derivations belong in `src/dashboard/lib/`.
- Prefer extending `src/dashboard/lib/` helpers over growing god-view
  components.
- Styles: dashboard CSS is imported through `src/dashboard/Dashboard.css`, with
  section files under `src/dashboard/styles/`; popup CSS lives in
  `src/popup/PopupContent.css` and `src/popup/Popup.css`. Prefer extending
  existing class patterns over inventing parallel systems. Do not add a CSS
  framework unless explicitly requested.

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

- Ordinary frontend or shared-type changes:
  - `npm run test:typecheck`
  - `npm test`
  - `npm run build` when the change can affect bundling or `tsc` project refs
- Rust / SQLite / Tauri command changes, also from `src-tauri/`:
  - `cargo test`
  - `cargo clippy --locked --all-targets -- -D warnings` when the change can
    affect warnings
  - `cargo check` when a full test run is disproportionate
- There is no separate JS lint script today; rely on TypeScript strictness and
  tests. Do not add ESLint or Prettier unless requested.
- For Brain dump editor changes and editor dependency upgrades, use
  `.agents/skills/brain-dump-text-editor/SKILL.md`.
