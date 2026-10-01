use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{AppHandle, State};

use super::shared::with_phase_tx;
use crate::error::{AppError, Result};
use crate::models::{Task, TaskDependency, TaskStatusEvent, TaskWorkStretch};
use crate::task_graph::TaskGraph;
use crate::task_lifecycle::bank_all_working_now;
use crate::time::now_unix_secs;

pub(crate) fn normalize_task_scope(scope: Option<String>) -> Option<String> {
    scope
        .map(|value| {
            value
                .split('/')
                .map(str::trim)
                .filter(|segment| !segment.is_empty())
                .collect::<Vec<_>>()
                .join(" / ")
        })
        .filter(|value| !value.is_empty())
}

pub(crate) fn validate_task_status(status: &str) -> Result<&str> {
    match status {
        "backlog" | "up_next" | "active" | "completed" | "cancelled" => Ok(status),
        _ => Err(AppError::InvalidInput(format!(
            "invalid task status {status}"
        ))),
    }
}

pub(crate) fn validate_task_score(score: Option<i64>, label: &str) -> Result<Option<i64>> {
    match score {
        None => Ok(None),
        Some(n) if (1..=5).contains(&n) => Ok(Some(n)),
        Some(n) => Err(AppError::InvalidInput(format!(
            "task {label} must be between 1 and 5, got {n}"
        ))),
    }
}

/// Working now, Worked time and the live start are derived from
/// task_work_stretches rather than stored, so a corrected stretch moves the
/// total. Selects using this must alias the tasks table as `t`. Correlated
/// subqueries are illegal in RETURNING, so it cannot be used there.
pub(crate) const TASK_COLUMNS: &str = "t.id, t.title, t.description, t.status, \
    EXISTS(SELECT 1 FROM task_work_stretches s \
           WHERE s.task_id = t.id AND s.ended_at IS NULL), \
    COALESCE((SELECT SUM(s.ended_at - s.started_at) FROM task_work_stretches s \
              WHERE s.task_id = t.id AND s.ended_at IS NOT NULL), 0), \
    (SELECT s.started_at FROM task_work_stretches s \
     WHERE s.task_id = t.id AND s.ended_at IS NULL), \
    t.scope, t.value, t.effort, t.parent_task_id, t.created_at, t.updated_at";

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
#[tauri::command]
pub fn list_tasks(state: State<'_, Mutex<Connection>>) -> Result<Vec<Task>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {TASK_COLUMNS} FROM tasks t ORDER BY t.sort_order ASC, t.id ASC"
    ))?;
    let rows = stmt
        .query_map([], map_task)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn list_task_dependencies(state: State<'_, Mutex<Connection>>) -> Result<Vec<TaskDependency>> {
    let conn = state.lock().unwrap();
    TaskGraph::list_dependencies(&conn)
}

#[tauri::command]
pub fn list_task_status_events(
    state: State<'_, Mutex<Connection>>,
    from: i64,
    to: i64,
) -> Result<Vec<TaskStatusEvent>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, task_id, from_status, to_status, created_at \
         FROM task_status_events \
         WHERE created_at >= ?1 AND created_at < ?2 \
         ORDER BY created_at ASC, id ASC",
    )?;
    let rows = stmt
        .query_map(params![from, to], |row| {
            Ok(TaskStatusEvent {
                id: row.get(0)?,
                task_id: row.get(1)?,
                from_status: row.get(2)?,
                to_status: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_task(
    state: State<'_, Mutex<Connection>>,
    title: String,
    description: String,
    status: String,
    scope: Option<String>,
    parent_task_id: Option<i64>,
) -> Result<Task> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::InvalidInput("task title cannot be empty".into()));
    }
    let description = description.trim().to_string();
    let status = validate_task_status(status.as_str())?;
    let scope = normalize_task_scope(scope);
    let mut conn = state.lock().unwrap();
    let now = now_unix_secs();
    let tx = conn.transaction()?;
    if let Some(parent_id) = parent_task_id {
        let parent_exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM tasks WHERE id = ?1)",
            params![parent_id],
            |row| row.get(0),
        )?;
        if !parent_exists {
            return Err(AppError::NotFound(format!("task {parent_id}")));
        }
    }
    tx.execute(
        "INSERT INTO tasks \
         (title, description, status, scope, parent_task_id, created_at, updated_at, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, \
           COALESCE((SELECT MIN(sort_order) FROM tasks), 0) - 1)",
        params![title, description, status, scope, parent_task_id, now, now],
    )?;
    let id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO task_status_events (task_id, from_status, to_status, created_at) \
         VALUES (?1, NULL, ?2, ?3)",
        params![id, status, now],
    )?;
    tx.commit()?;
    fetch_task(&conn, id)
}

