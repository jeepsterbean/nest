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
    ])
}
