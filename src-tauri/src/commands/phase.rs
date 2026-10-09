use rusqlite::{params, Connection, OptionalExtension, Row};
use std::sync::Mutex;
use tauri::State;

use crate::error::Result;
use crate::models::{Phase, PhaseCheckIn};

pub(crate) const PHASE_COLUMNS: &str = "id, name, icon, color, created_at, inactive_since";
pub(crate) const PHASE_CHECK_IN_COLUMNS: &str = "id, created_at, phase_id, phase_label";
pub(crate) fn map_phase(row: &Row<'_>) -> rusqlite::Result<Phase> {
    Ok(Phase {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        color: row.get(3)?,
        created_at: row.get(4)?,
        inactive_since: row.get(5)?,
    })
}

pub(crate) fn map_phase_check_in(row: &Row<'_>) -> rusqlite::Result<PhaseCheckIn> {
    Ok(PhaseCheckIn {
        id: row.get(0)?,
        created_at: row.get(1)?,
        phase_id: row.get(2)?,
        phase_label: row.get(3)?,
    })
}

pub(crate) fn fetch_latest_phase_check_in(
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
#[tauri::command]
pub fn list_phases(
    state: State<'_, Mutex<Connection>>,
    include_inactive: bool,
) -> Result<Vec<Phase>> {
    let conn = state.lock().unwrap();
    let sql = if include_inactive {
        format!("SELECT {PHASE_COLUMNS} FROM phases ORDER BY created_at ASC, id ASC")
    } else {
        format!(
            "SELECT {PHASE_COLUMNS} FROM phases \
             WHERE inactive_since IS NULL ORDER BY created_at ASC, id ASC"
        )
    };
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], map_phase)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
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
    // Include the checkpoint immediately before the range so an ongoing Phase
    // can be carried into the first visible calendar interval.
    let mut stmt = conn.prepare(&format!(
        "SELECT {PHASE_CHECK_IN_COLUMNS} FROM phase_check_ins \
         WHERE (created_at >= ?1 AND created_at < ?2) \
            OR id = (SELECT id FROM phase_check_ins \
                    WHERE created_at < ?1 ORDER BY created_at DESC, id DESC LIMIT 1) \
         ORDER BY created_at DESC, id DESC"
    ))?;
    let rows = stmt
        .query_map(params![from, to], map_phase_check_in)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