#[tauri::command]
pub fn rename_task(state: State<'_, Mutex<Connection>>, id: i64, title: String) -> Result<Task> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::InvalidInput("task title cannot be empty".into()));
    }
    let conn = state.lock().unwrap();
    let updated = conn.execute(
        "UPDATE tasks SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now_unix_secs(), id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    fetch_task(&conn, id)
}

#[tauri::command]
pub fn set_task_description(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    description: String,
) -> Result<Task> {
    let description = description.trim().to_string();
    let conn = state.lock().unwrap();
    let updated = conn.execute(
        "UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3",
        params![description, now_unix_secs(), id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    fetch_task(&conn, id)
}

#[tauri::command]
pub fn set_task_scope(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    scope: Option<String>,
) -> Result<Task> {
    let scope = normalize_task_scope(scope);
    let conn = state.lock().unwrap();
    let updated = conn.execute(
        "UPDATE tasks SET scope = ?1, updated_at = ?2 WHERE id = ?3",
        params![scope, now_unix_secs(), id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    fetch_task(&conn, id)
}

#[tauri::command]
pub fn set_task_parent(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    parent_task_id: Option<i64>,
) -> Result<Task> {
    let mut conn = state.lock().unwrap();
    TaskGraph::set_parent(&mut conn, id, parent_task_id)?;
    fetch_task(&conn, id)
}

#[tauri::command]
pub fn add_task_dependency(
    state: State<'_, Mutex<Connection>>,
    blocker_task_id: i64,
    blocked_task_id: i64,
) -> Result<()> {
    let mut conn = state.lock().unwrap();
    TaskGraph::add_dependency(&mut conn, blocker_task_id, blocked_task_id)
}

#[tauri::command]
pub fn remove_task_dependency(
    state: State<'_, Mutex<Connection>>,
    blocker_task_id: i64,
    blocked_task_id: i64,
) -> Result<()> {
    let mut conn = state.lock().unwrap();
    TaskGraph::remove_dependency(&mut conn, blocker_task_id, blocked_task_id)
}

#[tauri::command]
pub fn delete_task(app: AppHandle, state: State<'_, Mutex<Connection>>, id: i64) -> Result<()> {
    with_phase_tx(&app, &state, |tx| TaskGraph::delete_task_in(tx, id))
}

#[tauri::command]
pub fn set_task_status(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    status: String,
) -> Result<Task> {
    let status = validate_task_status(status.as_str())?;
    with_phase_tx(&app, &state, |tx| {
        change_task_status(tx, id, status)?;
        fetch_task(tx, id)
    })
}

pub(crate) fn change_task_status(conn: &Connection, id: i64, status: &str) -> Result<()> {
    let now = now_unix_secs();
    let current_status: String = match conn.query_row(
        "SELECT status FROM tasks WHERE id = ?1",
        params![id],
        |row| row.get(0),
    ) {
        Ok(status) => status,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err(AppError::NotFound(format!("task {id}")));
        }
        Err(e) => return Err(e.into()),
    };
    if current_status != status {
        if current_status == "active" && status != "active" {
            bank_task_work(conn, id, now)?;
        }
        conn.execute(
            "UPDATE tasks SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, id],
        )?;
        conn.execute(
            "INSERT INTO task_status_events (task_id, from_status, to_status, created_at) \
             VALUES (?1, ?2, ?3, ?4)",
            params![id, current_status, status, now],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_task_working(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    working: bool,
) -> Result<Task> {
    with_phase_tx(&app, &state, |tx| change_task_working(tx, id, working))
}

pub(crate) fn change_task_working(conn: &Connection, id: i64, working: bool) -> Result<Task> {
    let (status, current): (String, bool) = match conn.query_row(
        "SELECT t.status, \
         EXISTS(SELECT 1 FROM task_work_stretches s \
                WHERE s.task_id = t.id AND s.ended_at IS NULL) \
         FROM tasks t WHERE t.id = ?1",
        params![id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ) {
        Ok(task) => task,
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            return Err(AppError::NotFound(format!("task {id}")));
        }
        Err(e) => return Err(e.into()),
    };
    if working && status != "active" {
        return Err(AppError::InvalidInput(
            "only active tasks can be marked as working now".into(),
        ));
    }
    // The guard is load-bearing, not an optimization: a redundant start would
    // violate the one-open-stretch index, and a redundant stop would close
    // nothing while still bumping updated_at.
    if current != working {
        let now = now_unix_secs();
        if working {
            conn.execute(
                "INSERT INTO task_work_stretches (task_id, started_at) VALUES (?1, ?2)",
                params![id, now],
            )?;
            touch_task(conn, id, now)?;
        } else {
            bank_task_work(conn, id, now)?;
        }
    }
    fetch_task(conn, id)
}

/// Close the open stretch, if any. MAX pins the end to the start rather than
/// letting a backwards clock fail the table's CHECK.
pub(crate) fn bank_task_work(conn: &Connection, id: i64, now: i64) -> Result<()> {
    conn.execute(
        "UPDATE task_work_stretches SET ended_at = MAX(?1, started_at) \
         WHERE task_id = ?2 AND ended_at IS NULL",
        params![now, id],
    )?;
    touch_task(conn, id, now)?;
    Ok(())
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

#[tauri::command]
pub fn stop_all_working_now(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
) -> Result<Vec<Task>> {
    with_phase_tx(&app, &state, |tx| {
        bank_all_working_now(tx, now_unix_secs())
    })
}

/// Far past any real timestamp, standing in for an open stretch's end so the
/// half-open overlap test can treat every stretch the same way.
pub(crate) const OPEN_STRETCH_SENTINEL: i64 = 99_999_999_999;

#[tauri::command]
pub fn list_task_work_stretches(
    state: State<'_, Mutex<Connection>>,
    from: i64,
    to: i64,
) -> Result<Vec<TaskWorkStretch>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, task_id, started_at, ended_at FROM task_work_stretches \
         WHERE started_at < ?2 AND (ended_at IS NULL OR ended_at > ?1) \
         ORDER BY started_at ASC, id ASC",
    )?;
    let rows = stmt
        .query_map(params![from, to], |row| {
            Ok(TaskWorkStretch {
                id: row.get(0)?,
                task_id: row.get(1)?,
                started_at: row.get(2)?,
                ended_at: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn update_task_work_stretch(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    started_at: i64,
    ended_at: Option<i64>,
) -> Result<Task> {
    with_phase_tx(&app, &state, |tx| {
        change_task_work_stretch(tx, id, started_at, ended_at, now_unix_secs())
    })
}

pub(crate) fn change_task_work_stretch(
    conn: &Connection,
    id: i64,
    started_at: i64,
    ended_at: Option<i64>,
    now: i64,
) -> Result<Task> {
    let (task_id, status): (i64, String) = conn
        .query_row(
            "SELECT s.task_id, t.status FROM task_work_stretches s \
             JOIN tasks t ON t.id = s.task_id WHERE s.id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("task work stretch {id}")))?;

    if let Some(ended_at) = ended_at {
        if ended_at < started_at {
            return Err(AppError::InvalidInput(
                "a work stretch cannot end before it starts".into(),
            ));
        }
        if ended_at > now {
            return Err(AppError::InvalidInput(
                "a work stretch cannot end in the future".into(),
            ));
        }
    } else if status != "active" {
        // Leaving it open means the task is Working now, which only Active
        // tasks can be.
        return Err(AppError::InvalidInput(
            "only a stretch on an active task can be left open".into(),
        ));
    }
    if started_at > now {
        return Err(AppError::InvalidInput(
            "a work stretch cannot start in the future".into(),
        ));
    }

    // Half-open intervals, so a stretch may end exactly where the next begins.
    let overlaps: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM task_work_stretches \
         WHERE task_id = ?1 AND id <> ?2 \
           AND started_at < ?3 AND COALESCE(ended_at, ?5) > ?4)",
        params![
            task_id,
            id,
            ended_at.unwrap_or(OPEN_STRETCH_SENTINEL),
            started_at,
            OPEN_STRETCH_SENTINEL
        ],
        |row| row.get(0),
    )?;
    if overlaps {
        return Err(AppError::InvalidInput(
            "work stretches on the same task cannot overlap".into(),
        ));
    }

    conn.execute(
        "UPDATE task_work_stretches SET started_at = ?1, ended_at = ?2 WHERE id = ?3",
        params![started_at, ended_at, id],
    )?;
    touch_task(conn, task_id, now)?;
    fetch_task(conn, task_id)
}

#[tauri::command]
pub fn delete_task_work_stretch(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
) -> Result<Task> {
    with_phase_tx(&app, &state, |tx| {
        let now = now_unix_secs();
        // The owning task has to be read before the row goes away.
        let task_id: i64 = tx
            .query_row(
                "SELECT task_id FROM task_work_stretches WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("task work stretch {id}")))?;
        tx.execute("DELETE FROM task_work_stretches WHERE id = ?1", params![id])?;
        touch_task(tx, task_id, now)?;
        fetch_task(tx, task_id)
    })
}

#[tauri::command]
pub fn set_task_score(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    value: Option<i64>,
    effort: Option<i64>,
) -> Result<Task> {
    let value = validate_task_score(value, "value")?;
    let effort = validate_task_score(effort, "effort")?;
    let conn = state.lock().unwrap();
    let updated = conn.execute(
        "UPDATE tasks SET value = ?1, effort = ?2, updated_at = ?3 WHERE id = ?4",
        params![value, effort, now_unix_secs(), id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    fetch_task(&conn, id)
}

pub(crate) fn update_task_score_field(
    conn: &Connection,
    id: i64,
    field: &str,
    score: Option<i64>,
) -> Result<Task> {
    let score = validate_task_score(score, field)?;
    let sql = match field {
        "value" => "UPDATE tasks SET value = ?1, updated_at = ?2 WHERE id = ?3",
        "effort" => "UPDATE tasks SET effort = ?1, updated_at = ?2 WHERE id = ?3",
        _ => {
            return Err(AppError::InvalidInput(
                "task score field must be value or effort".into(),
            ));
        }
    };
    let updated = conn.execute(sql, params![score, now_unix_secs(), id])?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    fetch_task(conn, id)
}

#[tauri::command]
pub fn set_task_score_field(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    field: String,
    score: Option<i64>,
) -> Result<Task> {
    let conn = state.lock().unwrap();
    update_task_score_field(&conn, id, &field, score)
}

/// Reorders one lane of the board: the listed tasks take over the sort_order
/// slots they already occupy, in the new order, leaving every other task put.
pub(crate) fn set_task_order(conn: &Connection, ids: &[i64]) -> Result<()> {
    let unique: HashSet<_> = ids.iter().copied().collect();
    if unique.len() != ids.len() {
        return Err(AppError::InvalidInput(
            "task order must list each task once".into(),
        ));
    }
    if ids.is_empty() {
        return Ok(());
    }

    let placeholders = std::iter::repeat_n("?", ids.len())
        .collect::<Vec<_>>()
        .join(", ");
    let mut stmt = conn.prepare(&format!(
        "SELECT id, sort_order FROM tasks WHERE id IN ({placeholders})"
    ))?;
    let found = stmt
        .query_map(params_from_iter(ids.iter()), |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<rusqlite::Result<HashMap<_, _>>>()?;
    if let Some(id) = ids.iter().find(|id| !found.contains_key(id)) {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    let mut slots: Vec<_> = found.into_values().collect();
    slots.sort_unstable();

    let cases = std::iter::repeat_n("WHEN ? THEN ?", ids.len())
        .collect::<Vec<_>>()
        .join(" ");
    let mut values = Vec::with_capacity(ids.len() * 3);
    for (id, slot) in ids.iter().zip(slots) {
        values.extend([*id, slot]);
    }
    values.extend_from_slice(ids);
    conn.execute(
        &format!(
            "UPDATE tasks SET sort_order = CASE id {cases} END \
             WHERE id IN ({placeholders})"
        ),
        params_from_iter(values),
    )?;
    Ok(())
}

#[tauri::command]
pub fn reorder_tasks(state: State<'_, Mutex<Connection>>, ids: Vec<i64>) -> Result<()> {
    let conn = state.lock().unwrap();
    set_task_order(&conn, &ids)
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

    #[test]
    fn normalizes_task_scope_segments() {
        assert_eq!(
            normalize_task_scope(Some(" Code // Personal Projects / Nest ".into())),
            Some("Code / Personal Projects / Nest".into())
        );
        assert_eq!(normalize_task_scope(Some(" /// ".into())), None);
        assert_eq!(normalize_task_scope(None), None);
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

    #[test]
    fn updating_one_task_score_preserves_the_other() {
        let conn = task_database();
        conn.execute("UPDATE tasks SET value = 2, effort = 3 WHERE id = 1", [])
            .unwrap();

        let task = update_task_score_field(&conn, 1, "value", Some(5)).unwrap();
        assert_eq!((task.value, task.effort), (Some(5), Some(3)));

        let task = update_task_score_field(&conn, 1, "effort", Some(4)).unwrap();
        assert_eq!((task.value, task.effort), (Some(5), Some(4)));
        assert!(update_task_score_field(&conn, 1, "priority", Some(1)).is_err());
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

    #[test]
    fn each_stint_of_work_records_its_own_stretch() {
        let conn = task_database();

        seed_work(&conn, 1, 0, Some(100));
        bank_task_work(&conn, 1, 160).unwrap();
        assert_eq!(fetch_task(&conn, 1).unwrap().worked_seconds, 60);

        change_task_working(&conn, 1, true).unwrap();
        conn.execute(
            "UPDATE task_work_stretches SET started_at = 200 WHERE ended_at IS NULL",
            [],
        )
        .unwrap();
        bank_task_work(&conn, 1, 230).unwrap();

        let recorded = stretches(&conn, 1);
        assert_eq!(
            recorded,
            vec![(1, 100, Some(160)), (2, 200, Some(230))],
            "both stretches keep their own start and end"
        );
        // Worked time is the sum of the closed stretches, not a running column.
        assert_eq!(fetch_task(&conn, 1).unwrap().worked_seconds, 90);
    }

    #[test]
    fn editing_a_stretch_moves_worked_time() {
        let conn = task_database();
        seed_work(&conn, 1, 0, Some(100));
        bank_task_work(&conn, 1, 160).unwrap();
        let id = stretches(&conn, 1)[0].0;

        let task = change_task_work_stretch(&conn, id, 100, Some(400), 1_000).unwrap();
        assert_eq!(task.worked_seconds, 300);
        assert!(!task.working_now);

        // Reopening is how a forgotten start is corrected, and only Active
        // tasks can be Working now.
        let reopened = change_task_work_stretch(&conn, id, 100, None, 1_000).unwrap();
        assert!(reopened.working_now);
        assert_eq!(reopened.work_started_at, Some(100));
        assert_eq!(reopened.worked_seconds, 0);

        change_task_status(&conn, 1, "completed").unwrap();
        assert!(change_task_work_stretch(&conn, id, 100, None, 1_000).is_err());
    }

    #[test]
    fn a_stretch_cannot_overlap_a_sibling_or_run_into_the_future() {
        let conn = task_database();
        conn.execute(
            "INSERT INTO task_work_stretches (task_id, started_at, ended_at) \
             VALUES (1, 100, 200), (1, 300, 400)",
            [],
        )
        .unwrap();
        let second = stretches(&conn, 1)[1].0;

        assert!(change_task_work_stretch(&conn, second, 150, Some(400), 1_000).is_err());
        // Half-open, so ending exactly where the next begins is not an overlap.
        assert!(change_task_work_stretch(&conn, second, 200, Some(400), 1_000).is_ok());
        assert!(change_task_work_stretch(&conn, second, 200, Some(100), 1_000).is_err());
        assert!(change_task_work_stretch(&conn, second, 200, Some(2_000), 1_000).is_err());
        assert!(change_task_work_stretch(&conn, second, 1_500, Some(1_600), 1_000).is_err());
        assert!(change_task_work_stretch(&conn, 999, 100, Some(200), 1_000).is_err());
    }

    #[test]
    fn deleting_a_task_takes_its_stretches_with_it() {
        let conn = task_database();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        seed_work(&conn, 1, 30, Some(100));

        conn.execute("DELETE FROM tasks WHERE id = 1", []).unwrap();
        assert!(stretches(&conn, 1).is_empty());
    }

    #[test]
    fn accepts_up_next_task_status() {
        assert_eq!(validate_task_status("up_next").unwrap(), "up_next");
    }

    #[test]
    fn working_now_is_limited_to_active_tasks_and_cleared_on_status_change() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at) \
             VALUES (1, 'Active', 'active', 1, 1), (2, 'Backlog', 'backlog', 1, 1)",
            [],
        )
        .unwrap();

        assert!(change_task_working(&conn, 1, true).unwrap().working_now);
        let started_at = change_task_working(&conn, 1, true).unwrap().work_started_at;
        assert_eq!(
            change_task_working(&conn, 1, true).unwrap().work_started_at,
            started_at
        );
        assert!(change_task_working(&conn, 2, true).is_err());

        seed_work(&conn, 1, 20, Some(100));
        bank_task_work(&conn, 1, 150).unwrap();
        let stopped = fetch_task(&conn, 1).unwrap();
        assert_eq!(stopped.worked_seconds, 70);
        assert_eq!(stopped.work_started_at, None);
        assert!(!stopped.working_now);

        // A backwards clock ends the stretch where it started rather than
        // failing the table's CHECK, so it banks nothing.
        assert!(change_task_working(&conn, 1, true).unwrap().working_now);
        seed_work(&conn, 1, 70, Some(200));
        bank_task_work(&conn, 1, 150).unwrap();
        assert_eq!(fetch_task(&conn, 1).unwrap().worked_seconds, 70);

        let resumed = change_task_working(&conn, 1, true).unwrap();
        assert!(resumed.working_now);
        assert_eq!(resumed.worked_seconds, 70);
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at) \
             VALUES (3, 'Also active', 'active', 1, 1)",
            [],
        )
        .unwrap();
        assert!(change_task_working(&conn, 3, true).unwrap().working_now);
        assert!(fetch_task(&conn, 1).unwrap().working_now);

        assert!(validate_task_status("paused").is_err());
        change_task_status(&conn, 1, "up_next").unwrap();
        let moved = fetch_task(&conn, 1).unwrap();
        assert!(!moved.working_now);
        assert_eq!(moved.work_started_at, None);
    }

    #[test]
    fn reordering_one_lane_leaves_the_other_lanes_put() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute_batch(
            "INSERT INTO tasks (id, title, status, created_at, updated_at, sort_order) VALUES \
             (1, 'A', 'active', 1, 1, 0), \
             (2, 'B', 'up_next', 1, 1, 1), \
             (3, 'C', 'active', 1, 1, 2), \
             (4, 'D', 'active', 1, 1, 3);",
        )
        .unwrap();

        // Active lane holds slots 0, 2, 3 — reversing it reuses those slots.
        set_task_order(&conn, &[4, 3, 1]).unwrap();
        let order: Vec<i64> = conn
            .prepare("SELECT id FROM tasks ORDER BY sort_order ASC, id ASC")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(order, vec![4, 2, 3, 1]);

        assert!(set_task_order(&conn, &[1, 1]).is_err());
        assert!(set_task_order(&conn, &[99]).is_err());
    }
}
