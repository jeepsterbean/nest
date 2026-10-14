//! Work-stretch bookkeeping that runs on app lifecycle events (startup, quit,
//! lock/sleep, the heartbeat loop) rather than on a frontend request.

use rusqlite::{params, Connection};

use crate::error::Result;
use crate::models::Task;
use crate::task::{fetch_task, touch_task};

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

/// Stamp the last moment work was known live. The WHERE keeps a Nest with no
/// Working now Task off the disk entirely: with nothing open there is nothing to recover.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::migrations;
    use crate::task::tests::{seed_work, stretches, task_database};

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

        // Nothing open: a second launch is a no-op, and with no Working now Task it never
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
    fn bank_all_working_now_banks_every_working_task() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO tasks (id, title, status, created_at, updated_at) \
             VALUES (1, 'A', 'active', 1, 1), (2, 'B', 'active', 1, 1), (3, 'C', 'active', 1, 1)",
            [],
        )
        .unwrap();
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

        let not_working = fetch_task(&conn, 3).unwrap();
        assert!(!not_working.working_now);
        assert_eq!(not_working.worked_seconds, 0);
    }
}
