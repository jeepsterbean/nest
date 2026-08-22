use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::error::{AppError, Result};
use crate::models::{
    BrainDump, Metric, MetricCheckIn, MetricCheckInWithRatings, MetricRating,
    MetricRatingInput, Phase, PhaseCheckIn, Pulse, Task, TaskDependency, TaskStatusEvent,
    TaskWorkStretch, TimerState,
};
use crate::phase;
use crate::task_graph::TaskGraph;
use crate::time::now_unix_secs;
use crate::Timer;

// One greeting line at the 600px dashboard minimum (~420px at 31px serif).
const MAX_REMINDER_CHARS: usize = 27;
const REMINDERS: &[&str] = &[
    "Put on some good music",
    "Do a brain dump",
    "Choose one small thing",
    "Write down the next action",
    "Clear the space around you",
    "Close what you're not using",
    "Start for just two minutes",
];

const _: () = {
    let mut i = 0;
    while i < REMINDERS.len() {
        assert!(REMINDERS[i].len() <= MAX_REMINDER_CHARS);
        i += 1;
    }
};

#[tauri::command]
pub fn list_reminders() -> Vec<&'static str> {
    REMINDERS.to_vec()
}

fn normalize_task_scope(scope: Option<String>) -> Option<String> {
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

fn normalize_optional_title(title: Option<String>) -> Option<String> {
    title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn validate_task_status(status: &str) -> Result<&str> {
    match status {
        "backlog" | "up_next" | "active" | "completed" | "cancelled" => Ok(status),
        _ => Err(AppError::InvalidInput(format!(
            "invalid task status {status}"
        ))),
    }
}

fn validate_task_score(score: Option<i64>, label: &str) -> Result<Option<i64>> {
    match score {
        None => Ok(None),
        Some(n) if (1..=5).contains(&n) => Ok(Some(n)),
        Some(n) => Err(AppError::InvalidInput(format!(
            "task {label} must be between 1 and 5, got {n}"
        ))),
    }
}

fn validate_timer_interval(minutes: i64) -> Result<i64> {
    if !crate::timer::is_valid_interval(minutes) {
        return Err(AppError::InvalidInput(
            "timer interval must be 5, 10, 15, 20, 25, or 30 minutes".into(),
        ));
    }
    Ok(minutes)
}

pub(crate) fn resolve_due_timer(
    conn: &Connection,
    timer: &mut Timer,
    dismissed: bool,
    minutes: Option<i64>,
    now: i64,
) -> Result<bool> {
    let minutes = if dismissed {
        crate::timer::MIN_MINUTES
    } else {
        minutes
            .map(validate_timer_interval)
            .transpose()?
            .unwrap_or(timer.interval_minutes)
    };
    if !timer.waiting_for_response {
        return Ok(false);
    }

    let next_due_at = now + minutes * 60;
    conn.execute(
        "UPDATE timer_schedule SET interval_minutes = ?1, next_due_at = ?2 WHERE id = 1",
        params![minutes, next_due_at],
    )?;
    timer.interval_minutes = minutes;
    timer.next_due_at = next_due_at;
    timer.waiting_for_response = false;
    Ok(true)
}

/// Working now, Worked time and the live start are derived from
/// task_work_stretches rather than stored, so a corrected stretch moves the
/// total. Selects using this must alias the tasks table as `t`. Correlated
/// subqueries are illegal in RETURNING, so it cannot be used there.
const TASK_COLUMNS: &str = "t.id, t.title, t.description, t.status, \
    EXISTS(SELECT 1 FROM task_work_stretches s \
           WHERE s.task_id = t.id AND s.ended_at IS NULL), \
    COALESCE((SELECT SUM(s.ended_at - s.started_at) FROM task_work_stretches s \
              WHERE s.task_id = t.id AND s.ended_at IS NOT NULL), 0), \
    (SELECT s.started_at FROM task_work_stretches s \
     WHERE s.task_id = t.id AND s.ended_at IS NULL), \
    t.scope, t.value, t.effort, t.parent_task_id, t.created_at, t.updated_at";
const METRIC_COLUMNS: &str = "id, name, icon, created_at, color";
const PHASE_CHECK_IN_COLUMNS: &str = "id, created_at, phase_id, phase_label";
const BRAIN_DUMP_COLUMNS: &str = "id, created_at, title, text";

fn map_task(row: &Row<'_>) -> rusqlite::Result<Task> {
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

fn map_metric(row: &Row<'_>) -> rusqlite::Result<Metric> {
    Ok(Metric {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        created_at: row.get(3)?,
        color: row.get(4)?,
    })
}

fn map_phase_check_in(row: &Row<'_>) -> rusqlite::Result<PhaseCheckIn> {
    Ok(PhaseCheckIn {
        id: row.get(0)?,
        created_at: row.get(1)?,
        phase_id: row.get(2)?,
        phase_label: row.get(3)?,
    })
}

fn map_brain_dump(row: &Row<'_>) -> rusqlite::Result<BrainDump> {
    Ok(BrainDump {
        id: row.get(0)?,
        created_at: row.get(1)?,
        title: row.get(2)?,
        text: row.get(3)?,
    })
}

/// Task mutations that can change Working now must sync Phase in the same
/// transaction, then emit. Lock/sleep Offline is not this path: it also
/// writes PhaseSignals.
fn with_phase_tx<T>(
    app: &AppHandle,
    state: &State<'_, Mutex<Connection>>,
    work: impl FnOnce(&Transaction<'_>) -> Result<T>,
) -> Result<T> {
    let (value, changed) =
        phase::with_current_signals(app, |signals| -> Result<(T, Option<String>)> {
            let mut conn = state.lock().unwrap();
            let tx = conn.transaction()?;
            let value = work(&tx)?;
            let changed = phase::sync_derived_phase(
                &tx,
                signals,
                now_unix_secs(),
                crate::activity::is_idle(),
            )?;
            tx.commit()?;
            Ok((value, changed))
        })?;
    phase::emit_phase_changed(app, changed);
    Ok(value)
}

fn fetch_latest_phase_check_in(
    conn: &Connection,
    include_idle: bool,
) -> Result<Option<PhaseCheckIn>> {
    let query = if include_idle {
        format!(
            "SELECT {PHASE_CHECK_IN_COLUMNS} FROM phase_check_ins \
             ORDER BY created_at DESC, id DESC LIMIT 1"
        )
    } else {
        format!(
            "SELECT {PHASE_CHECK_IN_COLUMNS} FROM phase_check_ins \
             WHERE phase_id IS NOT NULL ORDER BY created_at DESC, id DESC LIMIT 1"
        )
    };
    conn.query_row(&query, [], map_phase_check_in)
        .optional()
        .map_err(Into::into)
}

fn fetch_task(conn: &Connection, id: i64) -> Result<Task> {
    conn.query_row(
        &format!("SELECT {TASK_COLUMNS} FROM tasks t WHERE t.id = ?1"),
        params![id],
        map_task,
    )
    .map_err(Into::into)
}

fn fetch_metric(conn: &Connection, id: i64) -> Result<Metric> {
    conn.query_row(
        &format!("SELECT {METRIC_COLUMNS} FROM metrics WHERE id = ?1"),
        params![id],
        map_metric,
    )
    .map_err(Into::into)
}

fn valid_metric_color(color: &str) -> bool {
    let bytes = color.as_bytes();
    if bytes.first() != Some(&b'#') {
        return false;
    }
    match bytes.len() {
        4 | 7 => bytes[1..].iter().all(|byte| byte.is_ascii_hexdigit()),
        _ => false,
    }
}

fn valid_icon(icon: &str) -> bool {
    !icon.is_empty()
        && icon.len() <= 32
        && icon
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'-')
}

fn fetch_pulse(conn: &Connection, id: i64) -> Result<Pulse> {
    let (name, icon, created_at) = conn
        .query_row(
            "SELECT name, icon, created_at FROM pulses WHERE id = ?1",
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("pulse {id}")))?;
    let mut stmt = conn.prepare(
        "SELECT metric_id FROM pulse_metrics WHERE pulse_id = ?1 \
             ORDER BY sort_order ASC, rowid ASC",
    )?;
    let metric_ids = stmt
        .query_map(params![id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Pulse {
        id,
        name,
        icon,
        created_at,
        metric_ids,
    })
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

fn change_task_status(conn: &Connection, id: i64, status: &str) -> Result<()> {
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

fn change_task_working(conn: &Connection, id: i64, working: bool) -> Result<Task> {
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
fn bank_task_work(conn: &Connection, id: i64, now: i64) -> Result<()> {
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
fn touch_task(conn: &Connection, id: i64, now: i64) -> Result<()> {
    conn.execute(
        "UPDATE tasks SET updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

/// Bank Worked time and clear Working now on every task that has it, returning
/// the tasks it changed. RETURNING gives no row order; callers key by id. It
/// also forbids the subqueries TASK_COLUMNS needs, so the closed stretches
/// yield task ids and the rows are fetched after the update finishes.
pub(crate) fn bank_all_working_now(conn: &Connection, now: i64) -> Result<Vec<Task>> {
    let task_ids = {
        let mut stmt = conn.prepare(
            "UPDATE task_work_stretches SET ended_at = MAX(?1, started_at) \
             WHERE ended_at IS NULL RETURNING task_id",
        )?;
        let ids = stmt
            .query_map(params![now], |row| row.get::<_, i64>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        ids
    };
    task_ids
        .into_iter()
        .map(|id| {
            touch_task(conn, id, now)?;
            fetch_task(conn, id)
        })
        .collect()
}

/// Stamp the last moment work was known live. The WHERE keeps an idle Nest off
/// the disk entirely: with nothing open there is nothing to recover.
pub(crate) fn beat_heartbeat(conn: &Connection, now: i64) -> Result<()> {
    conn.execute(
        "UPDATE app_heartbeat SET beat_at = ?1 \
         WHERE EXISTS (SELECT 1 FROM task_work_stretches WHERE ended_at IS NULL)",
        params![now],
    )?;
    Ok(())
}

/// Nothing can be Working now while Nest is down, so a stretch still open at
/// launch outlived the last session. Quitting banks them; this is the crash
/// path, ending each at the last heartbeat instead of letting it run to now and
/// bank the downtime as work.
///
/// ponytail: the heartbeat cadence is the resolution — a crash loses up to that
/// much of the stretch. Beat more often if that gap ever matters.
pub(crate) fn recover_open_stretches(conn: &Connection, now: i64) -> Result<usize> {
    Ok(conn.execute(
        "UPDATE task_work_stretches \
         SET ended_at = MIN(?1, MAX(started_at, (SELECT beat_at FROM app_heartbeat))) \
         WHERE ended_at IS NULL",
        params![now],
    )?)
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
const OPEN_STRETCH_SENTINEL: i64 = 99_999_999_999;

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

fn change_task_work_stretch(
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

/// Bank Worked time, mark the Mac away, and record Offline even from Resting.
pub(crate) fn enter_system_offline(app: &AppHandle) {
    let outcome = (|| -> Result<(bool, Option<String>)> {
        let signals_state = app.state::<Mutex<phase::PhaseSignals>>();
        let mut signals = signals_state.lock().unwrap();
        signals.system_offline = true;
        let current = *signals;
        let db = app.state::<Mutex<Connection>>();
        let mut conn = db.lock().unwrap();
        let tx = conn.transaction()?;
        let now = now_unix_secs();
        let stopped = !bank_all_working_now(&tx, now)?.is_empty();
        let changed = phase::sync_derived_phase(&tx, current, now, crate::activity::is_idle())?;
        tx.commit()?;
        Ok((stopped, changed))
    })();
    match outcome {
        Ok((stopped, changed)) => {
            if stopped {
                let _ = app.emit("data-changed", ());
            }
            phase::emit_phase_changed(app, changed);
        }
        Err(error) => eprintln!("nest: enter system offline failed: {error}"),
    }
}

/// Leave Offline. Engagement flags stay as they are, including a still-open popup.
pub(crate) fn leave_system_offline(app: &AppHandle) {
    phase::update_signals_and_sync(app, |signals| {
        signals.system_offline = false;
        signals.notion_frontmost = phase::notion_is_frontmost();
    });
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

fn update_task_score_field(
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
fn set_task_order(conn: &Connection, ids: &[i64]) -> Result<()> {
    let unique: std::collections::HashSet<_> = ids.iter().copied().collect();
    if unique.len() != ids.len() {
        return Err(AppError::InvalidInput(
            "task order must list each task once".into(),
        ));
    }
    let mut slots = Vec::with_capacity(ids.len());
    for id in ids {
        slots.push(
            conn.query_row(
                "SELECT sort_order FROM tasks WHERE id = ?1",
                params![id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(|_| AppError::NotFound(format!("task {id}")))?,
        );
    }
    slots.sort_unstable();
    for (id, slot) in ids.iter().zip(slots) {
        conn.execute(
            "UPDATE tasks SET sort_order = ?1 WHERE id = ?2",
            params![slot, id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn reorder_tasks(state: State<'_, Mutex<Connection>>, ids: Vec<i64>) -> Result<()> {
    let conn = state.lock().unwrap();
    set_task_order(&conn, &ids)
}

#[tauri::command]
pub fn list_metrics(state: State<'_, Mutex<Connection>>) -> Result<Vec<Metric>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {METRIC_COLUMNS} FROM metrics ORDER BY created_at ASC"
    ))?;
    let rows = stmt
        .query_map([], map_metric)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_metric(state: State<'_, Mutex<Connection>>, name: String) -> Result<Metric> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("metric name cannot be empty".into()));
    }
    let conn = state.lock().unwrap();
    let now = now_unix_secs();
    conn.execute(
        "INSERT INTO metrics (name, created_at) VALUES (?1, ?2)",
        params![trimmed, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Metric {
        id,
        name: trimmed,
        icon: "activity".into(),
        created_at: now,
        color: None,
    })
}

#[tauri::command]
pub fn rename_metric(state: State<'_, Mutex<Connection>>, id: i64, name: String) -> Result<Metric> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("metric name cannot be empty".into()));
    }
    let conn = state.lock().unwrap();
    let updated = conn.execute(
        "UPDATE metrics SET name = ?1 WHERE id = ?2",
        params![trimmed, id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("metric {id}")));
    }
    fetch_metric(&conn, id)
}

#[tauri::command]
pub fn set_metric_icon(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    icon: String,
) -> Result<Metric> {
    if !valid_icon(&icon) {
        return Err(AppError::InvalidInput("invalid metric icon".into()));
    }
    let conn = state.lock().unwrap();
    if conn.execute(
        "UPDATE metrics SET icon = ?1 WHERE id = ?2",
        params![icon, id],
    )? == 0
    {
        return Err(AppError::NotFound(format!("metric {id}")));
    }
    fetch_metric(&conn, id)
}

#[tauri::command]
pub fn set_metric_color(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    color: Option<String>,
) -> Result<Metric> {
    if let Some(ref value) = color {
        if !valid_metric_color(value) {
            return Err(AppError::InvalidInput("invalid metric color".into()));
        }
    }
    let conn = state.lock().unwrap();
    if conn.execute(
        "UPDATE metrics SET color = ?1 WHERE id = ?2",
        params![color, id],
    )? == 0
    {
        return Err(AppError::NotFound(format!("metric {id}")));
    }
    fetch_metric(&conn, id)
}

#[tauri::command]
pub fn list_pulses(state: State<'_, Mutex<Connection>>) -> Result<Vec<Pulse>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare("SELECT id FROM pulses ORDER BY sort_order ASC, id ASC")?;
    let ids = stmt
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<i64>>>()?;
    // ponytail: one tiny membership query per pulse; use one join if pulse counts ever grow.
    ids.into_iter().map(|id| fetch_pulse(&conn, id)).collect()
}

#[tauri::command]
pub fn create_pulse(state: State<'_, Mutex<Connection>>, name: String) -> Result<Pulse> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::InvalidInput("pulse name cannot be empty".into()));
    }
    let conn = state.lock().unwrap();
    conn.execute(
        "INSERT INTO pulses (name, created_at, sort_order) VALUES ( \
           ?1, \
           ?2, \
           COALESCE((SELECT MAX(sort_order) FROM pulses), -1) + 1 \
         )",
        params![name, now_unix_secs()],
    )?;
    fetch_pulse(&conn, conn.last_insert_rowid())
}

#[tauri::command]
pub fn rename_pulse(state: State<'_, Mutex<Connection>>, id: i64, name: String) -> Result<Pulse> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::InvalidInput("pulse name cannot be empty".into()));
    }
    let conn = state.lock().unwrap();
    if conn.execute(
        "UPDATE pulses SET name = ?1 WHERE id = ?2",
        params![name, id],
    )? == 0
    {
        return Err(AppError::NotFound(format!("pulse {id}")));
    }
    fetch_pulse(&conn, id)
}

#[tauri::command]
pub fn set_pulse_icon(state: State<'_, Mutex<Connection>>, id: i64, icon: String) -> Result<Pulse> {
    if !valid_icon(&icon) {
        return Err(AppError::InvalidInput("invalid pulse icon".into()));
    }
    let conn = state.lock().unwrap();
    if conn.execute(
        "UPDATE pulses SET icon = ?1 WHERE id = ?2",
        params![icon, id],
    )? == 0
    {
        return Err(AppError::NotFound(format!("pulse {id}")));
    }
    fetch_pulse(&conn, id)
}

#[tauri::command]
pub fn delete_pulse(state: State<'_, Mutex<Connection>>, id: i64) -> Result<()> {
    let conn = state.lock().unwrap();
    if conn.execute("DELETE FROM pulses WHERE id = ?1", params![id])? == 0 {
        return Err(AppError::NotFound(format!("pulse {id}")));
    }
    Ok(())
}

#[tauri::command]
pub fn add_metric_to_pulse(
    state: State<'_, Mutex<Connection>>,
    pulse_id: i64,
    metric_id: i64,
) -> Result<()> {
    let conn = state.lock().unwrap();
    conn.execute(
        "INSERT OR IGNORE INTO pulse_metrics (pulse_id, metric_id, sort_order) \
         VALUES ( \
           ?1, \
           ?2, \
           COALESCE((SELECT MAX(sort_order) FROM pulse_metrics WHERE pulse_id = ?1), -1) + 1 \
         )",
        params![pulse_id, metric_id],
    )?;
    Ok(())
}

fn is_id_permutation(existing: &[i64], proposed: &[i64]) -> bool {
    if existing.len() != proposed.len() {
        return false;
    }
    let unique: std::collections::HashSet<_> = proposed.iter().copied().collect();
    unique.len() == proposed.len() && existing.iter().all(|id| unique.contains(id))
}

fn set_pulse_order(conn: &Connection, ids: &[i64]) -> Result<()> {
    let mut stmt = conn.prepare("SELECT id FROM pulses ORDER BY sort_order ASC, id ASC")?;
    let existing = stmt
        .query_map([], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<i64>>>()?;
    if !is_id_permutation(&existing, ids) {
        return Err(AppError::InvalidInput(
            "pulse order must include each pulse once".into(),
        ));
    }
    for (index, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE pulses SET sort_order = ?1 WHERE id = ?2",
            params![index as i64, id],
        )?;
    }
    Ok(())
}

fn set_pulse_metric_order(conn: &Connection, pulse_id: i64, metric_ids: &[i64]) -> Result<()> {
    let pulse_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM pulses WHERE id = ?1)",
        params![pulse_id],
        |row| row.get(0),
    )?;
    if !pulse_exists {
        return Err(AppError::NotFound(format!("pulse {pulse_id}")));
    }
    let mut stmt = conn.prepare(
        "SELECT metric_id FROM pulse_metrics WHERE pulse_id = ?1 \
         ORDER BY sort_order ASC, rowid ASC",
    )?;
    let existing = stmt
        .query_map(params![pulse_id], |row| row.get(0))?
        .collect::<rusqlite::Result<Vec<i64>>>()?;
    if !is_id_permutation(&existing, metric_ids) {
        return Err(AppError::InvalidInput(
            "metric order must include each metric in the pulse once".into(),
        ));
    }
    for (index, metric_id) in metric_ids.iter().enumerate() {
        conn.execute(
            "UPDATE pulse_metrics SET sort_order = ?1 WHERE pulse_id = ?2 AND metric_id = ?3",
            params![index as i64, pulse_id, metric_id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn reorder_pulses(state: State<'_, Mutex<Connection>>, ids: Vec<i64>) -> Result<()> {
    let conn = state.lock().unwrap();
    set_pulse_order(&conn, &ids)
}

#[tauri::command]
pub fn reorder_pulse_metrics(
    state: State<'_, Mutex<Connection>>,
    pulse_id: i64,
    metric_ids: Vec<i64>,
) -> Result<()> {
    let conn = state.lock().unwrap();
    set_pulse_metric_order(&conn, pulse_id, &metric_ids)
}

#[tauri::command]
pub fn remove_metric_from_pulse(
    state: State<'_, Mutex<Connection>>,
    pulse_id: i64,
    metric_id: i64,
) -> Result<()> {
    let conn = state.lock().unwrap();
    conn.execute(
        "DELETE FROM pulse_metrics WHERE pulse_id = ?1 AND metric_id = ?2",
        params![pulse_id, metric_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_phases(
    state: State<'_, Mutex<Connection>>,
    include_inactive: bool,
) -> Result<Vec<Phase>> {
    let conn = state.lock().unwrap();
    let sql = if include_inactive {
        "SELECT id, name, created_at, inactive_since FROM phases ORDER BY created_at ASC, id ASC"
    } else {
        "SELECT id, name, created_at, inactive_since FROM phases \
         WHERE inactive_since IS NULL ORDER BY created_at ASC, id ASC"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Phase {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                inactive_since: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Writes the check-in row and one row per rating, so it takes the transaction
/// rather than the pooled connection: a mid-loop failure must not leave a
/// check-in with only some of its ratings.
fn record_metric_check_in(
    tx: &Transaction<'_>,
    pulse_id: i64,
    ratings: &[MetricRatingInput],
    now: i64,
) -> Result<MetricCheckIn> {
    if ratings.is_empty() {
        return Err(AppError::InvalidInput(
            "at least one rating is required".into(),
        ));
    }
    for r in ratings {
        if !(1..=5).contains(&r.value) {
            return Err(AppError::InvalidInput(format!(
                "value {} out of range 1-5",
                r.value
            )));
        }
    }

    let pulse_name: String = tx
        .query_row(
            "SELECT name FROM pulses WHERE id = ?1",
            params![pulse_id],
            |row| row.get(0),
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("pulse {pulse_id}")))?;

    for rating in ratings {
        let belongs: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM pulse_metrics WHERE pulse_id = ?1 AND metric_id = ?2)",
            params![pulse_id, rating.metric_id],
            |row| row.get(0),
        )?;
        if !belongs {
            return Err(AppError::InvalidInput(format!(
                "metric {} is not part of pulse {pulse_id}",
                rating.metric_id
            )));
        }
    }

    tx.execute(
        "INSERT INTO metric_check_ins (created_at, pulse_id, pulse_name) VALUES (?1, ?2, ?3)",
        params![now, pulse_id, pulse_name],
    )?;
    let check_in_id = tx.last_insert_rowid();

    {
        let mut stmt = tx.prepare(
            "INSERT INTO metric_ratings (check_in_id, metric_id, value) \
             VALUES (?1, ?2, ?3)",
        )?;
        for r in ratings {
            stmt.execute(params![check_in_id, r.metric_id, r.value])?;
        }
    }

    Ok(MetricCheckIn {
        id: check_in_id,
        created_at: now,
        pulse_id: Some(pulse_id),
        pulse_name: Some(pulse_name),
    })
}

#[tauri::command]
pub fn submit_metric_check_in(
    state: State<'_, Mutex<Connection>>,
    pulse_id: i64,
    ratings: Vec<MetricRatingInput>,
) -> Result<MetricCheckIn> {
    let mut conn = state.lock().unwrap();
    let tx = conn.transaction()?;
    let check_in = record_metric_check_in(&tx, pulse_id, &ratings, now_unix_secs())?;
    tx.commit()?;
    Ok(check_in)
}

#[tauri::command]
pub fn list_metric_check_ins(
    state: State<'_, Mutex<Connection>>,
    from: i64,
    to: i64,
) -> Result<Vec<MetricCheckInWithRatings>> {
    let conn = state.lock().unwrap();

    let mut ci_stmt = conn.prepare(
        "SELECT id, created_at, pulse_id, pulse_name FROM metric_check_ins \
         WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC",
    )?;
    let check_ins: Vec<MetricCheckIn> = ci_stmt
        .query_map(params![from, to], |row| {
            Ok(MetricCheckIn {
                id: row.get(0)?,
                created_at: row.get(1)?,
                pulse_id: row.get(2)?,
                pulse_name: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut r_stmt = conn.prepare(
        "SELECT check_in_id, metric_id, value FROM metric_ratings WHERE check_in_id = ?1",
    )?;
    let mut result = Vec::with_capacity(check_ins.len());
    for ci in check_ins {
        let ratings: Vec<MetricRating> = r_stmt
            .query_map(params![ci.id], |row| {
                Ok(MetricRating {
                    check_in_id: row.get(0)?,
                    metric_id: row.get(1)?,
                    value: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        result.push(MetricCheckInWithRatings {
            check_in: ci,
            ratings,
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_metric_check_in(state: State<'_, Mutex<Connection>>, id: i64) -> Result<()> {
    let conn = state.lock().unwrap();
    let deleted = conn.execute("DELETE FROM metric_check_ins WHERE id = ?1", params![id])?;
    if deleted == 0 {
        return Err(AppError::NotFound(format!("metric_check_in {id}")));
    }
    Ok(())
}

#[tauri::command]
pub fn latest_phase_check_in(
    state: State<'_, Mutex<Connection>>,
    include_idle: bool,
) -> Result<Option<PhaseCheckIn>> {
    let conn = state.lock().unwrap();
    fetch_latest_phase_check_in(&conn, include_idle)
}

#[tauri::command]
pub fn list_phase_check_ins(
    state: State<'_, Mutex<Connection>>,
    from: i64,
    to: i64,
) -> Result<Vec<PhaseCheckIn>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {PHASE_CHECK_IN_COLUMNS} FROM phase_check_ins \
         WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC"
    ))?;
    let rows = stmt
        .query_map(params![from, to], map_phase_check_in)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn get_timer_state(timer: State<'_, Mutex<Timer>>) -> Result<TimerState> {
    let timer = timer.lock().unwrap();
    Ok(TimerState {
        interval_minutes: timer.interval_minutes,
        next_due_at: timer.next_due_at,
        waiting_for_response: timer.waiting_for_response,
    })
}

#[tauri::command]
pub fn start_timer(
    state: State<'_, Mutex<Connection>>,
    timer: State<'_, Mutex<Timer>>,
    minutes: i64,
) -> Result<TimerState> {
    let minutes = validate_timer_interval(minutes)?;
    let now = now_unix_secs();
    let next_due_at = now + minutes * 60;

    {
        let conn = state.lock().unwrap();
        conn.execute(
            "UPDATE timer_schedule SET interval_minutes = ?1, next_due_at = ?2 WHERE id = 1",
            params![minutes, next_due_at],
        )?;
    }
    {
        let mut timer = timer.lock().unwrap();
        timer.interval_minutes = minutes;
        timer.next_due_at = next_due_at;
        timer.waiting_for_response = false;
    }

    Ok(TimerState {
        interval_minutes: minutes,
        next_due_at,
        waiting_for_response: false,
    })
}

#[tauri::command]
pub fn submit_brain_dump(
    state: State<'_, Mutex<Connection>>,
    text: String,
    title: Option<String>,
) -> Result<BrainDump> {
    let text_clean = text.trim().to_string();
    if text_clean.is_empty() {
        return Err(AppError::InvalidInput("brain dump cannot be empty".into()));
    }
    let title_clean = normalize_optional_title(title);
    let conn = state.lock().unwrap();
    let now = now_unix_secs();
    conn.execute(
        "INSERT INTO brain_dumps (created_at, title, text) VALUES (?1, ?2, ?3)",
        params![now, title_clean, text_clean],
    )?;
    Ok(BrainDump {
        id: conn.last_insert_rowid(),
        created_at: now,
        title: title_clean,
        text: text_clean,
    })
}

#[tauri::command]
pub fn update_brain_dump_title(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    title: Option<String>,
) -> Result<BrainDump> {
    let title = normalize_optional_title(title);
    let conn = state.lock().unwrap();
    let updated = conn.execute(
        "UPDATE brain_dumps SET title = ?1 WHERE id = ?2",
        params![title, id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("brain dump {id}")));
    }
    conn.query_row(
        &format!("SELECT {BRAIN_DUMP_COLUMNS} FROM brain_dumps WHERE id = ?1"),
        params![id],
        map_brain_dump,
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn list_brain_dumps(
    state: State<'_, Mutex<Connection>>,
    from: i64,
    to: i64,
) -> Result<Vec<BrainDump>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {BRAIN_DUMP_COLUMNS} FROM brain_dumps \
         WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC"
    ))?;
    let rows = stmt
        .query_map(params![from, to], map_brain_dump)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::{
        bank_all_working_now, bank_task_work, beat_heartbeat, change_task_status,
        change_task_work_stretch, change_task_working, fetch_task, normalize_optional_title,
        normalize_task_scope, record_metric_check_in, recover_open_stretches, resolve_due_timer,
        update_task_score_field, valid_icon, validate_task_status,
    };
    use crate::migrations::migrations;
    use crate::models::MetricRatingInput;
    use crate::Timer;
    use rusqlite::Connection;

    /// Replace a task's stretches with `banked` seconds of finished work plus,
    /// optionally, one open stretch. Worked time is derived, so seeding it means
    /// seeding the stretches it sums.
    fn seed_work(conn: &Connection, task_id: i64, banked: i64, open_since: Option<i64>) {
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

    #[test]
    fn normalizes_optional_titles() {
        assert_eq!(
            normalize_optional_title(Some("  A clearer thought  ".into())),
            Some("A clearer thought".into())
        );
        assert_eq!(normalize_optional_title(Some("   ".into())), None);
        assert_eq!(normalize_optional_title(None), None);
    }

    fn task_database() -> Connection {
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

    fn stretches(conn: &Connection, task_id: i64) -> Vec<(i64, i64, Option<i64>)> {
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
    fn a_crashed_stretch_ends_at_the_last_heartbeat_not_at_the_next_launch() {
        let conn = task_database();

        // Worked from 100, heartbeat still going at 400, then Nest died. The
        // next launch is a day later and must not bank the gap.
        seed_work(&conn, 1, 0, Some(100));
        beat_heartbeat(&conn, 400).unwrap();
        assert_eq!(recover_open_stretches(&conn, 90_000).unwrap(), 1);
        assert_eq!(stretches(&conn, 1), vec![(1, 100, Some(400))]);
        assert_eq!(fetch_task(&conn, 1).unwrap().worked_seconds, 300);

        // Nothing open: a second launch is a no-op, and an idle Nest never
        // moves the heartbeat past the work it belongs to.
        beat_heartbeat(&conn, 200_000).unwrap();
        assert_eq!(recover_open_stretches(&conn, 200_000).unwrap(), 0);
        assert_eq!(stretches(&conn, 1), vec![(1, 100, Some(400))]);

        // Crash inside the first heartbeat: nothing to credit, but the stretch
        // still closes rather than running forever.
        seed_work(&conn, 1, 0, Some(300_000));
        assert_eq!(recover_open_stretches(&conn, 400_000).unwrap(), 1);
        assert_eq!(fetch_task(&conn, 1).unwrap().worked_seconds, 0);
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
    fn accepts_safe_icon_keys() {
        assert!(valid_icon("book-heart"));
        assert!(!valid_icon(""));
        assert!(!valid_icon("<svg>"));
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
    fn bank_all_working_now_banks_every_working_task() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at) \
             VALUES (1, 'A', 'active', 1, 1), (2, 'B', 'active', 1, 1), (3, 'C', 'active', 1, 1)",
            [],
        )
        .unwrap();
        change_task_working(&conn, 1, true).unwrap();
        change_task_working(&conn, 2, true).unwrap();
        seed_work(&conn, 1, 10, Some(100));
        seed_work(&conn, 2, 5, Some(120));

        let mut banked = bank_all_working_now(&conn, 150).unwrap();
        banked.sort_by_key(|task| task.id);
        // The returned rows are what the popup renders, so they must already
        // carry the banked totals, not the pre-update ones.
        assert_eq!(
            banked
                .iter()
                .map(|task| (task.id, task.worked_seconds, task.working_now))
                .collect::<Vec<_>>(),
            vec![(1, 60, false), (2, 35, false)],
        );
        assert!(bank_all_working_now(&conn, 160).unwrap().is_empty());

        let first = fetch_task(&conn, 1).unwrap();
        assert!(!first.working_now);
        assert_eq!(first.worked_seconds, 60);
        assert_eq!(first.work_started_at, None);

        let second = fetch_task(&conn, 2).unwrap();
        assert!(!second.working_now);
        assert_eq!(second.worked_seconds, 35);
        assert_eq!(second.work_started_at, None);

        let idle = fetch_task(&conn, 3).unwrap();
        assert!(!idle.working_now);
        assert_eq!(idle.worked_seconds, 0);
    }

    #[test]
    fn closing_a_due_popup_resolves_once_by_outcome() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        let mut timer = Timer {
            interval_minutes: 20,
            next_due_at: 900,
            waiting_for_response: true,
        };

        assert!(resolve_due_timer(&conn, &mut timer, true, None, 1_000,).unwrap());
        assert_eq!(timer.interval_minutes, 5);
        assert_eq!(timer.next_due_at, 1_300);
        assert!(!timer.waiting_for_response);

        assert!(!resolve_due_timer(&conn, &mut timer, false, Some(30), 1_001,).unwrap());
        assert_eq!(timer.next_due_at, 1_300);

        timer.interval_minutes = 20;
        timer.waiting_for_response = true;
        assert!(resolve_due_timer(&conn, &mut timer, false, Some(30), 2_000,).unwrap());
        assert_eq!(timer.interval_minutes, 30);
        assert_eq!(timer.next_due_at, 3_800);

        timer.interval_minutes = 20;
        timer.waiting_for_response = true;
        assert!(resolve_due_timer(&conn, &mut timer, false, None, 4_000,).unwrap());
        assert_eq!(timer.interval_minutes, 20);
        assert_eq!(timer.next_due_at, 5_200);
        assert!(!timer.waiting_for_response);
    }

    #[test]
    fn reorders_pulses_and_the_metrics_inside_a_pulse() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute_batch(
            "INSERT INTO pulses (id, name, created_at, sort_order) \
             VALUES (1, 'First', 1, 0), (2, 'Second', 2, 1);
             INSERT INTO metrics (id, name, created_at) \
             VALUES (10, 'Energy', 1), (11, 'Mood', 2);
             INSERT INTO pulse_metrics (pulse_id, metric_id, sort_order) \
             VALUES (1, 10, 0), (1, 11, 1);",
        )
        .unwrap();

        super::set_pulse_order(&conn, &[2, 1]).unwrap();
        let pulse_ids: Vec<i64> = conn
            .prepare("SELECT id FROM pulses ORDER BY sort_order ASC, id ASC")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(pulse_ids, vec![2, 1]);

        super::set_pulse_metric_order(&conn, 1, &[11, 10]).unwrap();
        assert_eq!(
            super::fetch_pulse(&conn, 1).unwrap().metric_ids,
            vec![11, 10]
        );
        assert!(super::set_pulse_order(&conn, &[1]).is_err());
        assert!(super::set_pulse_metric_order(&conn, 1, &[10]).is_err());
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
        super::set_task_order(&conn, &[4, 3, 1]).unwrap();
        let order: Vec<i64> = conn
            .prepare("SELECT id FROM tasks ORDER BY sort_order ASC, id ASC")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(order, vec![4, 2, 3, 1]);

        assert!(super::set_task_order(&conn, &[1, 1]).is_err());
        assert!(super::set_task_order(&conn, &[99]).is_err());
    }

    #[test]
    fn records_a_metric_check_in_for_pulse_metrics_only() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute_batch(
            "INSERT INTO pulses (id, name, created_at, sort_order) VALUES (1, 'Body', 1, 0);
             INSERT INTO metrics (id, name, created_at) \
             VALUES (10, 'Energy', 1), (11, 'Mood', 2), (12, 'Focus', 3);
             INSERT INTO pulse_metrics (pulse_id, metric_id, sort_order) \
             VALUES (1, 10, 0), (1, 11, 1);",
        )
        .unwrap();

        let tx = conn.transaction().unwrap();
        let saved = record_metric_check_in(
            &tx,
            1,
            &[
                MetricRatingInput {
                    metric_id: 10,
                    value: 4,
                },
                MetricRatingInput {
                    metric_id: 11,
                    value: 2,
                },
            ],
            500,
        )
        .unwrap();
        assert_eq!(saved.pulse_id, Some(1));
        assert_eq!(saved.pulse_name.as_deref(), Some("Body"));
        assert_eq!(saved.created_at, 500);

        assert!(record_metric_check_in(&tx, 1, &[], 501).is_err());
        assert!(record_metric_check_in(
            &tx,
            1,
            &[MetricRatingInput {
                metric_id: 10,
                value: 6
            }],
            502,
        )
        .is_err());
        assert!(record_metric_check_in(
            &tx,
            1,
            &[MetricRatingInput {
                metric_id: 12,
                value: 3
            }],
            503,
        )
        .is_err());
        assert!(record_metric_check_in(
            &tx,
            99,
            &[MetricRatingInput {
                metric_id: 10,
                value: 3
            }],
            504,
        )
        .is_err());
        tx.commit().unwrap();

        let ratings: Vec<(i64, i64)> = conn
            .prepare(
                "SELECT metric_id, value FROM metric_ratings \
                 WHERE check_in_id = ?1 ORDER BY metric_id ASC",
            )
            .unwrap()
            .query_map([saved.id], |row| Ok((row.get(0)?, row.get(1)?)))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(ratings, vec![(10, 4), (11, 2)]);
    }
}
