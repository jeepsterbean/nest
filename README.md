# Nest

A private desktop self-care workspace for quick check-ins, personal tasks, and
brain dumps. Built with Tauri, React, TypeScript, SQLite, and Rust.

```sh
npm install
npm run tauri dev
```

Demo, for recordings and walkthroughs:

```sh
npm run demo
```

This runs Nest as `com.huwenjie.nest.demo`, with its own database and WebView
storage, and rebuilds the database on every launch with about ten days of
sample Tasks, Work stretches, Phases, Metric check-ins, and Brain dumps, all
leading up to today (`src-tauri/src/demo.rs`). Quit the
regular Nest first so ⌘⇧E and the menu bar belong to the demo. The demo's
windows live in `src-tauri/tauri.demo.conf.json`; keep them in step with
`tauri.conf.json`.

Checks:

```sh
npm test
npm run build
npm run test:typecheck
cd src-tauri && cargo test --locked && cargo clippy --locked --all-targets -- -D warnings
```

See [CONTEXT.md](./CONTEXT.md) for domain language,
[BACKLOG-FEATURE-REQUESTS.md](./BACKLOG-FEATURE-REQUESTS.md) for product work, and
[BACKLOG-BACKEND.md](./BACKLOG-BACKEND.md) for engineering backlog.
Coding assistants start with [AGENTS.md](./AGENTS.md), which routes each task
to the relevant guidance.
