use rusqlite::{params, Connection};
use std::sync::Mutex;
use tauri::State;

use crate::error::{AppError, Result};
use crate::models::{
    BrainDump, CheckInSchedule, Metric, MetricCheckIn, MetricCheckInWithRatings, MetricRating,
    MetricRatingInput, Phase, PhaseCheckIn, Task, TaskStatusEvent,
};
use crate::time::now_unix_secs;
use crate::CheckInTimer;

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
        "backlog" | "up_next" | "active" | "paused" | "completed" | "cancelled" => Ok(status),
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

fn validate_check_in_interval(minutes: i64) -> Result<i64> {
    if !crate::check_in::is_valid_interval(minutes) {
        return Err(AppError::InvalidInput(
            "next check-in must be 5, 10, 15, 20, 25, or 30 minutes".into(),
        ));
    }
    Ok(minutes)
}

fn fetch_task(conn: &Connection, id: i64) -> Result<Task> {
    conn.query_row(
        "SELECT id, title, description, status, scope, value, effort, created_at, updated_at \
         FROM tasks WHERE id = ?1",
        params![id],
        |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                status: row.get(3)?,
                scope: row.get(4)?,
                value: row.get(5)?,
                effort: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )
    .map_err(Into::into)
}

fn fetch_metric(conn: &Connection, id: i64) -> Result<Metric> {
    conn.query_row(
        "SELECT id, name, created_at, inactive_since FROM metrics WHERE id = ?1",
        params![id],
        |row| {
            Ok(Metric {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                inactive_since: row.get(3)?,
            })
        },
    )
    .map_err(Into::into)
}

fn fetch_phase(conn: &Connection, id: i64) -> Result<Phase> {
    conn.query_row(
        "SELECT id, name, created_at, inactive_since FROM phases WHERE id = ?1",
        params![id],
        |row| {
            Ok(Phase {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                inactive_since: row.get(3)?,
            })
        },
    )
    .map_err(Into::into)
}

#[tauri::command]
pub fn list_tasks(state: State<'_, Mutex<Connection>>) -> Result<Vec<Task>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, title, description, status, scope, value, effort, created_at, updated_at \
         FROM tasks ORDER BY updated_at DESC, created_at DESC, id DESC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                status: row.get(3)?,
                scope: row.get(4)?,
                value: row.get(5)?,
                effort: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?
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
    state: State<'_, Mutex<Connection>>,
    title: String,
    description: String,
    status: String,
    scope: Option<String>,
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
    tx.execute(
        "INSERT INTO tasks (title, description, status, scope, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![title, description, status, scope, now, now],
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
pub fn set_task_status(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    status: String,
) -> Result<Task> {
    let status = validate_task_status(status.as_str())?;
    let mut conn = state.lock().unwrap();
    let now = now_unix_secs();
    let tx = conn.transaction()?;
    let current_status: String = match tx.query_row(
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
        tx.execute(
            "UPDATE tasks SET status = ?1, updated_at = ?2 WHERE id = ?3",
            params![status, now, id],
        )?;
        tx.execute(
            "INSERT INTO task_status_events (task_id, from_status, to_status, created_at) \
             VALUES (?1, ?2, ?3, ?4)",
            params![id, current_status, status, now],
        )?;
    }
    tx.commit()?;
    fetch_task(&conn, id)
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

#[tauri::command]
pub fn list_metrics(
    state: State<'_, Mutex<Connection>>,
    include_inactive: bool,
) -> Result<Vec<Metric>> {
    let conn = state.lock().unwrap();
    let sql = if include_inactive {
        "SELECT id, name, created_at, inactive_since FROM metrics ORDER BY created_at ASC"
    } else {
        "SELECT id, name, created_at, inactive_since FROM metrics \
         WHERE inactive_since IS NULL ORDER BY created_at ASC"
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Metric {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                inactive_since: row.get(3)?,
            })
        })?
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
        created_at: now,
        inactive_since: None,
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
pub fn set_metric_active(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    active: bool,
) -> Result<Metric> {
    let conn = state.lock().unwrap();
    let inactive_since: Option<i64> = if active { None } else { Some(now_unix_secs()) };
    let updated = conn.execute(
        "UPDATE metrics SET inactive_since = ?1 WHERE id = ?2",
        params![inactive_since, id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("metric {id}")));
    }
    fetch_metric(&conn, id)
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

#[tauri::command]
pub fn create_phase(state: State<'_, Mutex<Connection>>, name: String) -> Result<Phase> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("phase name cannot be empty".into()));
    }
    let conn = state.lock().unwrap();
    let now = now_unix_secs();
    conn.execute(
        "INSERT INTO phases (name, created_at) VALUES (?1, ?2)",
        params![trimmed, now],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Phase {
        id,
        name: trimmed,
        created_at: now,
        inactive_since: None,
    })
}

#[tauri::command]
pub fn rename_phase(state: State<'_, Mutex<Connection>>, id: i64, name: String) -> Result<Phase> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("phase name cannot be empty".into()));
    }
    let conn = state.lock().unwrap();
    let updated = conn.execute(
        "UPDATE phases SET name = ?1 WHERE id = ?2",
        params![trimmed, id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("phase {id}")));
    }
    fetch_phase(&conn, id)
}

#[tauri::command]
pub fn set_phase_active(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    active: bool,
) -> Result<Phase> {
    let conn = state.lock().unwrap();
    let inactive_since: Option<i64> = if active { None } else { Some(now_unix_secs()) };
    let updated = conn.execute(
        "UPDATE phases SET inactive_since = ?1 WHERE id = ?2",
        params![inactive_since, id],
    )?;
    if updated == 0 {
        return Err(AppError::NotFound(format!("phase {id}")));
    }
    fetch_phase(&conn, id)
}

