use rusqlite::{params, Connection, Row};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, Result};
use crate::models::Reminder;
use crate::time::now_unix_secs;

// One greeting line at the 600px dashboard minimum (~420px at 31px serif).
const MAX_REMINDER_CHARS: usize = 27;

fn normalize_reminder_text(text: String) -> Result<String> {
    let text = text.trim().to_string();
    if text.is_empty() {
        return Err(AppError::InvalidInput("reminder text cannot be empty".into()));
    }
    if text.chars().count() > MAX_REMINDER_CHARS {
        return Err(AppError::InvalidInput(format!(
            "reminder text must be {MAX_REMINDER_CHARS} characters or fewer"
        )));
    }
    Ok(text)
}

pub(crate) fn map_reminder(row: &Row<'_>) -> rusqlite::Result<Reminder> {
    Ok(Reminder {
        id: row.get(0)?,
        text: row.get(1)?,
        active: row.get::<_, i64>(2)? != 0,
        created_at: row.get(3)?,
    })
}

pub(crate) fn fetch_reminder(conn: &Connection, id: i64) -> Result<Reminder> {
    conn.query_row(
        "SELECT id, text, active, created_at FROM reminders WHERE id = ?1",
        params![id],
        map_reminder,
    )
    .map_err(|_| AppError::NotFound(format!("reminder {id}")))
}

#[tauri::command]
pub fn list_reminders(state: State<'_, Mutex<Connection>>) -> Result<Vec<Reminder>> {
    let conn = state.lock().unwrap();
    let mut stmt =
        conn.prepare("SELECT id, text, active, created_at FROM reminders ORDER BY id")?;
    let rows = stmt
        .query_map([], map_reminder)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_reminder(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    text: String,
) -> Result<Reminder> {
    let text = normalize_reminder_text(text)?;
    let reminder = {
        let conn = state.lock().unwrap();
        let created_at = now_unix_secs();
        conn.execute(
            "INSERT INTO reminders (text, active, created_at) VALUES (?1, 1, ?2)",
            params![text, created_at],
        )?;
        Reminder {
            id: conn.last_insert_rowid(),
            text,
            active: true,
            created_at,
        }
    };
    let _ = app.emit("data-changed", ());
    Ok(reminder)
}

#[tauri::command]
pub fn update_reminder_text(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    text: String,
) -> Result<Reminder> {
    let text = normalize_reminder_text(text)?;
    let reminder = {
        let conn = state.lock().unwrap();
        let updated =
            conn.execute("UPDATE reminders SET text = ?1 WHERE id = ?2", params![text, id])?;
        if updated == 0 {
            return Err(AppError::NotFound(format!("reminder {id}")));
        }
        fetch_reminder(&conn, id)?
    };
    let _ = app.emit("data-changed", ());
    Ok(reminder)
}

#[tauri::command]
pub fn set_reminder_active(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    active: bool,
) -> Result<Reminder> {
    let reminder = {
        let conn = state.lock().unwrap();
        let updated = conn.execute(
            "UPDATE reminders SET active = ?1 WHERE id = ?2",
            params![active as i64, id],
        )?;
        if updated == 0 {
            return Err(AppError::NotFound(format!("reminder {id}")));
        }
        fetch_reminder(&conn, id)?
    };
    let _ = app.emit("data-changed", ());
    Ok(reminder)
}

#[tauri::command]
pub fn delete_reminder(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
) -> Result<()> {
    let deleted = {
        let conn = state.lock().unwrap();
        conn.execute("DELETE FROM reminders WHERE id = ?1", params![id])?
    };
    if deleted == 0 {
        return Err(AppError::NotFound(format!("reminder {id}")));
    }
    let _ = app.emit("data-changed", ());
    Ok(())
}
