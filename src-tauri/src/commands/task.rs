use crate::models::{TaskUpdate, TaskUpdateCursor, TaskUpdatePage, TaskWorkInterval};
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use super::shared::with_phase_tx;
use crate::error::{AppError, Result};
use crate::models::{Task, TaskStatusEvent, TaskWorkStretch};
use crate::task::{fetch_task, map_task, touch_task, TASK_COLUMNS};
use crate::task_graph::TaskGraph;
use crate::task_lifecycle::bank_all_working_now;
use crate::time::now_unix_secs;

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

/// Each window renders its own copy of the Tasks, so every command that
/// changes one announces it here. Announcing from the write, as the Tag
/// commands do, keeps a caller from forgetting and leaving the other window on
/// a stale copy.
fn announce_task_change(app: &AppHandle) {
    let _ = app.emit("data-changed", ());
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
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    title: String,
    description: String,
    status: String,
    parent_task_id: Option<i64>,
) -> Result<Task> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::InvalidInput("task title cannot be empty".into()));
    }
    let description = description.trim().to_string();
    let status = validate_task_status(status.as_str())?;
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
         (title, description, status, parent_task_id, created_at, updated_at, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, \
           COALESCE((SELECT MIN(sort_order) FROM tasks), 0) - 1)",
        params![title, description, status, parent_task_id, now, now],
    )?;
    let id = tx.last_insert_rowid();
    tx.execute(
        "INSERT INTO task_status_events (task_id, from_status, to_status, created_at) \
         VALUES (?1, NULL, ?2, ?3)",
        params![id, status, now],
    )?;
    tx.commit()?;
    announce_task_change(&app);
    fetch_task(&conn, id)
}

#[tauri::command]
pub fn create_follow_up_task(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
) -> Result<Task> {
    let mut conn = state.lock().unwrap();
    let tx = conn.transaction()?;
    let follow_up_id = insert_follow_up_task(&tx, id, now_unix_secs())?;
    tx.commit()?;
    announce_task_change(&app);
    fetch_task(&conn, follow_up_id)
}

/// A follow-up restates the work of a closed Task as a new Backlog Task. It
/// copies what describes the work and none of the relationships, Worked time,
/// or history, which stay with the original.
///
/// Only the frontend knows the local day, so it decides when the original is
/// locked; this seam checks the part that needs no clock.
pub(crate) fn insert_follow_up_task(conn: &Connection, original_id: i64, now: i64) -> Result<i64> {
    let original_status: String = conn
        .query_row(
            "SELECT status FROM tasks WHERE id = ?1",
            params![original_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("task {original_id}")))?;
    if !matches!(original_status.as_str(), "completed" | "cancelled") {
        return Err(AppError::InvalidInput(
            "only a closed task can have a follow-up".into(),
        ));
    }
    conn.execute(
        "INSERT INTO tasks \
         (title, description, status, value, effort, follows_task_id, \
          created_at, updated_at, sort_order) \
         SELECT title, description, 'backlog', value, effort, id, ?2, ?2, \
           COALESCE((SELECT MIN(sort_order) FROM tasks), 0) - 1 \
         FROM tasks WHERE id = ?1",
        params![original_id, now],
    )?;
    let follow_up_id = conn.last_insert_rowid();
    conn.execute(
        "INSERT INTO task_status_events (task_id, from_status, to_status, created_at) \
         VALUES (?1, NULL, 'backlog', ?2)",
        params![follow_up_id, now],
    )?;
    Ok(follow_up_id)
}

#[tauri::command]
pub fn rename_task(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    title: String,
) -> Result<Task> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::InvalidInput("task title cannot be empty".into()));
    }
    let conn = state.lock().unwrap();
    if fetch_task(&conn, id)?.title == title {
        return fetch_task(&conn, id);
    }
    let updated = conn.execute(
        "UPDATE tasks SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now_unix_secs(), id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    announce_task_change(&app);
    fetch_task(&conn, id)
}