#[tauri::command]
pub fn submit_metric_check_in(
    state: State<'_, Mutex<Connection>>,
    ratings: Vec<MetricRatingInput>,
) -> Result<MetricCheckIn> {
    if ratings.is_empty() {
        return Err(AppError::InvalidInput(
            "at least one rating is required".into(),
        ));
    }
    for r in &ratings {
        if !(1..=5).contains(&r.value) {
            return Err(AppError::InvalidInput(format!(
                "value {} out of range 1-5",
                r.value
            )));
        }
    }

    let mut conn = state.lock().unwrap();
    let tx = conn.transaction()?;
    let now = now_unix_secs();

    tx.execute(
        "INSERT INTO metric_check_ins (created_at) VALUES (?1)",
        params![now],
    )?;
    let check_in_id = tx.last_insert_rowid();

    {
        let mut stmt = tx.prepare(
            "INSERT INTO metric_ratings (check_in_id, metric_id, value) \
             VALUES (?1, ?2, ?3)",
        )?;
        for r in &ratings {
            stmt.execute(params![check_in_id, r.metric_id, r.value])?;
        }
    }

    tx.commit()?;
    Ok(MetricCheckIn {
        id: check_in_id,
        created_at: now,
    })
}

#[tauri::command]
pub fn list_metric_check_ins(
    state: State<'_, Mutex<Connection>>,
    from: i64,
    to: i64,
) -> Result<Vec<MetricCheckInWithRatings>> {
    let conn = state.lock().unwrap();

    let mut ci_stmt = conn.prepare(
        "SELECT id, created_at FROM metric_check_ins \
         WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC",
    )?;
    let check_ins: Vec<MetricCheckIn> = ci_stmt
        .query_map(params![from, to], |row| {
            Ok(MetricCheckIn {
                id: row.get(0)?,
                created_at: row.get(1)?,
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
pub fn submit_phase_check_in(
    state: State<'_, Mutex<Connection>>,
    phase_id: i64,
) -> Result<PhaseCheckIn> {
    let conn = state.lock().unwrap();
    let phase = fetch_phase(&conn, phase_id)
        .map_err(|_| AppError::NotFound(format!("phase {phase_id}")))?;
    if phase.inactive_since.is_some() {
        return Err(AppError::InvalidInput("phase is paused".into()));
    }

    let now = now_unix_secs();
    conn.execute(
        "INSERT INTO phase_check_ins (created_at, phase_id) VALUES (?1, ?2)",
        params![now, phase_id],
    )?;
    Ok(PhaseCheckIn {
        id: conn.last_insert_rowid(),
        created_at: now,
        phase_id,
        phase_label: None,
    })
}

#[tauri::command]
pub fn latest_phase_check_in(state: State<'_, Mutex<Connection>>) -> Result<Option<PhaseCheckIn>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, created_at, phase_id, phase_label \
         FROM phase_check_ins ORDER BY created_at DESC, id DESC LIMIT 1",
    )?;
    match stmt.query_row([], |row| {
        Ok(PhaseCheckIn {
            id: row.get(0)?,
            created_at: row.get(1)?,
            phase_id: row.get(2)?,
            phase_label: row.get(3)?,
        })
    }) {
        Ok(check_in) => Ok(Some(check_in)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.into()),
    }
}

#[tauri::command]
pub fn list_phase_check_ins(
    state: State<'_, Mutex<Connection>>,
    from: i64,
    to: i64,
) -> Result<Vec<PhaseCheckIn>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, created_at, phase_id, phase_label FROM phase_check_ins \
         WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map(params![from, to], |row| {
            Ok(PhaseCheckIn {
                id: row.get(0)?,
                created_at: row.get(1)?,
                phase_id: row.get(2)?,
                phase_label: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn get_check_in_schedule(timer: State<'_, Mutex<CheckInTimer>>) -> Result<CheckInSchedule> {
    let timer = timer.lock().unwrap();
    Ok(CheckInSchedule {
        interval_minutes: timer.interval_minutes,
        next_due_at: timer.next_due_at,
    })
}

#[tauri::command]
pub fn schedule_next_check_in(
    state: State<'_, Mutex<Connection>>,
    timer: State<'_, Mutex<CheckInTimer>>,
    minutes: i64,
) -> Result<CheckInSchedule> {
    let minutes = validate_check_in_interval(minutes)?;
    let now = now_unix_secs();
    let next_due_at = now + minutes * 60;

    {
        let conn = state.lock().unwrap();
        conn.execute(
            "UPDATE check_in_schedule SET interval_minutes = ?1, next_due_at = ?2 WHERE id = 1",
            params![minutes, next_due_at],
        )?;
    }
    {
        let mut timer = timer.lock().unwrap();
        timer.interval_minutes = minutes;
        timer.next_due_at = next_due_at;
    }

    Ok(CheckInSchedule {
        interval_minutes: minutes,
        next_due_at,
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
        "SELECT id, created_at, title, text FROM brain_dumps WHERE id = ?1",
        params![id],
        |row| {
            Ok(BrainDump {
                id: row.get(0)?,
                created_at: row.get(1)?,
                title: row.get(2)?,
                text: row.get(3)?,
            })
        },
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
    let mut stmt = conn.prepare(
        "SELECT id, created_at, title, text FROM brain_dumps \
         WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC",
    )?;
    let rows = stmt
        .query_map(params![from, to], |row| {
            Ok(BrainDump {
                id: row.get(0)?,
                created_at: row.get(1)?,
                title: row.get(2)?,
                text: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::{normalize_optional_title, normalize_task_scope, validate_task_status};

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

    #[test]
    fn accepts_up_next_task_status() {
        assert_eq!(validate_task_status("up_next").unwrap(), "up_next");
    }
}
