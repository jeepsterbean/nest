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
    ])
}
