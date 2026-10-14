use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::State;

use super::shared::{valid_color, valid_icon};
use crate::error::{AppError, Result};
use crate::models::{
    Metric, MetricCheckIn, MetricCheckInWithRatings, MetricRating, MetricRatingInput, Pulse,
    PulseMetricEntry,
};
use crate::time::now_unix_secs;

pub(crate) const METRIC_COLUMNS: &str = "id, name, icon, created_at, color";
pub(crate) fn map_metric(row: &Row<'_>) -> rusqlite::Result<Metric> {
    Ok(Metric {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        created_at: row.get(3)?,
        color: row.get(4)?,
    })
}
pub(crate) fn fetch_metric(conn: &Connection, id: i64) -> Result<Metric> {
    conn.query_row(
        &format!("SELECT {METRIC_COLUMNS} FROM metrics WHERE id = ?1"),
        params![id],
        map_metric,
    )
    .map_err(Into::into)
}
pub(crate) fn fetch_pulse(conn: &Connection, id: i64) -> Result<Pulse> {
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
        if !valid_color(value) {
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

/// Creates a Pulse together with its Metrics and memberships in one
/// transaction, so a failure at any step stores none of them. Everything that
/// can be checked is checked before the first write; the transaction covers
/// what only SQLite can reject.
pub(crate) fn create_pulse_with_metrics_in(
    conn: &mut Connection,
    name: &str,
    icon: &str,
    entries: &[PulseMetricEntry],
    now: i64,
) -> Result<Pulse> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::InvalidInput("pulse name cannot be empty".into()));
    }
    if !valid_icon(icon) {
        return Err(AppError::InvalidInput("invalid pulse icon".into()));
    }

    let mut existing_ids = HashSet::new();
    for entry in entries {
        let (entry_name, entry_icon, entry_color) = match entry {
            PulseMetricEntry::Existing {
                id,
                name,
                icon,
                color,
            } => {
                if !existing_ids.insert(*id) {
                    return Err(AppError::InvalidInput(format!(
                        "metric {id} is listed more than once"
                    )));
                }
                (name, icon, color)
            }
            PulseMetricEntry::New { name, icon, color } => (name, icon, color),
        };
        if entry_name.trim().is_empty() {
            return Err(AppError::InvalidInput("metric name cannot be empty".into()));
        }
        if !valid_icon(entry_icon) {
            return Err(AppError::InvalidInput("invalid metric icon".into()));
        }
        if entry_color
            .as_deref()
            .is_some_and(|color| !valid_color(color))
        {
            return Err(AppError::InvalidInput("invalid metric color".into()));
        }
    }

    let tx = conn.transaction()?;

    let stored_names = {
        let mut stmt = tx.prepare("SELECT id, name FROM metrics")?;
        let rows = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<rusqlite::Result<HashMap<i64, String>>>()?;
        rows
    };
    if let Some(missing) = existing_ids
        .iter()
        .find(|id| !stored_names.contains_key(id))
    {
        return Err(AppError::NotFound(format!("metric {missing}")));
    }
    // The names every Metric would hold afterwards: untouched Metrics keep
    // theirs, listed ones take the entry's name.
    let mut resulting_names: HashSet<&str> = stored_names
        .iter()
        .filter(|(id, _)| !existing_ids.contains(id))
        .map(|(_, stored_name)| stored_name.as_str())
        .collect();
    for entry in entries {
        let (PulseMetricEntry::Existing { name, .. } | PulseMetricEntry::New { name, .. }) = entry;
        if !resulting_names.insert(name.trim()) {
            return Err(AppError::InvalidInput(format!(
                "a metric named \"{}\" already exists",
                name.trim()
            )));
        }
    }

    tx.execute(
        "INSERT INTO pulses (name, icon, created_at, sort_order) VALUES ( \
           ?1, \
           ?2, \
           ?3, \
           COALESCE((SELECT MAX(sort_order) FROM pulses), -1) + 1 \
         )",
        params![name, icon, now],
    )?;
    let pulse_id = tx.last_insert_rowid();

    for (index, entry) in entries.iter().enumerate() {
        let metric_id = match entry {
            PulseMetricEntry::Existing {
                id,
                name,
                icon,
                color,
            } => {
                tx.execute(
                    "UPDATE metrics SET name = ?1, icon = ?2, color = ?3 WHERE id = ?4",
                    params![name.trim(), icon, color, id],
                )?;
                *id
            }
            PulseMetricEntry::New { name, icon, color } => {
                tx.execute(
                    "INSERT INTO metrics (name, icon, color, created_at) VALUES (?1, ?2, ?3, ?4)",
                    params![name.trim(), icon, color, now],
                )?;
                tx.last_insert_rowid()
            }
        };
        tx.execute(
            "INSERT INTO pulse_metrics (pulse_id, metric_id, sort_order) VALUES (?1, ?2, ?3)",
            params![pulse_id, metric_id, index as i64],
        )?;
    }

    let pulse = fetch_pulse(&tx, pulse_id)?;
    tx.commit()?;
    Ok(pulse)
}

