# Nest

A private desktop self-care workspace for quick check-ins, personal tasks, and
brain dumps. Built with Tauri, React, TypeScript, SQLite, and Rust.

```sh
npm install
npm run tauri dev
```

Checks:

```sh
npm test
npm run build
npm run test:typecheck
cd src-tauri && cargo test --locked && cargo clippy --locked --all-targets -- -D warnings
```

See [CONTEXT.md](./CONTEXT.md) for domain language and [BACKLOG.md](./BACKLOG.md)
for outstanding work.