#[tauri::command]
pub fn set_task_description(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    description: String,
) -> Result<Task> {
    let description = description.trim().to_string();
    let conn = state.lock().unwrap();
    if fetch_task(&conn, id)?.description == description {
        return fetch_task(&conn, id);
    }
    let updated = conn.execute(
        "UPDATE tasks SET description = ?1, updated_at = ?2 WHERE id = ?3",
        params![description, now_unix_secs(), id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    announce_task_change(&app);
    fetch_task(&conn, id)
}

#[tauri::command]
pub fn set_task_parent(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    parent_task_id: Option<i64>,
) -> Result<Task> {
    let mut conn = state.lock().unwrap();
    TaskGraph::set_parent(&mut conn, id, parent_task_id)?;
    announce_task_change(&app);
    fetch_task(&conn, id)
}

#[tauri::command]
pub fn delete_task(app: AppHandle, state: State<'_, Mutex<Connection>>, id: i64) -> Result<()> {
    with_phase_tx(&app, &state, |tx| TaskGraph::delete_task_in(tx, id))?;
    announce_task_change(&app);
    Ok(())
}

#[tauri::command]
pub fn set_task_status(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    status: String,
    day_started_at: i64,
) -> Result<Task> {
    let status = validate_task_status(status.as_str())?;
    let task = with_phase_tx(&app, &state, |tx| {
        require_status_unlocked(tx, id, day_started_at, now_unix_secs())?;
        change_task_status(tx, id, status)?;
        fetch_task(tx, id)
    })?;
    announce_task_change(&app);
    Ok(task)
}

/// No local day is longer than a daylight-saving 25 hours.
const LONGEST_LOCAL_DAY_SECONDS: i64 = 25 * 60 * 60;

/// A closed Task's status changes only on the local day it closed. The caller
/// decided that from its own copy of the Task, which another window may have
/// left a day stale, so the rule is held here against the stored row.
///
/// Only the frontend knows the local day, so it sends where today began. A
/// start outside the last day is refused: a zero would otherwise switch the
/// lock off.
pub(crate) fn require_status_unlocked(
    conn: &Connection,
    id: i64,
    day_started_at: i64,
    now: i64,
) -> Result<()> {
    if day_started_at > now || now - day_started_at > LONGEST_LOCAL_DAY_SECONDS {
        return Err(AppError::InvalidInput(
            "day start must fall within the last day".into(),
        ));
    }
    let task = match fetch_task(conn, id) {
        Err(AppError::Sqlite(rusqlite::Error::QueryReturnedNoRows)) => {
            return Err(AppError::NotFound(format!("task {id}")));
        }
        task => task?,
    };
    let closed = matches!(task.status.as_str(), "completed" | "cancelled");
    // A closure with no recorded time predates status history, so it cannot
    // be today's.
    let closed_before_today = task.closed_at.is_none_or(|at| at < day_started_at);
    if closed && closed_before_today {
        return Err(AppError::InvalidInput(
            "this task closed on an earlier day, so its status is fixed".into(),
        ));
    }
    Ok(())
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
    let task = with_phase_tx(&app, &state, |tx| change_task_working(tx, id, working))?;
    announce_task_change(&app);
    Ok(task)
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

#[tauri::command]
pub fn stop_all_working_now(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
) -> Result<Vec<Task>> {
    let stopped = with_phase_tx(&app, &state, |tx| bank_all_working_now(tx, now_unix_secs()))?;
    announce_task_change(&app);
    Ok(stopped)
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
    let task = with_phase_tx(&app, &state, |tx| {
        change_task_work_stretch(tx, id, started_at, ended_at, now_unix_secs())
    })?;
    announce_task_change(&app);
    Ok(task)
}

pub(crate) fn change_task_work_stretch(
    conn: &Connection,
    id: i64,
    started_at: i64,
    ended_at: Option<i64>,
    now: i64,
) -> Result<Task> {
    let (task_id, status, previous): (i64, String, TaskWorkInterval) = conn
        .query_row(
            "SELECT s.task_id, t.status, s.started_at, s.ended_at FROM task_work_stretches s \
             JOIN tasks t ON t.id = s.task_id WHERE s.id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    TaskWorkInterval {
                        started_at: row.get(2)?,
                        ended_at: row.get(3)?,
                    },
                ))
            },
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

    let corrected = TaskWorkInterval {
        started_at,
        ended_at,
    };
    if corrected == previous {
        return fetch_task(conn, task_id);
    }
    record_work_history(
        conn,
        task_id,
        "work_corrected",
        previous,
        Some(corrected),
        now,
    )?;
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
    let task = with_phase_tx(&app, &state, |tx| {
        remove_task_work_stretch(tx, id, now_unix_secs())
    })?;
    announce_task_change(&app);
    Ok(task)
}

