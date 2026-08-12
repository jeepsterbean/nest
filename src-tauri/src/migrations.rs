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
PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS idx_tasks_status_updated_at;

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

CREATE INDEX idx_tasks_status_updated_at ON tasks(status, updated_at DESC);

PRAGMA foreign_keys = ON;
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
    ])
}

#[cfg(test)]
mod tests {
    use super::migrations;
    use rusqlite::Connection;

    #[test]
    fn repairs_database_missing_brain_dumps_after_mid_list_migration_insert() {
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
"#,
        )
        .unwrap();
        conn.pragma_update(None, "user_version", 10).unwrap();

        migrations().to_latest(&mut conn).unwrap();

        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'brain_dumps'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(table_count, 1);

        let title_column_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('brain_dumps') \
                 WHERE name = 'title'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title_column_count, 1);

        conn.execute(
            "INSERT INTO brain_dumps (created_at, text) VALUES (?1, ?2)",
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
                "SELECT interval_minutes, next_due_at FROM check_in_schedule WHERE id = 1",
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
        assert_eq!(scope_column_count, 1);
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

        let task: (
            String,
            String,
            String,
            Option<i64>,
            Option<i64>,
            Option<String>,
        ) = conn
            .query_row(
                "SELECT title, status, description, value, effort, scope FROM tasks WHERE id = 1",
                [],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
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
                Some("Work".into()),
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

        let working_now: bool = conn
            .query_row("SELECT working_now FROM tasks", [], |row| row.get(0))
            .unwrap();
        assert!(!working_now);
    }
}
