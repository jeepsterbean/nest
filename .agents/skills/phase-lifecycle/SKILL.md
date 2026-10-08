---
name: phase-lifecycle
description: Change or diagnose Nest's Phase derivation, Working now transitions, Work stretch upkeep, lock or sleep handling, startup recovery, heartbeat, quit behavior, or Phase event emission.
---

# Nest Phase lifecycle

Preserve the transaction and recovery boundaries that keep Worked time and
Phase history consistent.

1. Read the Phase, Working now, Work stretch, and Worked time definitions in
   `CONTEXT.md`, then read `src-tauri/AGENTS.md`.
2. Trace the complete transition, including the command or operating-system
   event, stretch mutation, Phase derivation, PhaseSignal write, event emit,
   and frontend refresh. Do not reason from one handler in isolation.
3. Keep Task commands that can change Working now inside `with_phase_tx`:
   `delete_task`, `set_task_status`, `set_task_working`,
   `stop_all_working_now`, `update_task_work_stretch`, and
   `delete_task_work_stretch`.
4. Keep lock/sleep Offline handling in `phase.rs`; it writes PhaseSignals in
   addition to clearing Working now. Keep startup crash recovery, heartbeat
   upkeep, and graceful quit behavior in `task_lifecycle.rs`.
5. Preserve these user-visible outcomes:
   - starting any Work stretch can derive Doing;
   - stopping the last open stretch derives the next Phase;
   - leaving Active closes Working now without inventing a paused status;
   - lock, display sleep, system sleep, and quit bank open Worked time;
   - startup recovery ends an abandoned stretch at its last-known-live time;
   - editing or deleting a stretch recomputes totals and synchronizes Phase
     history in the same transaction where applicable.
6. Add focused tests for the changed transition and its nearest edge cases.
   Include multiple simultaneously Working now Tasks whenever changing the
   boundary between Doing and another Phase.

Run from `src-tauri/`:

```sh
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

Run the frontend checks from the repository root as well when event payloads,
shared types, or displayed derivations change.