pub(crate) fn remove_task_work_stretch(conn: &Connection, id: i64, now: i64) -> Result<Task> {
    // The owning task has to be read before the row goes away.
    let (task_id, removed): (i64, TaskWorkInterval) = conn
        .query_row(
            "SELECT task_id, started_at, ended_at FROM task_work_stretches WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get(0)?,
                    TaskWorkInterval {
                        started_at: row.get(1)?,
                        ended_at: row.get(2)?,
                    },
                ))
            },
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("task work stretch {id}")))?;
    conn.execute("DELETE FROM task_work_stretches WHERE id = ?1", params![id])?;
    record_work_history(conn, task_id, "work_removed", removed, None, now)?;
    touch_task(conn, task_id, now)?;
    fetch_task(conn, task_id)
}

// History stores a work interval as "<started> / <ended>", with "open" for a
// stretch still running. Only these two functions read or write that text.
fn stored_work_interval(interval: TaskWorkInterval) -> String {
    let ended = interval
        .ended_at
        .map_or_else(|| "open".to_owned(), |ended_at| ended_at.to_string());
    format!("{} / {ended}", interval.started_at)
}

fn parse_stored_work_interval(text: &str) -> Option<TaskWorkInterval> {
    let (started, ended) = text.split_once(" / ")?;
    Some(TaskWorkInterval {
        started_at: started.parse().ok()?,
        ended_at: match ended {
            "open" => None,
            ended => Some(ended.parse().ok()?),
        },
    })
}

fn record_work_history(
    conn: &Connection,
    task_id: i64,
    kind: &str,
    before: TaskWorkInterval,
    after: Option<TaskWorkInterval>,
    now: i64,
) -> Result<()> {
    conn.execute(
        "INSERT INTO task_edit_history(task_id,kind,before_value,after_value,created_at) \
         VALUES(?1,?2,?3,?4,?5)",
        params![
            task_id,
            kind,
            stored_work_interval(before),
            after.map(stored_work_interval),
            now
        ],
    )?;
    Ok(())
}

#[tauri::command]
pub fn set_task_score(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    value: Option<i64>,
    effort: Option<i64>,
) -> Result<Task> {
    let value = validate_task_score(value, "value")?;
    let effort = validate_task_score(effort, "effort")?;
    let conn = state.lock().unwrap();
    let task = fetch_task(&conn, id)?;
    if task.value == value && task.effort == effort {
        return Ok(task);
    }
    let updated = conn.execute(
        "UPDATE tasks SET value = ?1, effort = ?2, updated_at = ?3 WHERE id = ?4",
        params![value, effort, now_unix_secs(), id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    announce_task_change(&app);
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
    let task = fetch_task(conn, id)?;
    if (field == "value" && task.value == score) || (field == "effort" && task.effort == score) {
        return Ok(task);
    }
    let updated = conn.execute(sql, params![score, now_unix_secs(), id])?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("task {id}")));
    }
    fetch_task(conn, id)
}

#[tauri::command]
pub fn set_task_score_field(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    field: String,
    score: Option<i64>,
) -> Result<Task> {
    let conn = state.lock().unwrap();
    let task = update_task_score_field(&conn, id, &field, score)?;
    announce_task_change(&app);
    Ok(task)
}

