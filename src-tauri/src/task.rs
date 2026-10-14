//! Task rows shared by commands and lifecycle upkeep. Working now lives in
//! `task_work_stretches`, so these reads stay out of the command module.

use rusqlite::{params, Connection, Row};

use crate::error::Result;
use crate::models::Task;

/// Working now, Worked time and the live start are derived from
/// task_work_stretches rather than stored, so a corrected stretch moves the
/// total. Closed at is derived the same way from task_status_events: the latest
/// move into the closed status the Task holds now, so an earlier closure that
/// was reopened never counts. Selects using this must alias the tasks table as `t`. Correlated
/// subqueries are illegal in RETURNING, so it cannot be used there.
pub(crate) const TASK_COLUMNS: &str = "t.id, t.title, t.description, t.status, \
    EXISTS(SELECT 1 FROM task_work_stretches s \
           WHERE s.task_id = t.id AND s.ended_at IS NULL), \
    COALESCE((SELECT SUM(s.ended_at - s.started_at) FROM task_work_stretches s \
              WHERE s.task_id = t.id AND s.ended_at IS NOT NULL), 0), \
    (SELECT s.started_at FROM task_work_stretches s \
     WHERE s.task_id = t.id AND s.ended_at IS NULL), \
    t.scope, t.value, t.effort, t.parent_task_id, t.created_at, t.updated_at, \
    (SELECT MAX(e.created_at) FROM task_status_events e \
     WHERE e.task_id = t.id AND e.to_status = t.status \
       AND t.status IN ('completed', 'cancelled')), \
    t.follows_task_id, t.history_revision";

pub(crate) fn map_task(row: &Row<'_>) -> rusqlite::Result<Task> {
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        status: row.get(3)?,
        working_now: row.get(4)?,
        worked_seconds: row.get(5)?,
        work_started_at: row.get(6)?,
        scope: row.get(7)?,
        value: row.get(8)?,
        effort: row.get(9)?,
        parent_task_id: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
        closed_at: row.get(13)?,
        follows_task_id: row.get(14)?,
        history_revision: row.get(15)?,
    })
}

pub(crate) fn fetch_task(conn: &Connection, id: i64) -> Result<Task> {
    conn.query_row(
        &format!("SELECT {TASK_COLUMNS} FROM tasks t WHERE t.id = ?1"),
        params![id],
        map_task,
    )
    .map_err(Into::into)
}

/// Starting and stopping work no longer writes to tasks, but Worked time is
/// still a change to the task as far as the Updated column and its sorts care.
pub(crate) fn touch_task(conn: &Connection, id: i64, now: i64) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::migrations::migrations;

    /// Replace a task's stretches with `banked` seconds of finished work plus,
    /// optionally, one open stretch. Worked time is derived, so seeding it means
    /// seeding the stretches it sums.
    pub(crate) fn seed_work(conn: &Connection, task_id: i64, banked: i64, open_since: Option<i64>) {
        conn.execute(
            "DELETE FROM task_work_stretches WHERE task_id = ?1",
            [task_id],
        )
        .unwrap();
        if banked > 0 {
            conn.execute(
                "INSERT INTO task_work_stretches (task_id, started_at, ended_at) \
                 VALUES (?1, 0, ?2)",
                [task_id, banked],
            )
            .unwrap();
        }
        if let Some(started_at) = open_since {
            conn.execute(
                "INSERT INTO task_work_stretches (task_id, started_at) VALUES (?1, ?2)",
                [task_id, started_at],
            )
            .unwrap();
        }
    }

    pub(crate) fn task_database() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at) \
             VALUES (1, 'Active', 'active', 1, 1)",
            [],
        )
        .unwrap();
        conn
    }

    pub(crate) fn stretches(conn: &Connection, task_id: i64) -> Vec<(i64, i64, Option<i64>)> {
        conn.prepare(
            "SELECT id, started_at, ended_at FROM task_work_stretches \
             WHERE task_id = ?1 ORDER BY started_at",
        )
        .unwrap()
        .query_map([task_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
    }
}
