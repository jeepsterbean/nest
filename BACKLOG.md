# Backlog

Open work items, roughly in priority order. Closed items are not tracked here — see `git log`.

---

## Outstanding

- [ ] **End-to-end manual verification with `tauri dev`**

  Formally still open since first scaffold. Ongoing in practice — every iteration has
  surfaced and fixed real issues from running the app. Will close once a clean session
  produces zero issues.

---

## Features

- [ ] **Settings panel in dashboard**

  New `Settings` section (or modal) inside the Dashboard window. Two controls for v1:

  1. **Autostart toggle.** Wire to `tauri-plugin-autostart`'s `enable()`/`disable()`/`isEnabled()`
     JS API. The plugin is already registered.
  2. **Hotkey rebind.** A capture-key input that records `modifier+key`, calls a new Rust command
     `set_hotkey(combo)` which unregisters the current shortcut and registers the new one.

  Persistence: add a small key/value table (`settings(key TEXT PRIMARY KEY, value TEXT)`) via a
  new migration. Defaults live in code; the table overrides them when present.

- [ ] **Per-metric trend chart (last 30 days)**

  `metric_series(metricId, from, to)` already exists on the backend but has no consumer. Render
  a small line/sparkline chart for each metric, showing values over the last 30 days.

  Decision needed: hand-rolled SVG vs. a chart library (recharts, visx, chart.js).
  Recommendation: hand-rolled SVG — single component, ~50 lines, zero bundle weight, fits the
  "extremely simple" goal. Empty state when a metric has fewer than 2 data points.

  Layout: chart next to each metric in the Metrics section, OR a dedicated Trends section.
  Decide during implementation based on how cluttered the metric list feels.

---

## Polish & release

- [ ] **App icon, template tray icon, real `tauri build` → .dmg**

  1. Replace the default Tauri logo in `src-tauri/icons/`. Need `32x32.png`, `128x128.png`,
     `128x128@2x.png`, `icon.icns` (macOS), `icon.ico` (Windows).
  2. Make the tray icon a macOS *template image* (`NSImage.isTemplate = true`) so it adapts
     to light/dark menubars. Currently it uses `app.default_window_icon()` — the full-color
     app icon — which violates the menubar convention. Tauri 2 exposes
     `TrayIconBuilder::icon_as_template(true)`.
  3. Run `npm run tauri build` to produce a signed `.app` and `.dmg`. Verify the bundled
     binary launches, persists data to `~/Library/Application Support/com.huwenjie.nest/`,
     hotkey works, tray icon appears.
  4. Optional: macOS code-signing + notarisation if distributing outside personal use.

---

## Parked / out-of-scope for v1

These came up during design but were deferred. Listed so they don't get rediscovered later
as gaps:

- **Editing a past check-in.** No `update_check_in` command. The only way to fix a mistyped
  rating is delete and resubmit.
- **Per-metric color / icon.** Charts can derive a color from `id` deterministically when
  needed.
- **Scale anchor labels** (e.g. `1 = calm`, `5 = panicked`). Useful as a memory aid; defer
  until the lack actually bites.
- **Manual reorder of metrics.** Sorted by `created_at` ASC; add a `sort_order` column when
  the first user complains.
- **Data export/import (JSON).** The SQLite file is portable. Add an explicit export
  command when sync/backup becomes a felt need.
