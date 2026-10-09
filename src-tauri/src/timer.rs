//! The recurring timer: its cadence rules, in-memory state, and persistence,
//! shared between the timer loop in `lib.rs` and the Timer commands. A valid
//! interval is a multiple of `STEP_MINUTES` within `[MIN_MINUTES, MAX_MINUTES]`.

use rusqlite::{params, Connection};

use crate::error::{AppError, Result};
use crate::models::TimerState;
use crate::time::now_unix_secs;

/// Cadence used when no timer state is persisted yet (or the stored one is bad).
pub const DEFAULT_MINUTES: i64 = 15;
pub const MIN_MINUTES: i64 = 5;
pub const MAX_MINUTES: i64 = 30;
pub const STEP_MINUTES: i64 = 5;

pub fn is_valid_interval(minutes: i64) -> bool {
    (MIN_MINUTES..=MAX_MINUTES).contains(&minutes) && minutes % STEP_MINUTES == 0
}

pub(crate) fn persist_timer_waiting(conn: &Connection, waiting: bool) -> Result<()> {
    conn.execute(
        "UPDATE timer_schedule SET waiting_for_response = ?1 WHERE id = 1",
        params![if waiting { 1 } else { 0 }],
    )?;
    Ok(())
}

fn validate_timer_interval(minutes: i64) -> Result<i64> {
    if !is_valid_interval(minutes) {
        return Err(AppError::InvalidInput(
            "timer interval must be 5, 10, 15, 20, 25, or 30 minutes".into(),
        ));
    }
    Ok(minutes)
}

// Cadence of the recurring popup. At zero it pauses until an interval pick.
pub struct Timer {
    pub interval_minutes: i64,
    pub next_due_at: i64,
    pub waiting_for_response: bool,
}

impl Timer {
    pub(crate) fn pause_if_due(&mut self, now: i64) -> bool {
        if self.waiting_for_response || now < self.next_due_at {
            return false;
        }
        self.waiting_for_response = true;
        true
    }
}

pub(crate) fn load_timer(conn: &Connection) -> Timer {
    let now = now_unix_secs();
    let persisted = conn
        .query_row(
            "SELECT interval_minutes, next_due_at, waiting_for_response FROM timer_schedule WHERE id = 1",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?, row.get::<_, i64>(2)?)),
        )
        .ok();

    let (interval_minutes, next_due_at, waiting_for_response) = match persisted {
        Some((minutes, due_at, waiting)) if is_valid_interval(minutes) => {
            (minutes, due_at, waiting != 0)
        }
        // Missing row or a bad interval (corrupt/hand-edited db): fall back to
        // the default cadence starting now.
        _ => (DEFAULT_MINUTES, now + DEFAULT_MINUTES * 60, false),
    };

    crate::append_diagnostic_log(format!(
        "timer_loaded interval_minutes={interval_minutes} next_due_at={next_due_at} now={now} overdue={} waiting_for_response={}",
        next_due_at <= now,
        waiting_for_response
    ));

    Timer {
        interval_minutes,
        next_due_at,
        waiting_for_response,
    }
}

pub(crate) fn schedule_timer(
    conn: &Connection,
    timer: &mut Timer,
    minutes: i64,
    now: i64,
) -> Result<TimerState> {
    let minutes = validate_timer_interval(minutes)?;
    let next_due_at = now + minutes * 60;

    conn.execute(
        "UPDATE timer_schedule SET interval_minutes = ?1, next_due_at = ?2, \
         waiting_for_response = 0 WHERE id = 1",
        params![minutes, next_due_at],
    )?;
    timer.interval_minutes = minutes;
    timer.next_due_at = next_due_at;
    timer.waiting_for_response = false;

    Ok(TimerState {
        interval_minutes: minutes,
        next_due_at,
        waiting_for_response: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::migrations;

    #[test]
    fn due_timer_pauses_until_rescheduled() {
        let mut timer = Timer {
            interval_minutes: 15,
            next_due_at: 100,
            waiting_for_response: false,
        };

        assert!(!timer.pause_if_due(99));
        assert!(timer.pause_if_due(100));
        assert!(!timer.pause_if_due(101));

        timer.next_due_at = 401;
        timer.waiting_for_response = false;
        assert!(!timer.pause_if_due(400));
    }

    #[test]
    fn timer_waiting_flag_round_trips() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        persist_timer_waiting(&conn, true).unwrap();
        let waiting: i64 = conn
            .query_row(
                "SELECT waiting_for_response FROM timer_schedule WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(waiting, 1);
        persist_timer_waiting(&conn, false).unwrap();
        let waiting: i64 = conn
            .query_row(
                "SELECT waiting_for_response FROM timer_schedule WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(waiting, 0);
    }

    #[test]
    fn scheduling_a_timer_updates_memory_and_persistence() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        let mut timer = Timer {
            interval_minutes: 15,
            next_due_at: 100,
            waiting_for_response: true,
        };

        let scheduled = schedule_timer(&conn, &mut timer, 20, 1_000).unwrap();

        assert_eq!(scheduled.interval_minutes, 20);
        assert_eq!(scheduled.next_due_at, 2_200);
        assert!(!scheduled.waiting_for_response);
        assert_eq!(timer.interval_minutes, 20);
        assert_eq!(timer.next_due_at, 2_200);
        assert!(!timer.waiting_for_response);
        let persisted: (i64, i64, i64) = conn
            .query_row(
                "SELECT interval_minutes, next_due_at, waiting_for_response \
                 FROM timer_schedule WHERE id = 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
        assert_eq!(persisted, (20, 2_200, 0));
    }
}
