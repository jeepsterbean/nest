# Nest

A private desktop self-care workspace for quick check-ins, personal tasks, and
notes. Built with Tauri, React, TypeScript, SQLite, and Rust.

```sh
npm install
npm run tauri dev
```

To try Nest with seeded sample data, switch to the
[`demo`](https://github.com/jeepsterbean/nest/tree/demo) branch and follow its
README:

```sh
git checkout demo
npm install
npm run demo
```

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
