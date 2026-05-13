use rusqlite::{params, Connection};
use std::sync::Mutex;
use tauri::State;

use crate::error::{AppError, Result};
use crate::models::{CheckIn, CheckInWithRatings, Metric, Rating, RatingInput, SeriesPoint};

fn now_unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn trim_to_option(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
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
pub fn rename_metric(
    state: State<'_, Mutex<Connection>>,
    id: i64,
    name: String,
) -> Result<Metric> {
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
pub fn submit_check_in(
    state: State<'_, Mutex<Connection>>,
    ratings: Vec<RatingInput>,
    note: Option<String>,
) -> Result<CheckIn> {
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
    let note_clean = trim_to_option(note);

    tx.execute(
        "INSERT INTO check_ins (created_at, note) VALUES (?1, ?2)",
        params![now, note_clean],
    )?;
    let check_in_id = tx.last_insert_rowid();

    {
        let mut stmt = tx.prepare(
            "INSERT INTO ratings (check_in_id, metric_id, value, note) \
             VALUES (?1, ?2, ?3, ?4)",
        )?;
        for r in &ratings {
            let rnote = trim_to_option(r.note.clone());
            stmt.execute(params![check_in_id, r.metric_id, r.value, rnote])?;
        }
    }

    tx.commit()?;
    Ok(CheckIn {
        id: check_in_id,
        created_at: now,
        note: note_clean,
    })
}

#[tauri::command]
pub fn list_check_ins(
    state: State<'_, Mutex<Connection>>,
    from: i64,
    to: i64,
) -> Result<Vec<CheckInWithRatings>> {
    let conn = state.lock().unwrap();

    let mut ci_stmt = conn.prepare(
        "SELECT id, created_at, note FROM check_ins \
         WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC",
    )?;
    let check_ins: Vec<CheckIn> = ci_stmt
        .query_map(params![from, to], |row| {
            Ok(CheckIn {
                id: row.get(0)?,
                created_at: row.get(1)?,
                note: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut r_stmt = conn.prepare(
        "SELECT check_in_id, metric_id, value, note FROM ratings WHERE check_in_id = ?1",
    )?;
    let mut result = Vec::with_capacity(check_ins.len());
    for ci in check_ins {
        let ratings: Vec<Rating> = r_stmt
            .query_map(params![ci.id], |row| {
                Ok(Rating {
                    check_in_id: row.get(0)?,
                    metric_id: row.get(1)?,
                    value: row.get(2)?,
                    note: row.get(3)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        result.push(CheckInWithRatings {
            check_in: ci,
            ratings,
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn metric_series(
    state: State<'_, Mutex<Connection>>,
    metric_id: i64,
    from: i64,
    to: i64,
) -> Result<Vec<SeriesPoint>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT c.created_at, r.value \
         FROM ratings r \
         JOIN check_ins c ON c.id = r.check_in_id \
         WHERE r.metric_id = ?1 AND c.created_at >= ?2 AND c.created_at < ?3 \
         ORDER BY c.created_at ASC",
    )?;
    let rows = stmt
        .query_map(params![metric_id, from, to], |row| {
            Ok(SeriesPoint {
                timestamp: row.get(0)?,
                value: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
