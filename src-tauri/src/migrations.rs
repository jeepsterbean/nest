use rusqlite_migration::{Migrations, M};

pub fn migrations() -> Migrations<'static> {
    Migrations::new(vec![
        M::up(
            r#"
CREATE TABLE metrics (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  created_at     INTEGER NOT NULL,
  inactive_since INTEGER
);

CREATE TABLE check_ins (
  id         INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  note       TEXT
);

CREATE TABLE ratings (
  check_in_id INTEGER NOT NULL REFERENCES check_ins(id) ON DELETE CASCADE,
  metric_id   INTEGER NOT NULL REFERENCES metrics(id),
  value       INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
  note        TEXT,
  PRIMARY KEY (check_in_id, metric_id)
);

CREATE INDEX idx_check_ins_created_at ON check_ins(created_at);
CREATE INDEX idx_ratings_metric_id ON ratings(metric_id);
"#,
        ),
        M::up(
            r#"
CREATE TABLE work_check_ins (
  id         INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  working    INTEGER NOT NULL CHECK (working IN (0, 1)),
  blocker    TEXT
);

CREATE INDEX idx_work_check_ins_created_at ON work_check_ins(created_at);
"#,
        ),
        M::up(
            r#"
CREATE TABLE focus_check_ins (
  id                           INTEGER PRIMARY KEY,
  created_at                   INTEGER NOT NULL,
  still_working_previous_task  INTEGER NOT NULL CHECK (still_working_previous_task IN (0, 1)),
  current_work                 TEXT,
  trying_now                   TEXT NOT NULL,
  next_check_in_minutes        INTEGER NOT NULL
);

CREATE TABLE focus_check_in_settings (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  interval_minutes INTEGER NOT NULL,
  next_due_at      INTEGER NOT NULL
);

CREATE INDEX idx_focus_check_ins_created_at ON focus_check_ins(created_at);
"#,
        ),
        M::up(
            r#"
CREATE TABLE focus_check_ins_new (
  id                    INTEGER PRIMARY KEY,
  created_at            INTEGER NOT NULL,
  task                  TEXT NOT NULL,
  trying_now            TEXT NOT NULL,
  next_check_in_minutes INTEGER NOT NULL
);

INSERT INTO focus_check_ins_new (id, created_at, task, trying_now, next_check_in_minutes)
SELECT
  current.id,
  current.created_at,
  COALESCE(
    NULLIF(TRIM(current.current_work), ''),
    (
      SELECT previous.current_work
      FROM focus_check_ins previous
      WHERE previous.created_at < current.created_at
        AND previous.current_work IS NOT NULL
        AND TRIM(previous.current_work) != ''
      ORDER BY previous.created_at DESC, previous.id DESC
      LIMIT 1
    ),
    'Previous task'
  ),
  current.trying_now,
  current.next_check_in_minutes
FROM focus_check_ins current;

DROP TABLE focus_check_ins;
ALTER TABLE focus_check_ins_new RENAME TO focus_check_ins;
CREATE INDEX idx_focus_check_ins_created_at ON focus_check_ins(created_at);
"#,
        ),
        M::up("DROP TABLE IF EXISTS focus_check_in_settings;"),
        // Brain dump becomes its own concept. Create the table and fold every
        // existing free-text field (metric notes, per-rating notes, work
        // blockers, focus "trying now") into it, keyed by the source row's
        // timestamp. Must run before the work/focus rebuilds below drop those
        // tables. Then drop the now-unused metric note columns.
        M::up(
            r#"
CREATE TABLE brain_dumps (
  id         INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  text       TEXT NOT NULL
);

CREATE INDEX idx_brain_dumps_created_at ON brain_dumps(created_at);

INSERT INTO brain_dumps (created_at, text)
SELECT created_at, TRIM(note) FROM check_ins
WHERE TRIM(COALESCE(note, '')) <> '';

INSERT INTO brain_dumps (created_at, text)
SELECT c.created_at, TRIM(r.note)
FROM ratings r
JOIN check_ins c ON c.id = r.check_in_id
WHERE TRIM(COALESCE(r.note, '')) <> '';

INSERT INTO brain_dumps (created_at, text)
SELECT created_at, TRIM(blocker) FROM work_check_ins
WHERE TRIM(COALESCE(blocker, '')) <> '';

INSERT INTO brain_dumps (created_at, text)
SELECT created_at, TRIM(trying_now) FROM focus_check_ins
WHERE TRIM(COALESCE(trying_now, '')) <> '';

ALTER TABLE check_ins DROP COLUMN note;
ALTER TABLE ratings DROP COLUMN note;
"#,
        ),
        // Rename the generic metrics tables to the consistent metric_* scheme.
        // RENAME TO rewrites the foreign key inside ratings automatically under
        // SQLite's default (non-legacy) alter behavior.
        M::up(
            r#"
ALTER TABLE check_ins RENAME TO metric_check_ins;
ALTER TABLE ratings RENAME TO metric_ratings;

DROP INDEX idx_check_ins_created_at;
CREATE INDEX idx_metric_check_ins_created_at ON metric_check_ins(created_at);
DROP INDEX idx_ratings_metric_id;
CREATE INDEX idx_metric_ratings_metric_id ON metric_ratings(metric_id);
"#,
        ),
        // Work check-in -> phase check-in: replace the working/blocker shape with
        // a 5-mode phase + optional label. Best-effort map of old rows.
        M::up(
            r#"
CREATE TABLE phase_check_ins (
  id          INTEGER PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  phase       TEXT NOT NULL CHECK (phase IN ('decluttering', 'scoping', 'doing', 'resting', 'others')),
  phase_label TEXT
);

INSERT INTO phase_check_ins (id, created_at, phase, phase_label)
SELECT id, created_at, CASE working WHEN 1 THEN 'doing' ELSE 'others' END, NULL
FROM work_check_ins;

DROP TABLE work_check_ins;
CREATE INDEX idx_phase_check_ins_created_at ON phase_check_ins(created_at);
"#,
        ),
        // Focus check-in -> task check-in: rename the table and drop trying_now
        // (its text was migrated into brain_dumps above).
        M::up(
            r#"
CREATE TABLE task_check_ins (
  id                    INTEGER PRIMARY KEY,
  created_at            INTEGER NOT NULL,
  task                  TEXT NOT NULL,
  next_check_in_minutes INTEGER NOT NULL
);

INSERT INTO task_check_ins (id, created_at, task, next_check_in_minutes)
SELECT id, created_at, task, next_check_in_minutes FROM focus_check_ins;

DROP TABLE focus_check_ins;
CREATE INDEX idx_task_check_ins_created_at ON task_check_ins(created_at);
"#,
        ),
        // Make phases user-managed, matching the active/inactive lifecycle used
        // by metrics. Historical "others" labels stay attached to their old
        // check-ins instead of becoming implicit new active phases.
        M::up(
            r#"
CREATE TABLE phases (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  created_at     INTEGER NOT NULL,
  inactive_since INTEGER
);

INSERT INTO phases (id, name, created_at)
VALUES
  (1, 'Decluttering', 0),
  (2, 'Scoping', 0),
  (3, 'Doing', 0),
  (4, 'Resting', 0),
  (5, 'Others', 0);

CREATE TABLE phase_check_ins_new (
  id          INTEGER PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  phase_id    INTEGER NOT NULL REFERENCES phases(id),
  phase_label TEXT
);

INSERT INTO phase_check_ins_new (id, created_at, phase_id, phase_label)
SELECT
  id,
  created_at,
  CASE phase
    WHEN 'decluttering' THEN 1
    WHEN 'scoping' THEN 2
    WHEN 'doing' THEN 3
    WHEN 'resting' THEN 4
    ELSE 5
  END,
  phase_label
FROM phase_check_ins;

DROP TABLE phase_check_ins;
ALTER TABLE phase_check_ins_new RENAME TO phase_check_ins;
CREATE INDEX idx_phase_check_ins_created_at ON phase_check_ins(created_at);
CREATE INDEX idx_phase_check_ins_phase_id ON phase_check_ins(phase_id);
"#,
        ),
        // Repair databases that had already advanced past the migration slot
        // where brain_dumps was inserted during development.
        M::up(
            r#"
CREATE TABLE IF NOT EXISTS brain_dumps (
  id         INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL,
  text       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_brain_dumps_created_at ON brain_dumps(created_at);
"#,
        ),
        // The recurring prompt is the popup's schedule, not a property of any
        // one task check-in: move the cadence into a singleton
        // check_in_schedule row (seeded from the latest task check-in so the
        // rhythm carries over) and drop next_check_in_minutes from
        // task_check_ins.
        M::up(
            r#"
CREATE TABLE check_in_schedule (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  interval_minutes INTEGER NOT NULL,
  next_due_at      INTEGER NOT NULL
);

INSERT INTO check_in_schedule (id, interval_minutes, next_due_at)
SELECT
  1,
  COALESCE(
    (SELECT next_check_in_minutes FROM task_check_ins
     ORDER BY created_at DESC, id DESC LIMIT 1),
    15
  ),
  COALESCE(
    (SELECT created_at + next_check_in_minutes * 60 FROM task_check_ins
     ORDER BY created_at DESC, id DESC LIMIT 1),
    strftime('%s', 'now') + 15 * 60
  );

ALTER TABLE task_check_ins DROP COLUMN next_check_in_minutes;
"#,
        ),
        M::up(
            r#"
CREATE TABLE tasks (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE task_status_events (
  id          INTEGER PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  to_status   TEXT NOT NULL CHECK (to_status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_tasks_status_updated_at ON tasks(status, updated_at DESC);
CREATE INDEX idx_task_status_events_task_id_created_at ON task_status_events(task_id, created_at DESC, id DESC);
"#,
        ),
        // Backfill the status-event stream if a development database already
        // created tasks before status events existed.
        M::up(
            r#"
CREATE TABLE IF NOT EXISTS task_status_events (
  id          INTEGER PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  to_status   TEXT NOT NULL CHECK (to_status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_status_events_task_id_created_at
ON task_status_events(task_id, created_at DESC, id DESC);

INSERT INTO task_status_events (task_id, from_status, to_status, created_at)
SELECT t.id, NULL, t.status, t.created_at
FROM tasks t
WHERE NOT EXISTS (
  SELECT 1 FROM task_status_events e WHERE e.task_id = t.id
);
"#,
        ),
        M::up(
            r#"
DROP INDEX IF EXISTS idx_tasks_status_updated_at;
DROP INDEX IF EXISTS idx_task_status_events_task_id_created_at;

CREATE TABLE task_status_events_compacted_copy (
  id          INTEGER PRIMARY KEY,
  task_id     INTEGER NOT NULL,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  to_status   TEXT NOT NULL CHECK (to_status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  created_at  INTEGER NOT NULL
);

INSERT INTO task_status_events_compacted_copy (id, task_id, from_status, to_status, created_at)
SELECT id, task_id, from_status, to_status, created_at FROM task_status_events;

DROP TABLE task_status_events;

CREATE TABLE tasks_compacted (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT INTO tasks_compacted (id, title, status, created_at, updated_at)
SELECT id, title, status, created_at, updated_at FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_compacted RENAME TO tasks;

CREATE TABLE task_status_events (
  id          INTEGER PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  to_status   TEXT NOT NULL CHECK (to_status IN ('backlog', 'active', 'paused', 'completed', 'cancelled')),
  created_at  INTEGER NOT NULL
);

INSERT INTO task_status_events (id, task_id, from_status, to_status, created_at)
SELECT id, task_id, from_status, to_status, created_at FROM task_status_events_compacted_copy;

DROP TABLE task_status_events_compacted_copy;

CREATE INDEX idx_tasks_status_updated_at ON tasks(status, updated_at DESC);
CREATE INDEX idx_task_status_events_task_id_created_at
ON task_status_events(task_id, created_at DESC, id DESC);
"#,
        ),
        M::up(
            r#"
ALTER TABLE tasks ADD COLUMN description TEXT NOT NULL DEFAULT '';
"#,
        ),
        M::up(
            r#"
ALTER TABLE brain_dumps ADD COLUMN title TEXT;
"#,
        ),
        M::up(
            r#"
ALTER TABLE tasks ADD COLUMN value INTEGER CHECK (value IS NULL OR value BETWEEN 1 AND 5);
ALTER TABLE tasks ADD COLUMN effort INTEGER CHECK (effort IS NULL OR effort BETWEEN 1 AND 5);
"#,
        ),
        M::up("ALTER TABLE tasks ADD COLUMN scope TEXT;"),
        M::up(
            r#"
PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_task_status_events_task_id_created_at;
DROP INDEX IF EXISTS idx_tasks_status_updated_at;

CREATE TABLE task_status_events_up_next_copy (
  id          INTEGER PRIMARY KEY,
  task_id     INTEGER NOT NULL,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('backlog', 'up_next', 'active', 'paused', 'completed', 'cancelled')),
  to_status   TEXT NOT NULL CHECK (to_status IN ('backlog', 'up_next', 'active', 'paused', 'completed', 'cancelled')),
  created_at  INTEGER NOT NULL
);

INSERT INTO task_status_events_up_next_copy (id, task_id, from_status, to_status, created_at)
SELECT id, task_id, from_status, to_status, created_at FROM task_status_events;

DROP TABLE task_status_events;

CREATE TABLE tasks_up_next (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('backlog', 'up_next', 'active', 'paused', 'completed', 'cancelled')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  value       INTEGER CHECK (value IS NULL OR value BETWEEN 1 AND 5),
  effort      INTEGER CHECK (effort IS NULL OR effort BETWEEN 1 AND 5),
  scope       TEXT
);

INSERT INTO tasks_up_next (id, title, status, created_at, updated_at, description, value, effort, scope)
SELECT id, title, status, created_at, updated_at, description, value, effort, scope FROM tasks;

DROP TABLE tasks;
ALTER TABLE tasks_up_next RENAME TO tasks;

CREATE TABLE task_status_events (
  id          INTEGER PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('backlog', 'up_next', 'active', 'paused', 'completed', 'cancelled')),
  to_status   TEXT NOT NULL CHECK (to_status IN ('backlog', 'up_next', 'active', 'paused', 'completed', 'cancelled')),
  created_at  INTEGER NOT NULL
);

INSERT INTO task_status_events (id, task_id, from_status, to_status, created_at)
SELECT id, task_id, from_status, to_status, created_at FROM task_status_events_up_next_copy;

DROP TABLE task_status_events_up_next_copy;

CREATE INDEX idx_tasks_status_updated_at ON tasks(status, updated_at DESC);
CREATE INDEX idx_task_status_events_task_id_created_at
ON task_status_events(task_id, created_at DESC, id DESC);

PRAGMA foreign_keys = ON;
"#,
        ),
        // A task belongs to at most one parent, while execution dependencies
        // remain a separate many-to-many DAG. Keeping the relationships
        // distinct prevents hierarchy from silently acquiring scheduling
        // semantics.
        M::up(
            r#"
ALTER TABLE tasks
ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL;

CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);

CREATE TABLE task_dependencies (
  blocker_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL,
  CHECK (blocker_task_id <> blocked_task_id),
  PRIMARY KEY (blocker_task_id, blocked_task_id)
);

CREATE INDEX idx_task_dependencies_blocked
ON task_dependencies(blocked_task_id, blocker_task_id);
"#,
        ),
        M::up(
            "ALTER TABLE tasks ADD COLUMN working_now INTEGER NOT NULL DEFAULT 0 \
             CHECK (working_now IN (0, 1));",
        ),
        // Repair databases that crossed the old task-table rebuild, where
        // SQLite's active foreign keys cascaded away status history. Exact lost
        // transitions cannot be reconstructed, but every task gets a usable
        // baseline event when its stream is empty.
        M::up(
            r#"
INSERT INTO task_status_events (task_id, from_status, to_status, created_at)
SELECT t.id, NULL, t.status, t.created_at
FROM tasks t
WHERE NOT EXISTS (
  SELECT 1 FROM task_status_events e WHERE e.task_id = t.id
);
"#,
        ),
        // An unanswered phase prompt is an explicit idle checkpoint. NULL is
        // distinct from no row: it ends the previously active phase.
        M::up(
            r#"
CREATE TABLE phase_check_ins_with_idle (
  id          INTEGER PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  phase_id    INTEGER REFERENCES phases(id),
  phase_label TEXT
);

INSERT INTO phase_check_ins_with_idle (id, created_at, phase_id, phase_label)
SELECT id, created_at, phase_id, phase_label FROM phase_check_ins;

DROP TABLE phase_check_ins;
ALTER TABLE phase_check_ins_with_idle RENAME TO phase_check_ins;
CREATE INDEX idx_phase_check_ins_created_at ON phase_check_ins(created_at);
CREATE INDEX idx_phase_check_ins_phase_id ON phase_check_ins(phase_id);
"#,
        ),
        // Paused is no longer a live status. Leftover paused tasks become
        // cancelled; status history keeps the old value. Child tables are
        // copied first because this runs inside a transaction, where
        // PRAGMA foreign_keys has no effect and DROP TABLE would cascade.
        M::up(
            r#"
INSERT INTO task_status_events (task_id, from_status, to_status, created_at)
SELECT id, 'paused', 'cancelled', updated_at
FROM tasks
WHERE status = 'paused';

UPDATE tasks
SET status = 'cancelled', working_now = 0
WHERE status = 'paused';

CREATE TABLE task_status_events_copy (
  id          INTEGER PRIMARY KEY,
  task_id     INTEGER NOT NULL,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('backlog', 'up_next', 'active', 'paused', 'completed', 'cancelled')),
  to_status   TEXT NOT NULL CHECK (to_status IN ('backlog', 'up_next', 'active', 'paused', 'completed', 'cancelled')),
  created_at  INTEGER NOT NULL
);
INSERT INTO task_status_events_copy (id, task_id, from_status, to_status, created_at)
SELECT id, task_id, from_status, to_status, created_at FROM task_status_events;

CREATE TABLE task_dependencies_copy (
  blocker_task_id INTEGER NOT NULL,
  blocked_task_id INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  CHECK (blocker_task_id <> blocked_task_id),
  PRIMARY KEY (blocker_task_id, blocked_task_id)
);
INSERT INTO task_dependencies_copy (blocker_task_id, blocked_task_id, created_at)
SELECT blocker_task_id, blocked_task_id, created_at FROM task_dependencies;

CREATE TABLE tasks_copy (
  id             INTEGER PRIMARY KEY,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('backlog', 'up_next', 'active', 'completed', 'cancelled')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  value          INTEGER CHECK (value IS NULL OR value BETWEEN 1 AND 5),
  effort         INTEGER CHECK (effort IS NULL OR effort BETWEEN 1 AND 5),
  scope          TEXT,
  parent_task_id INTEGER,
  working_now    INTEGER NOT NULL DEFAULT 0 CHECK (working_now IN (0, 1))
);
INSERT INTO tasks_copy (
  id, title, status, created_at, updated_at, description, value, effort, scope,
  parent_task_id, working_now
)
SELECT
  id, title, status, created_at, updated_at, description, value, effort, scope,
  parent_task_id, working_now
FROM tasks;

DROP INDEX IF EXISTS idx_task_status_events_task_id_created_at;
DROP INDEX IF EXISTS idx_task_dependencies_blocked;
DROP INDEX IF EXISTS idx_tasks_status_updated_at;
DROP INDEX IF EXISTS idx_tasks_parent_task_id;

DROP TABLE task_status_events;
DROP TABLE task_dependencies;
DROP TABLE tasks;

CREATE TABLE tasks (
  id             INTEGER PRIMARY KEY,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('backlog', 'up_next', 'active', 'completed', 'cancelled')),
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  value          INTEGER CHECK (value IS NULL OR value BETWEEN 1 AND 5),
  effort         INTEGER CHECK (effort IS NULL OR effort BETWEEN 1 AND 5),
  scope          TEXT,
  parent_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  working_now    INTEGER NOT NULL DEFAULT 0 CHECK (working_now IN (0, 1))
);
INSERT INTO tasks (
  id, title, status, created_at, updated_at, description, value, effort, scope,
  parent_task_id, working_now
)
SELECT
  id, title, status, created_at, updated_at, description, value, effort, scope,
  NULL, working_now
FROM tasks_copy;
UPDATE tasks
SET parent_task_id = (
  SELECT parent_task_id FROM tasks_copy WHERE tasks_copy.id = tasks.id
);

CREATE TABLE task_status_events (
  id          INTEGER PRIMARY KEY,
  task_id     INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('backlog', 'up_next', 'active', 'paused', 'completed', 'cancelled')),
  to_status   TEXT NOT NULL CHECK (to_status IN ('backlog', 'up_next', 'active', 'paused', 'completed', 'cancelled')),
  created_at  INTEGER NOT NULL
);
INSERT INTO task_status_events (id, task_id, from_status, to_status, created_at)
SELECT id, task_id, from_status, to_status, created_at FROM task_status_events_copy;

CREATE TABLE task_dependencies (
  blocker_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  blocked_task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL,
  CHECK (blocker_task_id <> blocked_task_id),
  PRIMARY KEY (blocker_task_id, blocked_task_id)
);
INSERT INTO task_dependencies (blocker_task_id, blocked_task_id, created_at)
SELECT blocker_task_id, blocked_task_id, created_at FROM task_dependencies_copy;

DROP TABLE task_status_events_copy;
DROP TABLE task_dependencies_copy;
DROP TABLE tasks_copy;

CREATE INDEX idx_tasks_status_updated_at ON tasks(status, updated_at DESC);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
CREATE INDEX idx_task_status_events_task_id_created_at
ON task_status_events(task_id, created_at DESC, id DESC);
CREATE INDEX idx_task_dependencies_blocked
ON task_dependencies(blocked_task_id, blocker_task_id);
"#,
        ),
        M::up(
            r#"
ALTER TABLE tasks ADD COLUMN worked_seconds INTEGER NOT NULL DEFAULT 0
CHECK (worked_seconds >= 0);
ALTER TABLE tasks ADD COLUMN work_started_at INTEGER;

UPDATE tasks
SET work_started_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE working_now = 1;
"#,
        ),
        // Repair databases that briefly recorded version 26 while the task
        // table rebuild still occupied that slot during development.
        M::up_with_hook("", |tx| {
            let has_worked_seconds: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('tasks') \
                 WHERE name = 'worked_seconds')",
                [],
                |row| row.get(0),
            )?;
            if !has_worked_seconds {
                tx.execute(
                    "ALTER TABLE tasks ADD COLUMN worked_seconds INTEGER NOT NULL DEFAULT 0 \
                     CHECK (worked_seconds >= 0)",
                    [],
                )?;
            }

            let has_work_started_at: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('tasks') \
                 WHERE name = 'work_started_at')",
                [],
                |row| row.get(0),
            )?;
            if !has_work_started_at {
                tx.execute("ALTER TABLE tasks ADD COLUMN work_started_at INTEGER", [])?;
            }

            tx.execute(
                "UPDATE tasks SET work_started_at = CAST(strftime('%s', 'now') AS INTEGER) \
                 WHERE working_now = 1 AND work_started_at IS NULL",
                [],
            )?;
            Ok(())
        }),
        // Freeze phases to the three derived attention states. Historical
        // check-ins keep their foreign keys; extra names are only inactivated.
        M::up(
            r#"
INSERT INTO phases (name, created_at)
SELECT name, 0 FROM (
  SELECT 'Scoping' AS name
  UNION ALL SELECT 'Doing'
  UNION ALL SELECT 'Resting'
)
WHERE name NOT IN (SELECT name FROM phases);

UPDATE phases SET inactive_since = NULL
WHERE name IN ('Scoping', 'Doing', 'Resting');

UPDATE phases SET inactive_since = COALESCE(inactive_since, CAST(strftime('%s', 'now') AS INTEGER))
WHERE name NOT IN ('Scoping', 'Doing', 'Resting');
"#,
        ),
        // A pulse is now the only grouping/lifecycle for metrics. Preserve the
        // old active set as one pulse, leave old inactive metrics unassigned,
        // and snapshot the pulse name on check-ins so deleting a pulse keeps
        // its history legible.
        M::up(
            r#"
CREATE TABLE pulses (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE pulse_metrics (
  pulse_id  INTEGER NOT NULL REFERENCES pulses(id) ON DELETE CASCADE,
  metric_id INTEGER NOT NULL REFERENCES metrics(id),
  PRIMARY KEY (pulse_id, metric_id)
);

INSERT INTO pulses (name, created_at)
SELECT 'Daily pulse', 0
WHERE EXISTS (SELECT 1 FROM metrics)
   OR EXISTS (SELECT 1 FROM metric_check_ins);

INSERT INTO pulse_metrics (pulse_id, metric_id)
SELECT (SELECT id FROM pulses WHERE name = 'Daily pulse'), id
FROM metrics
WHERE inactive_since IS NULL;

ALTER TABLE metric_check_ins ADD COLUMN pulse_id INTEGER
REFERENCES pulses(id) ON DELETE SET NULL;
ALTER TABLE metric_check_ins ADD COLUMN pulse_name TEXT;

UPDATE metric_check_ins
SET pulse_id = (SELECT id FROM pulses WHERE name = 'Daily pulse'),
    pulse_name = 'Daily pulse';

ALTER TABLE metrics DROP COLUMN inactive_since;
"#,
        ),
        M::up("ALTER TABLE pulses ADD COLUMN icon TEXT NOT NULL DEFAULT 'activity';"),
        M::up("ALTER TABLE metrics ADD COLUMN icon TEXT NOT NULL DEFAULT 'activity';"),
        // Dashboard order is the popup order: pulses and the metrics inside
        // each pulse keep an explicit sort_order instead of created_at/rowid.
        M::up(
            r#"
ALTER TABLE pulses ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE pulses SET sort_order = id;

ALTER TABLE pulse_metrics ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE pulse_metrics SET sort_order = rowid;
"#,
        ),
        // Offline is the live Phase for lock / display-sleep / system-sleep.
        // Freeze-to-three inactivated any extra names; reactivate or insert it.
        M::up(
            r#"
INSERT INTO phases (name, created_at)
SELECT 'Offline', CAST(strftime('%s', 'now') AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM phases WHERE name = 'Offline');

UPDATE phases SET inactive_since = NULL WHERE name = 'Offline';
"#,
        ),
        // Task lists are drag-sortable, so tasks keep a manual sort_order.
        // Seed it from the old newest-updated-first order.
        M::up(
            r#"
ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
UPDATE tasks SET sort_order = (
  SELECT COUNT(*) FROM tasks other
  WHERE other.updated_at > tasks.updated_at
     OR (other.updated_at = tasks.updated_at AND other.id > tasks.id)
);
"#,
        ),
        // Repair databases that burned a version slot on the sort_order
        // migration while it briefly sat mid-list during development.
        M::up_with_hook("", |tx| {
            let has_sort_order: bool = tx.query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('tasks') \
                 WHERE name = 'sort_order')",
                [],
                |row| row.get(0),
            )?;
            if !has_sort_order {
                tx.execute_batch(
                    "ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
                     UPDATE tasks SET sort_order = (
                       SELECT COUNT(*) FROM tasks other
                       WHERE other.updated_at > tasks.updated_at
                          OR (other.updated_at = tasks.updated_at AND other.id > tasks.id)
                     );",
                )?;
            }
            Ok(())
        }),
        // Each stretch of Working now becomes a row with a start and an end,
        // replacing the three timer columns on tasks. Legacy totals have no
        // timestamps, so preserve each as one closed stretch ending at the
        // current live start or the Task's last update. No table rebuild:
        // SQLite drops a column-level CHECK along with its column, so
        // sort_order and the parent self-FK are never at risk.
        M::up(
            r#"
CREATE TABLE task_work_stretches (
  id         INTEGER PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  ended_at   INTEGER,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_task_work_stretches_task_started
  ON task_work_stretches(task_id, started_at DESC);
CREATE INDEX idx_task_work_stretches_started_at
  ON task_work_stretches(started_at);
CREATE UNIQUE INDEX idx_task_work_stretches_open
  ON task_work_stretches(task_id) WHERE ended_at IS NULL;

INSERT INTO task_work_stretches (task_id, started_at, ended_at)
SELECT id,
       COALESCE(work_started_at, updated_at) - worked_seconds,
       COALESCE(work_started_at, updated_at)
FROM tasks
WHERE worked_seconds > 0;

INSERT INTO task_work_stretches (task_id, started_at, ended_at)
SELECT id, work_started_at, NULL FROM tasks
WHERE working_now = 1 AND work_started_at IS NOT NULL;

ALTER TABLE tasks DROP COLUMN working_now;
ALTER TABLE tasks DROP COLUMN worked_seconds;
ALTER TABLE tasks DROP COLUMN work_started_at;
"#,
        ),
        // TimerState lives here. The table kept the old check-in name until
        // the timer/popup rename; live queries must use timer_schedule.
        M::up("ALTER TABLE check_in_schedule RENAME TO timer_schedule;"),
        // A running Nest stamps this while any Work stretch is open. A clean
        // exit banks open stretches; after a crash there is no such moment, so
        // the last heartbeat stands in for one and the downtime before the next
        // launch is not counted as work.
        M::up(
            r#"
CREATE TABLE app_heartbeat (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  beat_at INTEGER NOT NULL
);

INSERT INTO app_heartbeat (id, beat_at) VALUES (1, 0);
"#,
        ),
        M::up("ALTER TABLE metrics ADD COLUMN color TEXT;"),
        // Closing the popup leaves the timer paused at zero; persist that so
        // a restart does not treat an overdue next_due_at as a fresh due.
        M::up(
            "ALTER TABLE timer_schedule ADD COLUMN waiting_for_response INTEGER NOT NULL DEFAULT 0;",
        ),
        M::up(
            r#"
CREATE TABLE tags (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL COLLATE NOCASE UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE brain_dump_tags (
  brain_dump_id INTEGER NOT NULL REFERENCES brain_dumps(id) ON DELETE CASCADE,
  tag_id        INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (brain_dump_id, tag_id)
);

CREATE INDEX idx_brain_dump_tags_tag_id ON brain_dump_tags(tag_id);
"#,
        ),
        // Phase appearance is user-owned. Seed the existing four-Phase visual
        // language so upgrading keeps its meaning, then let settings replace it.
        M::up(
            r#"
ALTER TABLE phases ADD COLUMN icon TEXT NOT NULL DEFAULT 'activity';
ALTER TABLE phases ADD COLUMN color TEXT;

UPDATE phases SET icon = CASE name
  WHEN 'Doing' THEN 'target'
  WHEN 'Scoping' THEN 'idea'
  WHEN 'Resting' THEN 'coffee'
  WHEN 'Offline' THEN 'moon'
  ELSE 'activity'
END;

UPDATE phases SET color = CASE name
  WHEN 'Doing' THEN '#5f8fb8'
  WHEN 'Scoping' THEN '#c18e43'
  WHEN 'Resting' THEN '#35764e'
  ELSE NULL
END;
"#,
        ),
        // Brain dumps no longer carry an optional title; first line of text is
        // enough for Logs display, and fork-to-sticky replaces editing.
        M::up("ALTER TABLE brain_dumps DROP COLUMN title;"),
        // Historical: Reminders were seeded as Settings-owned rows (the previous
        // Greetings board lines). Assistant tables follow in this same era.
        // Assistant and Reminders are retired; keep these migrations and tables
        // so numbering and existing data stay valid. Do not add commands.
        M::up(
            r#"
CREATE TABLE reminders (
  id         INTEGER PRIMARY KEY,
  text       TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

INSERT INTO reminders (text, active, created_at) VALUES
  ('Put on some good music', 1, 0),
  ('Do a brain dump', 1, 0),
  ('Choose one small thing', 1, 0),
  ('Write down the next action', 1, 0),
  ('Clear the space around you', 1, 0),
  ('Close what you''re not using', 1, 0),
  ('Start for just two minutes', 1, 0);
"#,
        ),
        M::up(
            r#"
CREATE TABLE assistant_prompts (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  instructions TEXT NOT NULL CHECK (length(trim(instructions)) BETWEEN 1 AND 12000),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE TABLE assistant_conversations (
  id                  INTEGER PRIMARY KEY,
  title               TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  prompt_id           INTEGER REFERENCES assistant_prompts(id) ON DELETE SET NULL,
  prompt_title        TEXT NOT NULL,
  prompt_instructions TEXT NOT NULL,
  model                TEXT NOT NULL CHECK (model IN ('gpt-5.6-luna', 'gpt-5.6-terra')),
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE TABLE assistant_messages (
  id              INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 24000),
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_assistant_conversations_updated_at
ON assistant_conversations(updated_at DESC, id DESC);

CREATE INDEX idx_assistant_messages_conversation
ON assistant_messages(conversation_id, id);

INSERT INTO assistant_prompts (title, instructions, created_at, updated_at)
VALUES (
  'Task companion',
  'You are a calm, practical thinking partner. Help the user understand what feels stuck, identify Blockers, break the problem into small concrete actions, and choose one manageable next step. Ask one focused question when essential context is missing. Offer suggestions for the user to review rather than claiming to change their Tasks.',
  0,
  0
);
"#,
        ),
        M::up(
            "ALTER TABLE assistant_messages ADD COLUMN incomplete_reason TEXT;",
        ),
        M::up("ALTER TABLE assistant_messages ADD COLUMN context TEXT;"),
        M::up(
            r#"
ALTER TABLE assistant_messages ADD COLUMN sent_message TEXT;
ALTER TABLE assistant_messages ADD COLUMN system_instructions TEXT;
UPDATE assistant_messages
SET sent_message = COALESCE(context, content)
WHERE role = 'user';
"#,
        ),
        M::up(
            r#"
CREATE TABLE assistant_system_instruction_versions (
  id           INTEGER PRIMARY KEY,
  instructions TEXT NOT NULL CHECK (length(trim(instructions)) BETWEEN 1 AND 12000),
  saved_at     INTEGER NOT NULL
);

CREATE INDEX idx_assistant_system_instruction_versions_saved_at
ON assistant_system_instruction_versions(saved_at DESC, id DESC);
"#,
        ),
        // A Prompt now fills the composer instead of being sent as instructions, so a
        // chat no longer snapshots one, and sent_message replaced the context column.
        M::up(
            r#"
ALTER TABLE assistant_conversations DROP COLUMN prompt_id;
ALTER TABLE assistant_conversations DROP COLUMN prompt_title;
ALTER TABLE assistant_conversations DROP COLUMN prompt_instructions;
ALTER TABLE assistant_messages DROP COLUMN context;

UPDATE assistant_prompts
SET title = 'Stuck on a Task',
    instructions = 'I am stuck on this and cannot tell what to do next. Help me see what is actually blocking it, break it into smaller pieces, and pick one step I can start now.'
WHERE title = 'Task companion'
  AND instructions LIKE 'You are a calm, practical thinking partner.%';
"#,
        ),
        M::up(
            r#"
CREATE TABLE assistant_messages_new (
  id                  INTEGER PRIMARY KEY,
  conversation_id     INTEGER NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role                TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content             TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 24000),
  sent_message        TEXT CHECK (sent_message IS NULL OR length(trim(sent_message)) BETWEEN 1 AND 100000),
  system_instructions TEXT CHECK (system_instructions IS NULL OR length(trim(system_instructions)) BETWEEN 1 AND 12000),
  incomplete_reason   TEXT,
  created_at          INTEGER NOT NULL
);

INSERT INTO assistant_messages_new
  (id, conversation_id, role, content, sent_message, system_instructions, incomplete_reason, created_at)
SELECT
  id, conversation_id, role, content, sent_message, system_instructions, incomplete_reason, created_at
FROM assistant_messages;

DROP TABLE assistant_messages;
ALTER TABLE assistant_messages_new RENAME TO assistant_messages;

CREATE INDEX idx_assistant_messages_conversation
ON assistant_messages(conversation_id, id);
"#,
        ),
        M::up(
            r#"
CREATE TABLE metric_check_in_schedule (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  interval_minutes INTEGER NOT NULL CHECK (interval_minutes BETWEEN 15 AND 120 AND interval_minutes % 15 = 0),
  next_due_at      INTEGER NOT NULL
);

INSERT INTO metric_check_in_schedule (id, interval_minutes, next_due_at)
SELECT 1, 60, COALESCE(
  (SELECT MAX(created_at) + 3600 FROM metric_check_ins),
  CAST(strftime('%s', 'now') AS INTEGER) + 3600
);
"#,
        ),
        // Phase icon and color became fixed product choices, so earlier edits
        // are reset and Offline gets a quiet color of its own.
        M::up(
            r#"
UPDATE phases SET
  icon = CASE name
    WHEN 'Doing' THEN 'target'
    WHEN 'Scoping' THEN 'idea'
    WHEN 'Resting' THEN 'coffee'
    WHEN 'Offline' THEN 'moon'
    ELSE icon
  END,
  color = CASE name
    WHEN 'Doing' THEN '#5f8fb8'
    WHEN 'Scoping' THEN '#c18e43'
    WHEN 'Resting' THEN '#35764e'
    WHEN 'Offline' THEN '#8a8580'
    ELSE color
  END;
"#,
        ),
        M::up("DROP TABLE metric_check_in_schedule;"),
        // A follow-up Task points back at the closed Task it continues.
        // Deleting the original leaves the follow-up standing on its own.
        M::up(
            "ALTER TABLE tasks ADD COLUMN follows_task_id INTEGER \
             REFERENCES tasks(id) ON DELETE SET NULL;",
        ),
        // Rebuilding tasks must preserve this log before cascading deletes run.
        M::up(r#"
CREATE TABLE task_edit_history (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 before_value TEXT,
 after_value TEXT,
 related_task_id INTEGER,
 related_title TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX idx_task_edit_history_task_time ON task_edit_history(task_id, created_at DESC, id DESC);
CREATE INDEX idx_task_edit_history_time ON task_edit_history(created_at);
CREATE TRIGGER task_history_touch AFTER INSERT ON task_edit_history
BEGIN
 UPDATE tasks SET updated_at=MAX(updated_at,NEW.created_at) WHERE id=NEW.task_id;
END;
CREATE TABLE task_history_metadata (id INTEGER PRIMARY KEY CHECK(id = 1), started_at INTEGER NOT NULL);
INSERT INTO task_history_metadata VALUES (1, CAST(strftime('%s','now') AS INTEGER));
CREATE TRIGGER task_history_title AFTER UPDATE OF title ON tasks
WHEN OLD.title IS NOT NEW.title
BEGIN
 INSERT INTO task_edit_history(task_id,kind,before_value,after_value,created_at)
 VALUES(NEW.id,'title',CAST(OLD.title AS TEXT),CAST(NEW.title AS TEXT),NEW.updated_at);
END;
CREATE TRIGGER task_history_description AFTER UPDATE OF description ON tasks
WHEN OLD.description IS NOT NEW.description
BEGIN
 INSERT INTO task_edit_history(task_id,kind,before_value,after_value,created_at)
 VALUES(NEW.id,'description',NULL,NULL,NEW.updated_at);
END;
CREATE TRIGGER task_history_scope AFTER UPDATE OF scope ON tasks
WHEN OLD.scope IS NOT NEW.scope
BEGIN
 INSERT INTO task_edit_history(task_id,kind,before_value,after_value,created_at)
 VALUES(NEW.id,'scope',CAST(OLD.scope AS TEXT),CAST(NEW.scope AS TEXT),NEW.updated_at);
END;
CREATE TRIGGER task_history_value AFTER UPDATE OF value ON tasks
WHEN OLD.value IS NOT NEW.value
BEGIN
 INSERT INTO task_edit_history(task_id,kind,before_value,after_value,created_at)
 VALUES(NEW.id,'value',CAST(OLD.value AS TEXT),CAST(NEW.value AS TEXT),NEW.updated_at);
END;
CREATE TRIGGER task_history_effort AFTER UPDATE OF effort ON tasks
WHEN OLD.effort IS NOT NEW.effort
BEGIN
 INSERT INTO task_edit_history(task_id,kind,before_value,after_value,created_at)
 VALUES(NEW.id,'effort',CAST(OLD.effort AS TEXT),CAST(NEW.effort AS TEXT),NEW.updated_at);
END;
CREATE TRIGGER task_history_parent_remove AFTER UPDATE OF parent_task_id ON tasks
WHEN OLD.parent_task_id IS NOT NEW.parent_task_id AND OLD.parent_task_id IS NOT NULL
BEGIN
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT NEW.id,'parent_removed',id,title,NEW.updated_at FROM tasks WHERE id=OLD.parent_task_id;
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 VALUES(OLD.parent_task_id,'child_removed',NEW.id,NEW.title,NEW.updated_at);
END;
CREATE TRIGGER task_history_parent_add AFTER UPDATE OF parent_task_id ON tasks
WHEN OLD.parent_task_id IS NOT NEW.parent_task_id AND NEW.parent_task_id IS NOT NULL
BEGIN
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT NEW.id,'parent_set',id,title,NEW.updated_at FROM tasks WHERE id=NEW.parent_task_id;
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 VALUES(NEW.parent_task_id,'child_added',NEW.id,NEW.title,NEW.updated_at);
END;
CREATE TRIGGER task_history_initial_parent AFTER INSERT ON tasks WHEN NEW.parent_task_id IS NOT NULL
BEGIN
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT NEW.id,'parent_set',id,title,NEW.created_at FROM tasks WHERE id=NEW.parent_task_id;
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 VALUES(NEW.parent_task_id,'child_added',NEW.id,NEW.title,NEW.created_at);
END;
CREATE TRIGGER task_history_follow_up AFTER INSERT ON tasks WHEN NEW.follows_task_id IS NOT NULL
BEGIN
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT NEW.id,'follows',id,title,NEW.created_at FROM tasks WHERE id=NEW.follows_task_id;
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 VALUES(NEW.follows_task_id,'follow_up',NEW.id,NEW.title,NEW.created_at);
END;
CREATE TRIGGER task_history_dependency_added AFTER INSERT ON task_dependencies
BEGIN
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT NEW.blocked_task_id,'blocker_added',id,title,CAST(strftime('%s','now') AS INTEGER) FROM tasks WHERE id=NEW.blocker_task_id;
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT NEW.blocker_task_id,'dependent_added',id,title,CAST(strftime('%s','now') AS INTEGER) FROM tasks WHERE id=NEW.blocked_task_id;
END;
CREATE TRIGGER task_history_dependency_removed AFTER DELETE ON task_dependencies
BEGIN
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT OLD.blocked_task_id,'blocker_removed',id,title,CAST(strftime('%s','now') AS INTEGER) FROM tasks WHERE id=OLD.blocker_task_id;
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT OLD.blocker_task_id,'dependent_removed',id,title,CAST(strftime('%s','now') AS INTEGER) FROM tasks WHERE id=OLD.blocked_task_id;
END;
CREATE TRIGGER task_history_before_delete BEFORE DELETE ON tasks
BEGIN
 UPDATE tasks SET parent_task_id=NULL,updated_at=CAST(strftime('%s','now') AS INTEGER) WHERE id=OLD.id OR parent_task_id=OLD.id;
 DELETE FROM task_dependencies WHERE blocker_task_id=OLD.id OR blocked_task_id=OLD.id;
END;
CREATE TRIGGER task_history_work_removed AFTER DELETE ON task_work_stretches WHEN EXISTS(SELECT 1 FROM tasks WHERE id=OLD.task_id)
BEGIN
 INSERT INTO task_edit_history(task_id,kind,before_value,after_value,created_at)
 VALUES(OLD.task_id,'work_removed',CAST(OLD.started_at AS TEXT) || ' / ' || COALESCE(CAST(OLD.ended_at AS TEXT),'open'),NULL,CAST(strftime('%s','now') AS INTEGER));
END;
"#),
        // That trigger edited the row being deleted, which SQLite leaves
        // undefined. TaskGraph::delete_task_in now unlinks the Task first.
        // Without it, a delete that lets FK actions unlink the Task makes
        // these triggers log on the deleted row, so each entry now requires
        // the Task it is written to.
        M::up(r#"
DROP TRIGGER IF EXISTS task_history_before_delete;
DROP TRIGGER task_history_parent_remove;
CREATE TRIGGER task_history_parent_remove AFTER UPDATE OF parent_task_id ON tasks
WHEN OLD.parent_task_id IS NOT NEW.parent_task_id AND OLD.parent_task_id IS NOT NULL
BEGIN
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT NEW.id,'parent_removed',id,title,NEW.updated_at FROM tasks WHERE id=OLD.parent_task_id;
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT OLD.parent_task_id,'child_removed',NEW.id,NEW.title,NEW.updated_at
 WHERE EXISTS(SELECT 1 FROM tasks WHERE id=OLD.parent_task_id);
END;
DROP TRIGGER task_history_dependency_removed;
CREATE TRIGGER task_history_dependency_removed AFTER DELETE ON task_dependencies
BEGIN
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT OLD.blocked_task_id,'blocker_removed',id,title,CAST(strftime('%s','now') AS INTEGER) FROM tasks
 WHERE id=OLD.blocker_task_id AND EXISTS(SELECT 1 FROM tasks WHERE id=OLD.blocked_task_id);
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT OLD.blocker_task_id,'dependent_removed',id,title,CAST(strftime('%s','now') AS INTEGER) FROM tasks
 WHERE id=OLD.blocked_task_id AND EXISTS(SELECT 1 FROM tasks WHERE id=OLD.blocker_task_id);
END;
"#),
        // History merges several tables and updated_at only resolves to the
        // second, so a counter bumped by every source tells the dashboard its
        // History is stale. Work removal is now recorded in Rust beside work
        // corrections, so one function owns the stored interval text.
        M::up(r#"
ALTER TABLE tasks ADD COLUMN history_revision INTEGER NOT NULL DEFAULT 0;
DROP TRIGGER task_history_work_removed;
CREATE TRIGGER task_history_revision_edit AFTER INSERT ON task_edit_history
BEGIN
 UPDATE tasks SET history_revision=history_revision+1 WHERE id=NEW.task_id;
END;
CREATE TRIGGER task_history_revision_status AFTER INSERT ON task_status_events
BEGIN
 UPDATE tasks SET history_revision=history_revision+1 WHERE id=NEW.task_id;
END;
CREATE TRIGGER task_history_revision_work_insert AFTER INSERT ON task_work_stretches
BEGIN
 UPDATE tasks SET history_revision=history_revision+1 WHERE id=NEW.task_id;
END;
CREATE TRIGGER task_history_revision_work_update AFTER UPDATE OF started_at,ended_at ON task_work_stretches
BEGIN
 UPDATE tasks SET history_revision=history_revision+1 WHERE id=NEW.task_id;
END;
CREATE TRIGGER task_history_revision_work_delete AFTER DELETE ON task_work_stretches
BEGIN
 UPDATE tasks SET history_revision=history_revision+1 WHERE id=OLD.task_id;
END;
"#),
        // A dependency carries its own created_at, which seeded and imported
        // rows backdate, so History dates the addition from it. Removal has no
        // stored time and keeps the clock.
        M::up(r#"
DROP TRIGGER task_history_dependency_added;
CREATE TRIGGER task_history_dependency_added AFTER INSERT ON task_dependencies
BEGIN
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT NEW.blocked_task_id,'blocker_added',id,title,NEW.created_at FROM tasks WHERE id=NEW.blocker_task_id;
 INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
 SELECT NEW.blocker_task_id,'dependent_added',id,title,NEW.created_at FROM tasks WHERE id=NEW.blocked_task_id;
END;
"#),
        // Brain dumps are renamed Notes. RENAME keeps every row and rewrites
        // note_tags' foreign key to the new table name.
        M::up(r#"
ALTER TABLE brain_dumps RENAME TO notes;
ALTER TABLE brain_dump_tags RENAME TO note_tags;
ALTER TABLE note_tags RENAME COLUMN brain_dump_id TO note_id;
DROP INDEX IF EXISTS idx_brain_dumps_created_at;
CREATE INDEX idx_notes_created_at ON notes(created_at);
DROP INDEX IF EXISTS idx_brain_dump_tags_tag_id;
CREATE INDEX idx_note_tags_tag_id ON note_tags(tag_id);
"#),
        // Retire Task categorization and execution dependencies together with
        // their history entries; all remaining Task records keep their ids.
        M::up(r#"
DROP TRIGGER task_history_scope;
DROP TRIGGER task_history_dependency_added;
DROP TRIGGER task_history_dependency_removed;
DROP TABLE task_dependencies;
ALTER TABLE tasks DROP COLUMN scope;
DELETE FROM task_edit_history
WHERE kind IN ('scope','blocker_added','blocker_removed','dependent_added','dependent_removed');
"#),
    ])
}

#[cfg(test)]
mod tests {
    use super::migrations;
    use rusqlite::Connection;

    /// Schema version right after tasks gained sort_order, i.e. the slot the
    /// repair hook that follows it fixes up. Bump only if a migration is ever
    /// inserted at or before that slot.
    const SORT_ORDER_VERSION: usize = 34;

    #[test]
    fn retiring_scopes_and_blockers_preserves_tasks_and_remaining_history() {
        let mut probe = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut probe).unwrap();
        let latest: i64 = probe
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations()
            .to_version(&mut conn, (latest - 1) as usize)
            .unwrap();
        conn.execute("INSERT INTO tasks(id,title,status,created_at,updated_at,scope) VALUES(1,'Parent','active',1,1,'Work'),(2,'Child','backlog',1,1,'Home')", []).unwrap();
        conn.execute(
            "UPDATE tasks SET parent_task_id=1,title='Renamed',scope='Elsewhere' WHERE id=2",
            [],
        )
        .unwrap();
        conn.execute("INSERT INTO task_dependencies VALUES(1,2,2)", [])
            .unwrap();
        conn.execute(
            "INSERT INTO task_status_events(task_id,to_status,created_at) VALUES(1,'active',1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO task_work_stretches(task_id,started_at,ended_at) VALUES(1,2,12)",
            [],
        )
        .unwrap();
        migrations().to_latest(&mut conn).unwrap();
        let child: (String, i64) = conn
            .query_row(
                "SELECT title,parent_task_id FROM tasks WHERE id=2",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(child, ("Renamed".into(), 1));
        let retired: i64 = conn.query_row("SELECT COUNT(*) FROM task_edit_history WHERE kind IN ('scope','blocker_added','blocker_removed','dependent_added','dependent_removed')", [], |row| row.get(0)).unwrap();
        assert_eq!(retired, 0);
        let dependencies: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name='task_dependencies'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dependencies, 0);
        let counts: (i64,i64,i64) = conn.query_row("SELECT (SELECT COUNT(*) FROM task_status_events),(SELECT COUNT(*) FROM task_work_stretches),(SELECT COUNT(*) FROM task_edit_history WHERE kind='title')", [], |row| Ok((row.get(0)?,row.get(1)?,row.get(2)?))).unwrap();
        assert_eq!(counts, (1, 1, 1));
        conn.execute("UPDATE tasks SET value=3 WHERE id=2", [])
            .unwrap();
        crate::task_graph::TaskGraph::delete_task(&mut conn, 1).unwrap();
        assert!(conn.prepare("SELECT scope FROM tasks").is_err());
        assert!(conn
            .prepare("PRAGMA foreign_key_check")
            .unwrap()
            .query([])
            .unwrap()
            .next()
            .unwrap()
            .is_none());
    }

    #[test]
    fn edit_history_upgrade_keeps_existing_records_and_starts_empty() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 55).unwrap();
        conn.execute("INSERT INTO tasks(id,title,status,created_at,updated_at) VALUES(1,'Existing','active',1,1)",[]).unwrap();
        conn.execute("INSERT INTO task_status_events(task_id,from_status,to_status,created_at) VALUES(1,NULL,'active',1)",[]).unwrap();
        conn.execute(
            "INSERT INTO task_work_stretches(task_id,started_at,ended_at) VALUES(1,2,3)",
            [],
        )
        .unwrap();
        migrations().to_latest(&mut conn).unwrap();
        for table in [
            "tasks",
            "task_status_events",
            "task_work_stretches",
            "task_history_metadata",
        ] {
            let count: i64 = conn
                .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |r| r.get(0))
                .unwrap();
            assert_eq!(count, 1);
        }
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM task_edit_history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        conn.execute("UPDATE tasks SET title='Changed' WHERE id=1", [])
            .unwrap();
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM task_edit_history", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn existing_tasks_follow_no_task() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 54).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at) \
             VALUES (1, 'Closed earlier', 'completed', 1, 1)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let follows_task_id: Option<i64> = conn
            .query_row(
                "SELECT follows_task_id FROM tasks WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(follows_task_id, None);
    }

    #[test]
    fn removing_metric_schedule_preserves_ratings_and_timer() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        let migrations = migrations();
        migrations.to_version(&mut conn, 53).unwrap();
        conn.execute_batch(
            "INSERT INTO metrics (id, name, created_at) VALUES (1, 'Energy', 1);
             INSERT INTO metric_check_ins (id, created_at) VALUES (1, 40);
             INSERT INTO metric_ratings (check_in_id, metric_id, value) VALUES (1, 1, 4);
             UPDATE timer_schedule SET interval_minutes = 20, next_due_at = 1234 WHERE id = 1;",
        )
        .unwrap();

        migrations.to_latest(&mut conn).unwrap();

        let schedule_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name = 'metric_check_in_schedule'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(schedule_count, 0);
        let saved_rating: (i64, i64) = conn
            .query_row(
                "SELECT ci.created_at, r.value FROM metric_check_ins ci
             JOIN metric_ratings r ON r.check_in_id = ci.id WHERE ci.id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(saved_rating, (40, 4));
        let timer: (i64, i64) = conn
            .query_row(
                "SELECT interval_minutes, next_due_at FROM timer_schedule WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(timer, (20, 1234));
    }

    #[test]
    fn seeds_a_prompt_worded_as_the_user_and_drops_the_dead_prompt_columns() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let seeded: (String, String) = conn
            .query_row(
                "SELECT title, instructions FROM assistant_prompts",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(seeded.0, "Stuck on a Task");
        // A Prompt fills the composer, so the seed has to read as the user talking.
        assert!(seeded.1.starts_with("I am stuck"));

        assert!(conn
            .prepare("SELECT prompt_id FROM assistant_conversations")
            .is_err());
        assert!(conn
            .prepare("SELECT context FROM assistant_messages")
            .is_err());
    }

    #[test]
    fn leaves_an_edited_seed_prompt_alone() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 49).unwrap();
        conn.execute(
            "UPDATE assistant_prompts SET instructions = 'My own wording'",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();
        let instructions: String = conn
            .query_row("SELECT instructions FROM assistant_prompts", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(instructions, "My own wording");
    }

    #[test]
    fn backfills_saved_messages_from_the_legacy_context_column() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 47).unwrap();
        conn.execute(
            "INSERT INTO assistant_conversations \
             (id, title, prompt_title, prompt_instructions, model, created_at, updated_at) \
             VALUES (1, 'A hard morning', '', '', 'gpt-5.6-luna', 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO assistant_messages (conversation_id, role, content, context, created_at) \
             VALUES (1, 'user', 'Typed', 'Tasks · active\n\nTyped', 1)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();
        let saved: (String, Option<String>) = conn
            .query_row(
                "SELECT sent_message, system_instructions FROM assistant_messages",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(saved, ("Tasks · active\n\nTyped".into(), None));
    }

    #[test]
    fn keeps_each_saved_system_instruction_version() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO assistant_system_instruction_versions (instructions, saved_at) \
             VALUES ('First instruction', 1), ('Second instruction', 2)",
            [],
        )
        .unwrap();

        let versions: Vec<(String, i64)> = conn
            .prepare(
                "SELECT instructions, saved_at FROM assistant_system_instruction_versions \
                 ORDER BY saved_at DESC, id DESC",
            )
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(
            versions,
            vec![
                ("Second instruction".into(), 2),
                ("First instruction".into(), 1)
            ]
        );
    }

    #[test]
    fn constrains_saved_assistant_payloads() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO assistant_conversations (title, model, created_at, updated_at) \
             VALUES ('A hard morning', 'gpt-5.6-luna', 1, 1)",
            [],
        )
        .unwrap();

        assert!(conn
            .execute(
                "INSERT INTO assistant_messages \
             (conversation_id, role, content, sent_message, created_at) \
             VALUES (1, 'user', 'Typed', ' ', 1)",
                [],
            )
            .is_err());
        assert!(conn
            .execute(
                "INSERT INTO assistant_messages \
             (conversation_id, role, content, system_instructions, created_at) \
             VALUES (1, 'user', 'Typed', ' ', 1)",
                [],
            )
            .is_err());
    }

    #[test]
    fn seeds_reminders_for_greetings_board() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();

        let reminders: Vec<(String, i64)> = conn
            .prepare("SELECT text, active FROM reminders ORDER BY id")
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();

        assert_eq!(
            reminders,
            vec![
                ("Put on some good music".into(), 1),
                ("Do a brain dump".into(), 1),
                ("Choose one small thing".into(), 1),
                ("Write down the next action".into(), 1),
                ("Clear the space around you".into(), 1),
                ("Close what you're not using".into(), 1),
                ("Start for just two minutes".into(), 1),
            ]
        );
    }

    #[test]
    fn resets_phase_appearance_to_fixed_defaults() {
        let mut conn = Connection::open_in_memory().unwrap();
        let migrations = migrations();
        migrations.to_version(&mut conn, 52).unwrap();
        conn.execute(
            "UPDATE phases SET icon = 'star', color = '#000000' WHERE name = 'Doing'",
            [],
        )
        .unwrap();
        migrations.to_latest(&mut conn).unwrap();

        let phases: Vec<(String, String, Option<String>)> = conn
            .prepare(
                "SELECT name, icon, color FROM phases WHERE inactive_since IS NULL ORDER BY name",
            )
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();

        assert_eq!(
            phases,
            vec![
                ("Doing".into(), "target".into(), Some("#5f8fb8".into())),
                ("Offline".into(), "moon".into(), Some("#8a8580".into())),
                ("Resting".into(), "coffee".into(), Some("#35764e".into())),
                ("Scoping".into(), "idea".into(), Some("#c18e43".into())),
            ]
        );
    }

    #[test]
    fn tag_deletion_removes_associations_and_keeps_notes() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO notes (id, created_at, text) VALUES (1, 10, 'Keep me')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tags (id, name, created_at) VALUES (1, 'Work', 10)",
            [],
        )
        .unwrap();
        assert!(conn
            .execute(
                "INSERT INTO tags (id, name, created_at) VALUES (2, 'work', 11)",
                [],
            )
            .is_err());
        conn.execute("INSERT INTO note_tags (note_id, tag_id) VALUES (1, 1)", [])
            .unwrap();

        conn.execute("DELETE FROM tags WHERE id = 1", []).unwrap();

        let note_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM notes", [], |row| row.get(0))
            .unwrap();
        let association_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_tags", [], |row| row.get(0))
            .unwrap();
        assert_eq!((note_count, association_count), (1, 0));
    }

    #[test]
    fn renaming_brain_dumps_to_notes_keeps_rows_tags_and_cascades() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 59).unwrap();
        conn.execute_batch(
            "INSERT INTO brain_dumps (id, created_at, text) VALUES (1, 10, 'Kept');
             INSERT INTO tags (id, name, created_at) VALUES (1, 'Work', 10);
             INSERT INTO brain_dump_tags (brain_dump_id, tag_id) VALUES (1, 1);",
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let (text, tag_id): (String, i64) = conn
            .query_row(
                "SELECT n.text, nt.tag_id FROM notes n \
                 JOIN note_tags nt ON nt.note_id = n.id",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!((text.as_str(), tag_id), ("Kept", 1));

        let old_tables: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master \
                 WHERE name IN ('brain_dumps', 'brain_dump_tags', \
                 'idx_brain_dumps_created_at', 'idx_brain_dump_tags_tag_id')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(old_tables, 0);

        conn.execute("DELETE FROM notes WHERE id = 1", []).unwrap();
        let associations: i64 = conn
            .query_row("SELECT COUNT(*) FROM note_tags", [], |row| row.get(0))
            .unwrap();
        assert_eq!(associations, 0);
    }

    #[test]
    fn repairs_a_database_that_burned_a_version_on_the_sort_order_migration() {
        let mut conn = Connection::open_in_memory().unwrap();
        // The shipped-then-moved migration left real databases stopped right
        // after the sort_order slot with no sort_order column. Stop there
        // rather than rewinding from latest, so appending migrations later
        // neither retargets this test nor re-runs a one-shot migration.
        migrations()
            .to_version(&mut conn, SORT_ORDER_VERSION)
            .unwrap();
        conn.execute_batch("ALTER TABLE tasks DROP COLUMN sort_order;")
            .unwrap();

        migrations().to_latest(&mut conn).unwrap();
        let has_sort_order: bool = conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pragma_table_info('tasks') \
                 WHERE name = 'sort_order')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(has_sort_order);
    }

    #[test]
    fn work_stretches_preserve_banked_and_live_work() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 35).unwrap();
        conn.execute(
            "INSERT INTO tasks \
             (id, title, status, working_now, worked_seconds, work_started_at, \
              sort_order, created_at, updated_at) \
             VALUES (1, 'Working', 'active', 1, 300, 900, 7, 1, 1000), \
                    (2, 'Banked only', 'active', 0, 500, NULL, 8, 1, 1000)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let stretches: Vec<(i64, i64, Option<i64>)> = conn
            .prepare(
                "SELECT task_id, started_at, ended_at FROM task_work_stretches \
                 ORDER BY task_id, id",
            )
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(
            stretches,
            vec![(1, 600, Some(900)), (1, 900, None), (2, 500, Some(1000)),]
        );

        let worked: Vec<(i64, i64)> = conn
            .prepare(
                "SELECT task_id, SUM(ended_at - started_at) \
                 FROM task_work_stretches WHERE ended_at IS NOT NULL \
                 GROUP BY task_id ORDER BY task_id",
            )
            .unwrap()
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(worked, vec![(1, 300), (2, 500)]);

        let sort_order: i64 = conn
            .query_row("SELECT sort_order FROM tasks WHERE id = 2", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(sort_order, 8);

        let timer_columns: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('tasks') \
                 WHERE name IN ('working_now', 'worked_seconds', 'work_started_at')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(timer_columns, 0);

        // One open stretch per task, enforced by the partial unique index.
        conn.execute(
            "INSERT INTO task_work_stretches (task_id, started_at) VALUES (1, 950)",
            [],
        )
        .unwrap_err();

        let foreign_key_errors: i64 = conn
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(foreign_key_errors, 0);
    }

    #[test]
    fn repairs_database_missing_notes_after_mid_list_migration_insert() {
        let mut conn = Connection::open_in_memory().unwrap();
        // A real version-10 database has task_check_ins (created at version 9);
        // later migrations rely on it.
        conn.execute_batch(
            r#"
CREATE TABLE task_check_ins (
  id                    INTEGER PRIMARY KEY,
  created_at            INTEGER NOT NULL,
  task                  TEXT NOT NULL,
  next_check_in_minutes INTEGER NOT NULL
);

CREATE TABLE metrics (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  created_at     INTEGER NOT NULL,
  inactive_since INTEGER
);

CREATE TABLE metric_check_ins (
  id         INTEGER PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE metric_ratings (
  check_in_id INTEGER NOT NULL REFERENCES metric_check_ins(id) ON DELETE CASCADE,
  metric_id   INTEGER NOT NULL REFERENCES metrics(id),
  value       INTEGER NOT NULL CHECK (value BETWEEN 1 AND 5),
  PRIMARY KEY (check_in_id, metric_id)
);

CREATE TABLE phases (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  created_at     INTEGER NOT NULL,
  inactive_since INTEGER
);

CREATE TABLE phase_check_ins (
  id          INTEGER PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  phase_id    INTEGER NOT NULL REFERENCES phases(id),
  phase_label TEXT
);
"#,
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 10).unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'notes'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 1);

        let title_column_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('notes') \
                 WHERE name = 'title'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title_column_count, 0);

        conn.execute(
            "INSERT INTO notes (created_at, text) VALUES (?1, ?2)",
            (123_i64, "works"),
        )
        .unwrap();
    }

    #[test]
    fn seeds_check_in_schedule_from_latest_task_check_in() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_version(&mut conn, 11).unwrap();

        conn.execute(
            "INSERT INTO task_check_ins (created_at, task, next_check_in_minutes) \
             VALUES (1000, 'older', 10), (2000, 'newer', 20)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let (interval, next_due_at): (i64, i64) = conn
            .query_row(
                "SELECT interval_minutes, next_due_at FROM timer_schedule WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(interval, 20);
        assert_eq!(next_due_at, 2000 + 20 * 60);

        let dropped_column_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('task_check_ins') \
                 WHERE name = 'next_check_in_minutes'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(dropped_column_count, 0);
    }

    #[test]
    fn task_status_events_are_created_without_terminal_timestamp_columns() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let status_event_table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master \
                 WHERE type = 'table' AND name = 'task_status_events'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(status_event_table_count, 1);

        let terminal_timestamp_columns: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('tasks') \
                 WHERE name IN ('completed_at', 'cancelled_at')",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(terminal_timestamp_columns, 0);

        let scope_column_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('tasks') WHERE name = 'scope'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(scope_column_count, 0);
    }

    #[test]
    fn adds_up_next_status_without_losing_tasks_or_status_events() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 19).unwrap();

        conn.execute(
            "INSERT INTO tasks \
             (id, title, status, created_at, updated_at, description, value, effort, scope) \
             VALUES (1, 'Existing task', 'backlog', 100, 200, 'Keep me', 5, 2, 'Work')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO task_status_events \
             (id, task_id, from_status, to_status, created_at) \
             VALUES (1, 1, NULL, 'backlog', 100)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let task: (String, String, String, Option<i64>, Option<i64>) = conn
            .query_row(
                "SELECT title, status, description, value, effort FROM tasks WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            task,
            (
                "Existing task".into(),
                "backlog".into(),
                "Keep me".into(),
                Some(5),
                Some(2),
            )
        );

        let event_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_status_events WHERE task_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(event_count, 1);

        conn.execute("UPDATE tasks SET status = 'up_next' WHERE id = 1", [])
            .unwrap();
        conn.execute(
            "INSERT INTO task_status_events \
             (task_id, from_status, to_status, created_at) \
             VALUES (1, 'backlog', 'up_next', 300)",
            [],
        )
        .unwrap();

        let foreign_keys_enabled: i64 = conn
            .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
            .unwrap();
        assert_eq!(foreign_keys_enabled, 1);

        let foreign_key_errors: i64 = conn
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(foreign_key_errors, 0);
    }

    #[test]
    fn existing_tasks_default_to_not_working_now() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_version(&mut conn, 21).unwrap();
        conn.execute(
            "INSERT INTO tasks (title, status, created_at, updated_at) \
             VALUES ('Existing task', 'active', 100, 100)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let open_stretches: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_work_stretches WHERE ended_at IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(open_stretches, 0);
    }

    #[test]
    fn task_table_rebuild_preserves_status_events() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 14).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at) \
             VALUES (1, 'Existing task', 'active', 100, 200)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO task_status_events \
             (id, task_id, from_status, to_status, created_at) \
             VALUES (1, 1, 'backlog', 'active', 150)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let event: (Option<String>, String, i64) = conn
            .query_row(
                "SELECT from_status, to_status, created_at \
                 FROM task_status_events WHERE task_id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(event, (Some("backlog".into()), "active".into(), 150));
    }

    #[test]
    fn repairs_tasks_with_missing_status_history() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_version(&mut conn, 22).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at) \
             VALUES (1, 'Missing history', 'active', 100, 200)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let event: (Option<String>, String, i64) = conn
            .query_row(
                "SELECT from_status, to_status, created_at \
                 FROM task_status_events WHERE task_id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(event, (None, "active".into(), 100));
    }

    #[test]
    fn drops_paused_as_a_live_status_and_cancels_leftovers() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 24).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at, working_now) \
             VALUES (1, 'Parked', 'paused', 100, 200, 1), \
                    (2, 'Still active', 'active', 100, 200, 0)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO task_status_events \
             (task_id, from_status, to_status, created_at) \
             VALUES (2, 'active', 'paused', 150), (2, 'paused', 'active', 180)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let parked: (String, bool) = conn
            .query_row(
                "SELECT t.status, \
                 EXISTS(SELECT 1 FROM task_work_stretches s \
                        WHERE s.task_id = t.id AND s.ended_at IS NULL) \
                 FROM tasks t WHERE t.id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(parked, ("cancelled".into(), false));

        let cancel_event: (Option<String>, String) = conn
            .query_row(
                "SELECT from_status, to_status FROM task_status_events \
                 WHERE task_id = 1 ORDER BY id DESC LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(cancel_event, (Some("paused".into()), "cancelled".into()));

        let historical: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_status_events \
                 WHERE task_id = 2 AND 'paused' IN (from_status, to_status)",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(historical, 2);

        conn.execute("UPDATE tasks SET status = 'paused' WHERE id = 2", [])
            .unwrap_err();
    }

    #[test]
    fn starts_timing_tasks_that_were_already_working() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_version(&mut conn, 25).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, working_now, created_at, updated_at) \
             VALUES (1, 'Already working', 'active', 1, 100, 100)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        // Live work carries over as an open stretch; banked totals start fresh.
        let timer: (i64, Option<i64>) = conn
            .query_row(
                "SELECT COALESCE((SELECT SUM(ended_at - started_at) \
                                  FROM task_work_stretches \
                                  WHERE task_id = 1 AND ended_at IS NOT NULL), 0), \
                 (SELECT started_at FROM task_work_stretches \
                  WHERE task_id = 1 AND ended_at IS NULL)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(timer.0, 0);
        assert!(timer.1.is_some_and(|started_at| started_at > 0));
    }

    #[test]
    fn repairs_version_26_database_missing_work_timer_columns() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_version(&mut conn, 25).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, working_now, created_at, updated_at) \
             VALUES (1, 'Already working', 'active', 1, 100, 100)",
            [],
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 26).unwrap();

        migrations().to_latest(&mut conn).unwrap();

        // Live work carries over as an open stretch; banked totals start fresh.
        let timer: (i64, Option<i64>) = conn
            .query_row(
                "SELECT COALESCE((SELECT SUM(ended_at - started_at) \
                                  FROM task_work_stretches \
                                  WHERE task_id = 1 AND ended_at IS NOT NULL), 0), \
                 (SELECT started_at FROM task_work_stretches \
                  WHERE task_id = 1 AND ended_at IS NULL)",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(timer.0, 0);
        assert!(timer.1.is_some_and(|started_at| started_at > 0));
    }

    #[test]
    fn freezes_canonical_phases_and_preserves_old_foreign_keys() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_version(&mut conn, 27).unwrap();
        conn.execute(
            "UPDATE phases SET inactive_since = 50 WHERE name = 'Doing'",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO phase_check_ins (id, created_at, phase_id) VALUES (1, 10, 1)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let doing_active: Option<i64> = conn
            .query_row(
                "SELECT inactive_since FROM phases WHERE name = 'Doing'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(doing_active, None);

        let extras: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM phases \
                 WHERE name NOT IN ('Scoping', 'Doing', 'Resting', 'Offline') \
                   AND inactive_since IS NULL",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(extras, 0);

        let historical: i64 = conn
            .query_row(
                "SELECT phase_id FROM phase_check_ins WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(historical, 1);

        let offline_active: Option<i64> = conn
            .query_row(
                "SELECT inactive_since FROM phases WHERE name = 'Offline'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(offline_active, None);
    }

    #[test]
    fn migrates_metric_activity_into_one_pulse_and_preserves_check_in_identity() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_version(&mut conn, 28).unwrap();
        conn.execute(
            "INSERT INTO metrics (id, name, created_at, inactive_since) VALUES \
             (1, 'Energy', 10, NULL), (2, 'Retired', 20, 30)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO metric_check_ins (id, created_at) VALUES (1, 40)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO metric_ratings (check_in_id, metric_id, value) VALUES (1, 1, 4)",
            [],
        )
        .unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let inactive_column: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('metrics') WHERE name = 'inactive_since'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(inactive_column, 0);

        let metric_icon: String = conn
            .query_row("SELECT icon FROM metrics WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(metric_icon, "activity");

        let memberships: Vec<i64> = conn
            .prepare("SELECT metric_id FROM pulse_metrics ORDER BY metric_id")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(memberships, vec![1]);

        let pulse_id: i64 = conn
            .query_row(
                "SELECT id FROM pulses WHERE name = 'Daily pulse'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let icon: String = conn
            .query_row("SELECT icon FROM pulses WHERE id = ?1", [pulse_id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(icon, "activity");
        let sort_order: i64 = conn
            .query_row(
                "SELECT sort_order FROM pulses WHERE id = ?1",
                [pulse_id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(sort_order, pulse_id);
        conn.execute("DELETE FROM pulses WHERE id = ?1", [pulse_id])
            .unwrap();
        let historical: (Option<i64>, Option<String>) = conn
            .query_row(
                "SELECT pulse_id, pulse_name FROM metric_check_ins WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(historical, (None, Some("Daily pulse".into())));
    }
}
