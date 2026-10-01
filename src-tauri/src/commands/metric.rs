use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

use super::shared::{valid_color, valid_icon};
use crate::error::{AppError, Result};
use crate::models::{
    Metric, MetricCheckIn, MetricCheckInSchedule, MetricCheckInWithRatings, MetricRating,
    MetricRatingInput, Pulse,
};
use crate::time::now_unix_secs;

pub(crate) const METRIC_CHECK_IN_INTERVAL_MINUTES: i64 = 15;
pub(crate) const METRIC_CHECK_IN_MAX_INTERVAL_MINUTES: i64 = 120;

pub(crate) fn validate_metric_check_in_interval(minutes: i64) -> Result<i64> {
    if (METRIC_CHECK_IN_INTERVAL_MINUTES..=METRIC_CHECK_IN_MAX_INTERVAL_MINUTES)
        .contains(&minutes)
        && minutes % METRIC_CHECK_IN_INTERVAL_MINUTES == 0
    {
        Ok(minutes)
    } else {
        Err(AppError::InvalidInput(
            "Metric check-in interval must be 15 to 120 minutes in 15-minute steps".into(),
        ))
    }
}

pub(crate) fn metric_check_in_schedule(conn: &Connection) -> Result<MetricCheckInSchedule> {
    conn.query_row(
        "SELECT interval_minutes, next_due_at FROM metric_check_in_schedule WHERE id = 1",
        [],
        |row| {
            Ok(MetricCheckInSchedule {
                interval_minutes: row.get(0)?,
                next_due_at: row.get(1)?,
            })
        },
    )
    .map_err(Into::into)
}

pub(crate) fn advance_metric_check_in_schedule(tx: &Transaction<'_>, now: i64) -> Result<()> {
    let interval_minutes: i64 = tx.query_row(
        "SELECT interval_minutes FROM metric_check_in_schedule WHERE id = 1",
        [],
        |row| row.get(0),
    )?;
    tx.execute(
        "UPDATE metric_check_in_schedule SET next_due_at = ?1 WHERE id = 1",
        params![now + interval_minutes * 60],
    )?;
    Ok(())
}

pub(crate) fn update_metric_check_in_interval(
    conn: &Connection,
    minutes: i64,
) -> Result<MetricCheckInSchedule> {
    let minutes = validate_metric_check_in_interval(minutes)?;
    conn.execute(
        "UPDATE metric_check_in_schedule SET interval_minutes = ?1 WHERE id = 1",
        params![minutes],
    )?;
    metric_check_in_schedule(conn)
}
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

pub(crate) fn set_pulse_metric_order(conn: &Connection, pulse_id: i64, metric_ids: &[i64]) -> Result<()> {
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
    advance_metric_check_in_schedule(&tx, now)?;
    tx.commit()?;
    Ok(check_in)
}

#[tauri::command]
pub fn get_metric_check_in_schedule(
    state: State<'_, Mutex<Connection>>,
) -> Result<MetricCheckInSchedule> {
    metric_check_in_schedule(&state.lock().unwrap())
}

#[tauri::command]
pub fn set_metric_check_in_interval(
    state: State<'_, Mutex<Connection>>,
    minutes: i64,
) -> Result<MetricCheckInSchedule> {
    let conn = state.lock().unwrap();
    update_metric_check_in_interval(&conn, minutes)
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
        assert_eq!(
            fetch_pulse(&conn, 1).unwrap().metric_ids,
            vec![11, 10]
        );
        assert!(set_pulse_order(&conn, &[1]).is_err());
        assert!(set_pulse_metric_order(&conn, 1, &[10]).is_err());
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
                    item.ratings.iter().map(|r| (r.metric_id, r.value)).collect(),
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

    #[test]
    fn metric_check_in_schedule_advances_with_its_saved_interval() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        let initial = metric_check_in_schedule(&conn).unwrap();
        let updated = update_metric_check_in_interval(&conn, 120).unwrap();
        assert_eq!(updated.interval_minutes, 120);
        assert_eq!(updated.next_due_at, initial.next_due_at);

        let tx = conn.transaction().unwrap();
        advance_metric_check_in_schedule(&tx, 1_000).unwrap();
        tx.commit().unwrap();

        let next_due_at: i64 = conn
            .query_row(
                "SELECT next_due_at FROM metric_check_in_schedule WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(next_due_at, 8_200);
        assert!(validate_metric_check_in_interval(15).is_ok());
        assert!(validate_metric_check_in_interval(120).is_ok());
        assert!(validate_metric_check_in_interval(125).is_err());
    }
}
