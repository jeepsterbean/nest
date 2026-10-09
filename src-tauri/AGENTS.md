# Tauri backend agent guide

This guide applies under `src-tauri/`. Read the root `AGENTS.md` first. Use
`.agents/skills/schema-ipc-change/SKILL.md` for schema or IPC seam changes and
`.agents/skills/phase-lifecycle/SKILL.md` for Phase or Working now behavior.

## Module ownership

- `src/commands/` contains only frontend-invoked Tauri commands, with one
  singular-named file per domain. `lib.rs` registers commands by full path; do
  not glob re-export command modules.
- Shared behavior that also runs outside a command belongs in a top-level
  domain module: Timer state and cadence in `timer.rs`, Phase derivation and
  lock/sleep handling in `phase.rs`, OpenAI streaming and keychain access in
  `assistant.rs`, and lifecycle upkeep in `task_lifecycle.rs`.
- Task row reads and the Updated stamp live in `task.rs`, shared by commands
  and lifecycle upkeep.
- Rust models under `src-tauri/src/models/` mirror shared TypeScript DTOs under
  `src/lib/types/`.
- Keep tests in a `#[cfg(test)] mod tests` inside the module that owns the
  behavior.

## Persistence and validation

- Persistence is local SQLite through rusqlite.
- Apply schema changes as new forward migrations in `src/migrations.rs`.
  Never rewrite a migration that may have run on a real database.
- Validate user-provided values at Tauri command boundaries and preserve
  relational integrity with foreign keys, status checks, and graph cycle
  checks.
- Keep single-user authorization simple; local-only does not remove input or
  integrity requirements.

## Task and Phase invariants

- Working now, Worked time, and the live start are derived from
  `task_work_stretches` in `TASK_COLUMNS`; they are never stored on `tasks`.
- Queries using `TASK_COLUMNS` must alias `tasks` as `t`. SQLite `RETURNING`
  cannot include it because the expression contains subqueries.
- Commands that can change Working now use `with_phase_tx` so Task mutation,
  Phase synchronization, and event emission share one transaction.
- Lock/sleep Offline handling remains in `phase.rs` because it also writes
  PhaseSignals. Startup recovery, heartbeat upkeep, and quit behavior remain
  in `task_lifecycle.rs`.

## Verification

Run from `src-tauri/`:

```sh
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

Use `cargo check --locked` when a full test run is disproportionate during
iteration, then run the checks proportionate to the completed change.