#[tauri::command]
pub fn create_pulse_with_metrics(
    state: State<'_, Mutex<Connection>>,
    name: String,
    icon: String,
    metrics: Vec<PulseMetricEntry>,
) -> Result<Pulse> {
    let mut conn = state.lock().unwrap();
    create_pulse_with_metrics_in(&mut conn, &name, &icon, &metrics, now_unix_secs())
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

pub(crate) fn is_id_permutation(existing: &[i64], proposed: &[i64]) -> bool {
    if existing.len() != proposed.len() {
        return false;
    }
    let unique: std::collections::HashSet<_> = proposed.iter().copied().collect();
    unique.len() == proposed.len() && existing.iter().all(|id| unique.contains(id))
}

pub(crate) fn set_pulse_order(conn: &Connection, ids: &[i64]) -> Result<()> {
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

pub(crate) fn set_pulse_metric_order(
    conn: &Connection,
    pulse_id: i64,
    metric_ids: &[i64],
) -> Result<()> {
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
/// Writes the check-in row and one row per rating, so it takes the transaction
/// rather than the pooled connection: a mid-loop failure must not leave a
/// check-in with only some of its ratings.
pub(crate) fn record_metric_check_in(
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
    let now = now_unix_secs();
    let check_in = record_metric_check_in(&tx, pulse_id, &ratings, now)?;
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
    query_metric_check_ins(&conn, from, to)
}

pub(crate) fn query_metric_check_ins(
    conn: &Connection,
    from: i64,
    to: i64,
) -> Result<Vec<MetricCheckInWithRatings>> {
    let mut ci_stmt = conn.prepare(
        "SELECT id, created_at, pulse_id, pulse_name FROM metric_check_ins \
         WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC",
    )?;
    let mut result: Vec<MetricCheckInWithRatings> = ci_stmt
        .query_map(params![from, to], |row| {
            Ok(MetricCheckInWithRatings {
                check_in: MetricCheckIn {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    pulse_id: row.get(2)?,
                    pulse_name: row.get(3)?,
                },
                ratings: Vec::new(),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let positions: HashMap<i64, usize> = result
        .iter()
        .enumerate()
        .map(|(index, item)| (item.check_in.id, index))
        .collect();

    // Join on the same range rather than IN (ids...): one query, and a 30-day
    // range can't outgrow SQLite's bound-parameter limit.
    let mut r_stmt = conn.prepare(
        "SELECT r.check_in_id, r.metric_id, r.value FROM metric_ratings r \
         JOIN metric_check_ins ci ON ci.id = r.check_in_id \
         WHERE ci.created_at >= ?1 AND ci.created_at < ?2 \
         ORDER BY r.check_in_id, r.metric_id",
    )?;
    let ratings = r_stmt.query_map(params![from, to], |row| {
        Ok(MetricRating {
            check_in_id: row.get(0)?,
            metric_id: row.get(1)?,
            value: row.get(2)?,
        })
    })?;
    for rating in ratings {
        let rating = rating?;
        if let Some(index) = positions.get(&rating.check_in_id) {
            result[*index].ratings.push(rating);
        }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::migrations;

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

        set_pulse_order(&conn, &[2, 1]).unwrap();
        let pulse_ids: Vec<i64> = conn
            .prepare("SELECT id FROM pulses ORDER BY sort_order ASC, id ASC")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert_eq!(pulse_ids, vec![2, 1]);

        set_pulse_metric_order(&conn, 1, &[11, 10]).unwrap();
        assert_eq!(fetch_pulse(&conn, 1).unwrap().metric_ids, vec![11, 10]);
        assert!(set_pulse_order(&conn, &[1]).is_err());
        assert!(set_pulse_metric_order(&conn, 1, &[10]).is_err());
    }

    fn seeded_metrics() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute_batch(
            "INSERT INTO pulses (id, name, created_at, sort_order) VALUES (1, 'Morning', 1, 0);
             INSERT INTO metrics (id, name, created_at) \
             VALUES (10, 'Energy', 1), (11, 'Mood', 2);
             INSERT INTO pulse_metrics (pulse_id, metric_id, sort_order) VALUES (1, 10, 0);",
        )
        .unwrap();
        conn
    }

    /// Pulses, Metrics, and memberships as stored, to compare before and after.
    fn stored_metric_setup(conn: &Connection) -> Vec<String> {
        let mut rows = Vec::new();
        for query in [
            "SELECT 'pulse ' || id || ' ' || name || ' ' || icon FROM pulses ORDER BY id",
            "SELECT 'metric ' || id || ' ' || name || ' ' || icon || ' ' || COALESCE(color, '-') \
             FROM metrics ORDER BY id",
            "SELECT 'member ' || pulse_id || ' ' || metric_id || ' ' || sort_order \
             FROM pulse_metrics ORDER BY pulse_id, metric_id",
        ] {
            let mut stmt = conn.prepare(query).unwrap();
            rows.extend(
                stmt.query_map([], |row| row.get::<_, String>(0))
                    .unwrap()
                    .map(|row| row.unwrap()),
            );
        }
        rows
    }

    fn new_metric(name: &str) -> PulseMetricEntry {
        PulseMetricEntry::New {
            name: name.into(),
            icon: "activity".into(),
            color: None,
        }
    }

    fn existing_metric(id: i64, name: &str) -> PulseMetricEntry {
        PulseMetricEntry::Existing {
            id,
            name: name.into(),
            icon: "activity".into(),
            color: None,
        }
    }

    #[test]
    fn creates_a_pulse_with_new_and_existing_metrics_in_order() {
        let mut conn = seeded_metrics();
        let entries = [
            new_metric("  Focus  "),
            PulseMetricEntry::Existing {
                id: 10,
                name: "Energy level".into(),
                icon: "zap".into(),
                color: Some("#abc".into()),
            },
        ];

        let pulse =
            create_pulse_with_metrics_in(&mut conn, "  Evening ", "moon", &entries, 50).unwrap();

        assert_eq!(pulse.name, "Evening");
        assert_eq!(pulse.icon, "moon");
        let focus_id: i64 = conn
            .query_row("SELECT id FROM metrics WHERE name = 'Focus'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(pulse.metric_ids, vec![focus_id, 10]);
        let energy = fetch_metric(&conn, 10).unwrap();
        assert_eq!(
            (
                energy.name.as_str(),
                energy.icon.as_str(),
                energy.color.as_deref()
            ),
            ("Energy level", "zap", Some("#abc"))
        );
        // The Metric is shared, so its first Pulse keeps it.
        assert_eq!(fetch_pulse(&conn, 1).unwrap().metric_ids, vec![10]);
    }

    #[test]
    fn rolls_back_a_pulse_creation_that_fails_after_its_first_writes() {
        let mut conn = seeded_metrics();
        // Validation passes, so the Pulse, the new Metric, its membership, and
        // the edit to Energy are all written before Mood's membership aborts.
        conn.execute_batch(
            "CREATE TRIGGER fail_mood_membership BEFORE INSERT ON pulse_metrics \
             WHEN NEW.metric_id = 11 \
             BEGIN SELECT RAISE(ABORT, 'forced failure'); END;",
        )
        .unwrap();
        let before = stored_metric_setup(&conn);
        let entries = [
            new_metric("Focus"),
            PulseMetricEntry::Existing {
                id: 10,
                name: "Energy level".into(),
                icon: "zap".into(),
                color: Some("#abc".into()),
            },
            existing_metric(11, "Mood"),
        ];

        let result = create_pulse_with_metrics_in(&mut conn, "Evening", "moon", &entries, 50);

        assert!(matches!(result, Err(AppError::Sqlite(_))));
        assert_eq!(stored_metric_setup(&conn), before);
    }

    #[test]
    fn rejects_an_invalid_pulse_creation_before_writing() {
        let mut conn = seeded_metrics();
        let before = stored_metric_setup(&conn);
        let colored = |color: &str| PulseMetricEntry::New {
            name: "Focus".into(),
            icon: "activity".into(),
            color: Some(color.into()),
        };
        let with_icon = |icon: &str| PulseMetricEntry::New {
            name: "Focus".into(),
            icon: icon.into(),
            color: None,
        };
        let rejected: [(&str, &str, Vec<PulseMetricEntry>); 10] = [
            ("  ", "moon", vec![]),
            ("Evening", "Not An Icon", vec![]),
            ("Evening", "moon", vec![new_metric("  ")]),
            ("Evening", "moon", vec![with_icon("Not An Icon")]),
            ("Evening", "moon", vec![colored("red")]),
            // The same existing Metric twice.
            (
                "Evening",
                "moon",
                vec![existing_metric(10, "Energy"), existing_metric(10, "Vigor")],
            ),
            // An existing Metric that is not stored.
            ("Evening", "moon", vec![existing_metric(99, "Calm")]),
            // A new name taken by a Metric outside the list.
            ("Evening", "moon", vec![new_metric("Mood")]),
            // Two entries ending up with one name.
            (
                "Evening",
                "moon",
                vec![new_metric("Focus"), new_metric(" Focus ")],
            ),
            // A rename onto a Metric outside the list.
            ("Evening", "moon", vec![existing_metric(10, "Mood")]),
        ];

        for (name, icon, entries) in rejected {
            let result = create_pulse_with_metrics_in(&mut conn, name, icon, &entries, 50);
            assert!(
                matches!(
                    result,
                    Err(AppError::InvalidInput(_) | AppError::NotFound(_))
                ),
                "{name:?} {icon:?} {entries:?} gave {result:?}"
            );
            assert_eq!(stored_metric_setup(&conn), before);
        }
    }

    #[test]
    fn lists_metric_check_ins_with_their_own_ratings() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute_batch(
            "INSERT INTO metrics (id, name, created_at) VALUES (10, 'Energy', 1), (11, 'Mood', 2);
             INSERT INTO metric_check_ins (id, created_at) \
             VALUES (1, 100), (2, 200), (3, 900), (4, 500), (5, 0);
             INSERT INTO metric_ratings (check_in_id, metric_id, value) \
             VALUES (1, 11, 2), (1, 10, 4), (2, 10, 5), (3, 10, 1), (4, 10, 3), (5, 11, 1);",
        )
        .unwrap();

        let listed = query_metric_check_ins(&conn, 0, 500).unwrap();
        let shape: Vec<(i64, Vec<(i64, i32)>)> = listed
            .iter()
            .map(|item| {
                (
                    item.check_in.id,
                    item.ratings
                        .iter()
                        .map(|r| (r.metric_id, r.value))
                        .collect(),
                )
            })
            .collect();
        // [from, to): 0 is in, 500 is out, and ratings stay on their own check-in.
        assert_eq!(
            shape,
            vec![
                (2, vec![(10, 5)]),
                (1, vec![(10, 4), (11, 2)]),
                (5, vec![(11, 1)]),
            ]
        );
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