/// Reorders one status group: the listed tasks take over the sort_order
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
pub fn reorder_tasks(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    ids: Vec<i64>,
) -> Result<()> {
    let conn = state.lock().unwrap();
    set_task_order(&conn, &ids)?;
    announce_task_change(&app);
    Ok(())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::migrations::migrations;
    use crate::task::tests::{seed_work, stretches, task_database};

    #[test]
    fn closed_at_is_the_latest_move_into_the_closed_status_held_now() {
        let conn = task_database();
        assert_eq!(fetch_task(&conn, 1).unwrap().closed_at, None);

        let record = |from: &str, to: &str, at: i64| {
            conn.execute("UPDATE tasks SET status = ?1 WHERE id = 1", params![to])
                .unwrap();
            conn.execute(
                "INSERT INTO task_status_events (task_id, from_status, to_status, created_at) \
                 VALUES (1, ?1, ?2, ?3)",
                params![from, to, at],
            )
            .unwrap();
        };

        record("active", "completed", 100);
        assert_eq!(fetch_task(&conn, 1).unwrap().closed_at, Some(100));

        // An earlier closure that was reopened says nothing about a Task that
        // is open now.
        record("completed", "active", 200);
        assert_eq!(fetch_task(&conn, 1).unwrap().closed_at, None);

        // Closed as Cancelled now, so the earlier completion is not its closure.
        record("active", "cancelled", 300);
        assert_eq!(fetch_task(&conn, 1).unwrap().closed_at, Some(300));
    }

    #[test]
    fn the_stored_task_holds_the_lock_whatever_copy_the_caller_had() {
        let conn = task_database();
        let day = 86_400;
        let (today, now) = (10 * day, 10 * day + 3_600);
        let close_at = |status: &str, at: i64| {
            conn.execute("UPDATE tasks SET status = ?1 WHERE id = 1", params![status])
                .unwrap();
            conn.execute(
                "INSERT INTO task_status_events (task_id, from_status, to_status, created_at) \
                 VALUES (1, 'active', ?1, ?2)",
                params![status, at],
            )
            .unwrap();
        };

        // Open, then closed earlier today: both may still change.
        assert!(require_status_unlocked(&conn, 1, today, now).is_ok());
        close_at("completed", today + 60);
        assert!(require_status_unlocked(&conn, 1, today, now).is_ok());

        // The same closure is locked once the next day has begun.
        assert!(require_status_unlocked(&conn, 1, today + day, now + day).is_err());

        // A closed Task with no recorded closure cannot have closed today.
        conn.execute("DELETE FROM task_status_events WHERE task_id = 1", [])
            .unwrap();
        assert!(require_status_unlocked(&conn, 1, today, now).is_err());

        // A day start that could not be today's would switch the lock off.
        close_at("cancelled", today - 5 * day);
        assert!(require_status_unlocked(&conn, 1, 0, now).is_err());
        assert!(require_status_unlocked(&conn, 1, now + 1, now).is_err());

        assert!(matches!(
            require_status_unlocked(&conn, 99, today, now),
            Err(AppError::NotFound(_))
        ));
    }

    #[test]
    fn a_follow_up_copies_the_work_and_none_of_its_ties() {
        let conn = task_database();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at) \
             VALUES (2, 'Parent', 'active', 1, 1), (3, 'Dependent', 'backlog', 1, 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "UPDATE tasks SET description = 'Notes', value = 4, \
             effort = 2, parent_task_id = 2 WHERE id = 1",
            [],
        )
        .unwrap();
        seed_work(&conn, 1, 600, None);

        // An open Task can still change status, so it has nothing to follow up.
        assert!(insert_follow_up_task(&conn, 1, 500).is_err());
        assert!(insert_follow_up_task(&conn, 99, 500).is_err());

        change_task_status(&conn, 1, "cancelled").unwrap();
        let follow_up_id = insert_follow_up_task(&conn, 1, 500).unwrap();
        let follow_up = fetch_task(&conn, follow_up_id).unwrap();

        assert_eq!(follow_up.title, "Active");
        assert_eq!(follow_up.description, "Notes");
        assert_eq!(follow_up.status, "backlog");
        assert_eq!((follow_up.value, follow_up.effort), (Some(4), Some(2)));
        assert_eq!(follow_up.follows_task_id, Some(1));
        assert_eq!(follow_up.parent_task_id, None);
        assert_eq!(follow_up.worked_seconds, 0);
        assert_eq!(follow_up.created_at, 500);

        let creation_events: Vec<(Option<String>, String)> = conn
            .prepare("SELECT from_status, to_status FROM task_status_events WHERE task_id = ?1")
            .unwrap()
            .query_map(params![follow_up_id], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(creation_events, vec![(None, "backlog".to_string())]);

        // Deleting the original leaves the follow-up standing on its own.
        conn.execute("DELETE FROM tasks WHERE id = 1", []).unwrap();
        assert_eq!(
            fetch_task(&conn, follow_up_id).unwrap().follows_task_id,
            None
        );
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
    fn reordering_one_status_group_leaves_the_others_put() {
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

        // Active holds slots 0, 2, 3 — reversing it reuses those slots.
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

pub(crate) fn read_task_updates(
    conn: &Connection,
    id: i64,
    cursor: Option<TaskUpdateCursor>,
) -> Result<TaskUpdatePage> {
    fetch_task(conn, id)?;
    let cursor = cursor.unwrap_or(TaskUpdateCursor {
        time: i64::MAX,
        source: i64::MAX,
        id: i64::MAX,
    });
    let mut stmt = conn.prepare(
        "WITH updates(time, source, id, kind, before_value, after_value, related_task_id, related_title) AS (
         SELECT created_at,0,id,kind,before_value,after_value,related_task_id,related_title FROM task_edit_history WHERE task_id=?1
         UNION ALL SELECT created_at,1,id,CASE WHEN from_status IS NULL THEN 'created' ELSE 'status' END,from_status,to_status,NULL,NULL FROM task_status_events WHERE task_id=?1
         UNION ALL SELECT started_at,2,id,'work_started',NULL,NULL,NULL,NULL FROM task_work_stretches WHERE task_id=?1
         UNION ALL SELECT ended_at,3,id,'work_stopped',NULL,NULL,NULL,NULL FROM task_work_stretches WHERE task_id=?1 AND ended_at IS NOT NULL
         ) SELECT time,source,id,kind,before_value,after_value,related_task_id,related_title FROM updates
         WHERE (time,source,id)<(?2,?3,?4) ORDER BY time DESC,source DESC,id DESC LIMIT 51"
    )?;
    let mut updates = stmt
        .query_map(params![id, cursor.time, cursor.source, cursor.id], |row| {
            let kind: String = row.get(3)?;
            let before_value: Option<String> = row.get(4)?;
            let after_value: Option<String> = row.get(5)?;
            let records_work = kind == "work_corrected" || kind == "work_removed";
            let work_interval = |text: &Option<String>| {
                text.as_deref()
                    .filter(|_| records_work)
                    .and_then(parse_stored_work_interval)
            };
            Ok(TaskUpdate {
                cursor: TaskUpdateCursor {
                    time: row.get(0)?,
                    source: row.get(1)?,
                    id: row.get(2)?,
                },
                work_before: work_interval(&before_value),
                work_after: work_interval(&after_value),
                before_value: before_value.filter(|_| !records_work),
                after_value: after_value.filter(|_| !records_work),
                kind,
                related_task_id: row.get(6)?,
                related_title: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let has_more = updates.len() > 50;
    updates.truncate(50);
    let recording_started_at = conn.query_row(
        "SELECT started_at FROM task_history_metadata WHERE id=1",
        [],
        |row| row.get(0),
    )?;
    Ok(TaskUpdatePage {
        updates,
        has_more,
        recording_started_at,
    })
}

#[tauri::command]
pub fn list_task_updates(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    cursor: Option<TaskUpdateCursor>,
) -> Result<TaskUpdatePage> {
    read_task_updates(&state.lock().unwrap(), id, cursor)
}

#[cfg(test)]
mod update_history_tests {
    use super::*;
    use crate::migrations::migrations;

    fn database() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        for id in 1..=3 {
            conn.execute("INSERT INTO tasks(id,title,status,created_at,updated_at) VALUES(?1,?2,'active',1,1)",params![id,format!("Task {id}")]).unwrap();
        }
        conn
    }

    #[test]
    fn a_task_rebuild_preserves_the_copied_edit_log_and_its_triggers() {
        let mut conn = database();
        conn.execute(
            "UPDATE tasks SET title='Renamed',updated_at=10 WHERE id=1",
            [],
        )
        .unwrap();
        let schema: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        let triggers: Vec<(String, String)> = {
            let mut statement=conn.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' AND name LIKE 'task_history_%'").unwrap();
            statement
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .unwrap()
                .collect::<rusqlite::Result<_>>()
                .unwrap()
        };
        let tx = conn.transaction().unwrap();
        tx.execute_batch("CREATE TEMP TABLE saved_edits AS SELECT * FROM task_edit_history;")
            .unwrap();
        for (name, _) in &triggers {
            tx.execute_batch(&format!("DROP TRIGGER {name}")).unwrap();
        }
        tx.execute_batch(&schema.replacen("CREATE TABLE tasks", "CREATE TABLE tasks_rebuilt", 1))
            .unwrap();
        tx.execute_batch("INSERT INTO tasks_rebuilt SELECT * FROM tasks; DROP TABLE tasks; ALTER TABLE tasks_rebuilt RENAME TO tasks; INSERT INTO task_edit_history SELECT * FROM saved_edits; DROP TABLE saved_edits;").unwrap();
        for (_, sql) in &triggers {
            tx.execute_batch(sql).unwrap();
        }
        tx.commit().unwrap();
        assert_eq!(read_task_updates(&conn, 1, None).unwrap().updates.len(), 1);
        conn.execute(
            "UPDATE tasks SET title='Renamed again',updated_at=20 WHERE id=1",
            [],
        )
        .unwrap();
        assert_eq!(read_task_updates(&conn, 1, None).unwrap().updates.len(), 2);
    }

    #[test]
    fn field_edits_preserve_values_and_skip_noops() {
        let conn = database();
        conn.execute("UPDATE tasks SET title='Renamed',description='Private',value=3,effort=2,updated_at=10 WHERE id=1",[]).unwrap();
        conn.execute(
            "UPDATE tasks SET title='Renamed',description='Private' WHERE id=1",
            [],
        )
        .unwrap();
        let page = read_task_updates(&conn, 1, None).unwrap();
        assert_eq!(page.updates.len(), 4);
        let title = page.updates.iter().find(|u| u.kind == "title").unwrap();
        assert_eq!(title.before_value.as_deref(), Some("Task 1"));
        assert_eq!(title.after_value.as_deref(), Some("Renamed"));
        let description = page
            .updates
            .iter()
            .find(|u| u.kind == "description")
            .unwrap();
        assert!(description.before_value.is_none() && description.after_value.is_none());
    }

    #[test]
    fn deletion_preserves_relationship_snapshots_on_survivors() {
        let mut conn = database();
        TaskGraph::set_parent(&mut conn, 2, Some(1)).unwrap();
        TaskGraph::set_parent(&mut conn, 3, Some(2)).unwrap();
        TaskGraph::delete_task(&mut conn, 2).unwrap();
        for (id, kind) in [(1, "child_removed"), (3, "parent_removed")] {
            let page = read_task_updates(&conn, id, None).unwrap();
            let entry = page.updates.iter().find(|u| u.kind == kind).unwrap();
            assert_eq!(entry.related_title.as_deref(), Some("Task 2"));
        }
        let own: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_edit_history WHERE task_id=2",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(own, 0);
        let parent: Option<i64> = conn
            .query_row("SELECT parent_task_id FROM tasks WHERE id=3", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(parent, None);
    }

    #[test]
    fn reparenting_and_follow_ups_record_both_sides() {
        let mut conn = database();
        TaskGraph::set_parent(&mut conn, 2, Some(1)).unwrap();
        TaskGraph::set_parent(&mut conn, 2, Some(3)).unwrap();
        assert!(read_task_updates(&conn, 1, None)
            .unwrap()
            .updates
            .iter()
            .any(|u| u.kind == "child_removed"));
        assert!(read_task_updates(&conn, 3, None)
            .unwrap()
            .updates
            .iter()
            .any(|u| u.kind == "child_added"));
        let child = read_task_updates(&conn, 2, None).unwrap();
        assert_eq!(child.updates.len(), 3);
        TaskGraph::set_parent(&mut conn, 2, Some(3)).unwrap();
        assert_eq!(read_task_updates(&conn, 2, None).unwrap().updates.len(), 3);
        conn.execute("UPDATE tasks SET status='completed' WHERE id=1", [])
            .unwrap();
        let follow_up = insert_follow_up_task(&conn, 1, 500).unwrap();
        assert!(read_task_updates(&conn, 1, None)
            .unwrap()
            .updates
            .iter()
            .any(|u| u.kind == "follow_up"));
        assert!(read_task_updates(&conn, follow_up, None)
            .unwrap()
            .updates
            .iter()
            .any(|u| u.kind == "follows"));
    }

    #[test]
    fn deleting_either_follow_up_side_records_removal_on_the_survivor() {
        for delete_original in [true, false] {
            let mut conn = database();
            conn.execute("UPDATE tasks SET status='completed' WHERE id=1", [])
                .unwrap();
            let follow_up = insert_follow_up_task(&conn, 1, 500).unwrap();
            let (deleted, survivor, kind) = if delete_original {
                (1, follow_up, "follows_removed")
            } else {
                (follow_up, 1, "follow_up_removed")
            };
            TaskGraph::delete_task(&mut conn, deleted).unwrap();
            let page = read_task_updates(&conn, survivor, None).unwrap();
            let removals: Vec<_> = page.updates.iter().filter(|u| u.kind == kind).collect();
            assert_eq!(removals.len(), 1);
            assert_eq!(removals[0].related_task_id, Some(deleted));
            assert_eq!(removals[0].related_title.as_deref(), Some("Task 1"));
            let follows: Option<i64> = conn
                .query_row(
                    "SELECT follows_task_id FROM tasks WHERE id=?1",
                    params![survivor],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(follows, None);
        }
    }

    #[test]
    fn pagination_keeps_same_second_entries_from_all_sources() {
        let conn = database();
        for _ in 0..60 {
            conn.execute(
                "INSERT INTO task_edit_history(task_id,kind,created_at) VALUES(1,'description',10)",
                [],
            )
            .unwrap();
        }
        conn.execute("INSERT INTO task_status_events(task_id,from_status,to_status,created_at) VALUES(1,NULL,'active',10)",[]).unwrap();
        conn.execute(
            "INSERT INTO task_work_stretches(task_id,started_at,ended_at) VALUES(1,10,10)",
            [],
        )
        .unwrap();
        let first = read_task_updates(&conn, 1, None).unwrap();
        assert!(first.has_more);
        let cursor = first.updates.into_iter().last().unwrap().cursor;
        let second = read_task_updates(&conn, 1, Some(cursor)).unwrap();
        assert_eq!(second.updates.len(), 13);
        assert!(!second.has_more);
    }

    #[test]
    fn every_history_source_moves_the_revision_within_one_second() {
        let conn = database();
        let revision = || fetch_task(&conn, 1).unwrap().history_revision;
        let mut last = revision();
        let mut assert_moved = |sql: &str| {
            conn.execute(sql, []).unwrap();
            let next = revision();
            assert!(next > last, "{sql}");
            last = next;
        };
        // Same second throughout, so updated_at alone could not tell these apart.
        assert_moved("INSERT INTO task_status_events(task_id,from_status,to_status,created_at) VALUES(1,'active','active',1)");
        assert_moved("INSERT INTO task_work_stretches(id,task_id,started_at) VALUES(9,1,1)");
        assert_moved("UPDATE task_work_stretches SET ended_at=1 WHERE id=9");
        remove_task_work_stretch(&conn, 9, 1).unwrap();
        assert!(revision() > last);
    }

    #[test]
    fn corrections_keep_old_times_and_transaction_rollbacks_remove_edits() {
        let mut conn = database();
        conn.execute(
            "INSERT INTO task_work_stretches(task_id,started_at) VALUES(1,100)",
            [],
        )
        .unwrap();
        let id = conn.last_insert_rowid();
        change_task_work_stretch(&conn, id, 100, Some(200), 300).unwrap();
        change_task_work_stretch(&conn, id, 100, Some(200), 400).unwrap();
        let page = read_task_updates(&conn, 1, None).unwrap();
        let corrections: Vec<_> = page
            .updates
            .iter()
            .filter(|u| u.kind == "work_corrected")
            .collect();
        assert_eq!(corrections.len(), 1);
        assert_eq!(corrections[0].cursor.time, 300);
        assert_eq!(
            corrections[0].work_before,
            Some(TaskWorkInterval {
                started_at: 100,
                ended_at: None
            })
        );
        assert!(corrections[0].before_value.is_none());
        remove_task_work_stretch(&conn, id, 500).unwrap();
        let removed = read_task_updates(&conn, 1, None).unwrap();
        let removed = removed
            .updates
            .iter()
            .find(|u| u.kind == "work_removed")
            .unwrap();
        assert_eq!(
            removed.work_before,
            Some(TaskWorkInterval {
                started_at: 100,
                ended_at: Some(200)
            })
        );
        assert!(removed.work_after.is_none());
        let tx = conn.transaction().unwrap();
        tx.execute("UPDATE tasks SET title='Rolled back' WHERE id=1", [])
            .unwrap();
        tx.rollback().unwrap();
        assert!(!read_task_updates(&conn, 1, None)
            .unwrap()
            .updates
            .iter()
            .any(|u| u.kind == "title"));
    }
}
