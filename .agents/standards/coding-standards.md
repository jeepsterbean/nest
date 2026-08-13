# Coding standards

These standards apply to every coding assistant working in this repository.

Nest is a private self-care desktop app: Tauri 2 + React + TypeScript on the
frontend, Rust + SQLite on the backend. Prefer the smallest change that
preserves calm, private, flow-friendly behavior.

## Documentation is required

- Every code change must include a corresponding documentation update in the
  same change and commit.
- Update the closest authoritative documentation:
  - `CONTEXT.md` for product language and lifecycle invariants;
  - `BACKLOG-FUNCTIONALITY.md` / `BACKLOG-BACKEND.md` when closing, parking, or adding durable open work;
  - `.impeccable.md` for design context that assistants should follow;
  - `.agents/standards/ui-standards.md` for frontend and UI conventions;
  - `README.md` for product status, setup, or repository-wide guidance;
  - code comments for non-obvious implementation constraints that cannot be
    expressed more clearly through code.
- Do not add changelog-style noise merely to satisfy this rule. Update the
  durable fact, invariant, workflow, or rationale affected by the code change.
- Remove or correct stale documentation as part of the change that makes it
  stale.
- Documentation-only changes do not require another documentation update.

## Package manager

- This repository uses npm. `package-lock.json` is the source of truth for JS
  dependency resolution. Rust dependencies use `src-tauri/Cargo.lock`.
- Use `npm install` for JS dependencies and `npm run <script>` for package
  scripts.
- Do not introduce Bun, Yarn, or pnpm, and do not commit `bun.lock`,
  `bun.lockb`, `yarn.lock`, or `pnpm-lock.yaml`.
- Keep `src-tauri/tauri.conf.json` `beforeDevCommand` / `beforeBuildCommand`
  aligned with the npm scripts they invoke.

## Coding standards

- Prefer clear, typed interfaces and domain vocabulary from `CONTEXT.md`.
  Use Task, Parent, Child, Blocker, Dependent, Ready, Blocked, and Scope as
  defined there. Do not invent synonyms (todo, subitem, dependency-as-jargon
  for either side of a Blocker edge) in user-facing copy or new domain types.
- Distinguish persisted Task statuses (`backlog`, `up_next`, `active`,
  `paused`, `completed`, `cancelled`) from derived readiness (`Ready` /
  `Blocked`). Ready/Blocked come from unresolved Blockers; they are not
  stored status values.
- Do not introduce `any` when an existing or inferred type can express the
  value. Keep TypeScript `strict` clean.
- Validate untrusted or user-provided input at application seams: trim and
  reject empty names/titles in Tauri commands, validate statuses/scores/
  intervals in Rust, and keep SQLite constraints as the last line of defense.
- Keep the IPC surface honest:
  - Frontend invokes only through `src/lib/commands.ts`.
  - Shared DTO shapes live in `src/lib/types.ts` and must stay aligned with
    Rust models / command payloads in `src-tauri/src/`.
  - Do not call `invoke` ad hoc from views when a command helper already
    exists or belongs in `commands.ts`.
- Keep modules focused, remove dead code, and avoid duplicating constants,
  configuration, or business rules across files. Prefer extending
  `src/dashboard/lib/` helpers over growing god-view components.
- Preserve existing behavior unless the requested change intentionally updates
  it. Keep unrelated user changes intact.

## Language

- The interface is English only. There is no locale picker and no i18n
  framework.
- User-facing copy should match the calm, private tone in `.impeccable.md`
  and the domain distinctions in `CONTEXT.md`.
- Prefer the shared formatters in `src/dashboard/lib/time.ts` for dashboard
  dates and times instead of scattering one-off `Intl` / `toLocale*` options
  across views.

## Database and Rust backend

- Persistence is local SQLite via rusqlite. Schema changes go through forward
  migrations in `src-tauri/src/migrations.rs`.
- Add a new migration; never rewrite a migration that may already have run on
  a real database.
- Keep authorization simple: this is a single-user local app. Still validate
  inputs and preserve relational integrity (foreign keys, cycle checks for
  Blocker edges, status checks).
- When a schema or command payload changes, update Rust models, TypeScript
  types, command helpers, and tests in the same change.
- Prefer `cargo test` coverage next to the Rust modules that own the behavior
  (`task_graph`, migrations, commands).

## Frontend structure

- Entry: `src/main.tsx` / `src/App.tsx`. Two windows share the SPA:
  dashboard (default) and check-in popup (`#/popup`).
- Dashboard code lives under `src/dashboard/` (views, task cluster, context,
  lib, components). Popup code lives under `src/popup/`.
- Keep view files thin when possible: data loading and mutation go through
  `DashboardDataContext`; pure derivations belong in `src/dashboard/lib/`.
- Styles for the dashboard currently live in `src/dashboard/Dashboard.css`.
  Prefer extending existing class patterns over inventing parallel systems.
  Do not add a CSS framework unless explicitly requested.

## Verification

- Run the checks proportionate to the change before handing it off.
- For ordinary frontend or shared-type changes:
  - `npm run test:typecheck`
  - `npm test`
  - `npm run build` when the change can affect bundling or `tsc` project refs
- For Rust / SQLite / Tauri command changes, also run from `src-tauri/`:
  - `cargo test`
  - `cargo check` when a full test run is disproportionate
- There is no separate JS lint script today; rely on TypeScript strictness and
  tests. Do not add ESLint/Prettier unless requested.
- Report skipped checks and known warnings explicitly.
