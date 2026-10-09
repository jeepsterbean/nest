---
name: schema-ipc-change
description: Change Nest's SQLite schema, migrations, Tauri command payloads, Rust models, frontend command helpers, or shared TypeScript DTOs. Use when a persisted field or frontend-backend contract changes.
---

# Nest schema and IPC changes

Keep persistence and the frontend-backend contract aligned in one change.

1. Read `src-tauri/AGENTS.md`, then trace the existing domain command from
   `src/lib/commands/` through `src-tauri/src/commands/` to its model and
   persistence code. Search every caller before changing a payload.
2. For a schema change, inspect the latest migrations and add a new forward
   migration in `src-tauri/src/migrations.rs`. Never edit an earlier migration
   that may already have run.
3. Update every affected seam together:
   - SQLite schema and row mapping
   - Rust model and command input/output
   - command registration when adding a command
   - TypeScript DTO and command helper
   - barrel export when adding a file
4. Trim and reject empty names or titles at the command boundary. Validate
   statuses, scores, intervals, foreign keys, and relationship invariants in
   Rust, with SQLite constraints as the final defense.
5. Preserve compatibility intentionally. Add migration defaults or nullable
   handling for existing rows rather than assuming a fresh database.
6. Add tests beside the Rust module that owns the behavior. Migration tests
   must cover upgrading an existing schema shape, not only creating a new
   database.

Run the frontend checks from the repository root when shared types or helpers
change:

```sh
npm run test:typecheck
npm test
npm run build
```

Run the backend checks from `src-tauri/`:

```sh
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```
