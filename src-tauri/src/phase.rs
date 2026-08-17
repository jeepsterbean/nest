use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, Result};
use crate::models::PhaseCheckIn;
use crate::time::now_unix_secs;

pub const PHASE_DOING: &str = "Doing";
pub const PHASE_SCOPING: &str = "Scoping";
pub const PHASE_RESTING: &str = "Resting";
pub const PHASE_OFFLINE: &str = "Offline";
const NOTION_BUNDLE_ID: &str = "notion.id";
const NEST_BUNDLE_ID: &str = "com.huwenjie.nest";

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PhaseSignals {
    pub dashboard_focused: bool,
    pub popup_visible: bool,
    pub notion_frontmost: bool,
    pub system_offline: bool,
}

/// Priority: Working now, then lock/sleep, then Nest/Notion engagement, then Resting.
/// Lock/sleep clears Working now before this runs, so Offline cannot lose to Doing.
pub fn derived_phase(working: bool, signals: PhaseSignals) -> &'static str {
    if working {
        PHASE_DOING
    } else if signals.system_offline {
        PHASE_OFFLINE
    } else if signals.dashboard_focused || signals.popup_visible || signals.notion_frontmost {
        PHASE_SCOPING
    } else {
        PHASE_RESTING
    }
}

/// Attention left the dashboard. Accessory Nest can keep a key window on
/// one display after the user clicks another, so this clears focus rather
/// than trusting `is_focused()`.
pub fn apply_left_dashboard(signals: &mut PhaseSignals, notion_frontmost: bool) {
    signals.dashboard_focused = false;
    signals.notion_frontmost = notion_frontmost;
}

pub fn with_current_signals<T>(app: &AppHandle, f: impl FnOnce(PhaseSignals) -> T) -> T {
    let state = app.state::<Mutex<PhaseSignals>>();
    let signals = state.lock().unwrap();
    f(*signals)
}

pub fn update_signals_and_sync(app: &AppHandle, update: impl FnOnce(&mut PhaseSignals)) {
    let changed = {
        let state = app.state::<Mutex<PhaseSignals>>();
        let mut signals = state.lock().unwrap();
        update(&mut signals);
        let connection = app.state::<Mutex<rusqlite::Connection>>();
        let conn = connection.lock().unwrap();
        match sync_derived_phase(&conn, *signals, now_unix_secs()) {
            Ok(changed) => changed,
            Err(error) => {
                eprintln!("nest: phase sync failed: {error}");
                None
            }
        }
    };
    emit_phase_changed(app, changed);
}

pub fn emit_phase_changed(app: &AppHandle, name: Option<String>) {
    if let Some(name) = name {
        let _ = app.emit("phase-changed", name);
    }
}

/// Read Working now from the same connection/transaction, then insert if changed.
pub fn sync_derived_phase(
    conn: &Connection,
    signals: PhaseSignals,
    now: i64,
) -> Result<Option<String>> {
    let working = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM tasks WHERE working_now = 1)",
        [],
        |row| row.get::<_, bool>(0),
    )?;
    let name = derived_phase(working, signals);
    let phase_id = fetch_active_phase_id(conn, name)?;
    Ok(record_phase_if_changed(conn, Some(phase_id), now)?.map(|_| name.to_string()))
}

pub fn notion_is_frontmost() -> bool {
    macos_frontmost_bundle_is(NOTION_BUNDLE_ID)
}

pub fn nest_is_frontmost() -> bool {
    macos_frontmost_bundle_is(NEST_BUNDLE_ID)
}

fn macos_frontmost_bundle_is(bundle_id: &str) -> bool {
    #[cfg(target_os = "macos")]
    {
        use objc2_app_kit::NSWorkspace;

        NSWorkspace::sharedWorkspace()
            .frontmostApplication()
            .and_then(|app| app.bundleIdentifier())
            .is_some_and(|bundle| bundle.to_string() == bundle_id)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = bundle_id;
        false
    }
}

fn fetch_active_phase_id(conn: &Connection, name: &str) -> Result<i64> {
    conn.query_row(
        "SELECT id FROM phases WHERE name = ?1 AND inactive_since IS NULL",
        params![name],
        |row| row.get(0),
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("phase {name}")))
}

pub(crate) fn record_phase_if_changed(
    conn: &Connection,
    phase_id: Option<i64>,
    now: i64,
) -> Result<Option<PhaseCheckIn>> {
    if let Some(phase_id) = phase_id {
        let inactive: Option<i64> = match conn.query_row(
            "SELECT inactive_since FROM phases WHERE id = ?1",
            params![phase_id],
            |row| row.get(0),
        ) {
            Ok(value) => value,
            Err(rusqlite::Error::QueryReturnedNoRows) => {
                return Err(AppError::NotFound(format!("phase {phase_id}")));
            }
            Err(error) => return Err(error.into()),
        };
        if inactive.is_some() {
            return Err(AppError::InvalidInput("phase is inactive".into()));
        }
    }

    let latest: Option<Option<i64>> = conn
        .query_row(
            "SELECT phase_id FROM phase_check_ins ORDER BY created_at DESC, id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if latest == Some(phase_id) {
        return Ok(None);
    }

    conn.execute(
        "INSERT INTO phase_check_ins (created_at, phase_id) VALUES (?1, ?2)",
        params![now, phase_id],
    )?;
    Ok(Some(PhaseCheckIn {
        id: conn.last_insert_rowid(),
        created_at: now,
        phase_id,
        phase_label: None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::migrations;

    fn signals(dashboard: bool, popup: bool, notion: bool) -> PhaseSignals {
        PhaseSignals {
            dashboard_focused: dashboard,
            popup_visible: popup,
            notion_frontmost: notion,
            system_offline: false,
        }
    }

    fn away(engagement: PhaseSignals) -> PhaseSignals {
        PhaseSignals {
            system_offline: true,
            ..engagement
        }
    }

    #[test]
    fn priority_prefers_working_now_then_offline_then_engagement() {
        let engaged = signals(true, true, true);
        assert_eq!(derived_phase(true, engaged), PHASE_DOING);
        assert_eq!(derived_phase(true, PhaseSignals::default()), PHASE_DOING);
        assert_eq!(derived_phase(true, away(engaged)), PHASE_DOING);
        assert_eq!(derived_phase(false, away(engaged)), PHASE_OFFLINE);
        assert_eq!(
            derived_phase(false, away(PhaseSignals::default())),
            PHASE_OFFLINE
        );
        assert_eq!(
            derived_phase(false, signals(true, false, false)),
            PHASE_SCOPING
        );
        assert_eq!(
            derived_phase(false, signals(false, true, false)),
            PHASE_SCOPING
        );
        assert_eq!(
            derived_phase(false, signals(false, false, true)),
            PHASE_SCOPING
        );
        assert_eq!(derived_phase(false, PhaseSignals::default()), PHASE_RESTING);
        assert_eq!(
            derived_phase(false, signals(false, true, false)),
            PHASE_SCOPING
        );
    }

    fn database() -> rusqlite::Connection {
        let mut conn = rusqlite::Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn
    }

    fn phase_ids(conn: &Connection) -> (i64, i64, i64) {
        let id = |name: &str| {
            conn.query_row(
                "SELECT id FROM phases WHERE name = ?1",
                params![name],
                |row| row.get(0),
            )
            .unwrap()
        };
        (id(PHASE_DOING), id(PHASE_SCOPING), id(PHASE_RESTING))
    }

    fn insert_active(conn: &Connection, id: i64, working: bool) {
        conn.execute(
            "INSERT INTO tasks (id, title, status, working_now, created_at, updated_at) \
             VALUES (?1, ?2, 'active', ?3, 1, 1)",
            params![id, id.to_string(), working as i64],
        )
        .unwrap();
    }

    fn names(conn: &Connection) -> Vec<String> {
        conn.prepare(
            "SELECT p.name FROM phase_check_ins c JOIN phases p ON p.id = c.phase_id ORDER BY c.id",
        )
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .collect::<rusqlite::Result<_>>()
        .unwrap()
    }

    #[test]
    fn stopping_or_deleting_one_of_two_working_tasks_stays_doing() {
        let conn = database();
        insert_active(&conn, 1, true);
        insert_active(&conn, 2, true);
        assert_eq!(
            sync_derived_phase(&conn, PhaseSignals::default(), 10)
                .unwrap()
                .as_deref(),
            Some(PHASE_DOING)
        );

        conn.execute("UPDATE tasks SET working_now = 0 WHERE id = 1", [])
            .unwrap();
        assert_eq!(
            sync_derived_phase(&conn, PhaseSignals::default(), 20).unwrap(),
            None
        );

        conn.execute("DELETE FROM tasks WHERE id = 2", []).unwrap();
        assert_eq!(
            sync_derived_phase(&conn, signals(false, false, false), 30)
                .unwrap()
                .as_deref(),
            Some(PHASE_RESTING)
        );
        assert_eq!(names(&conn), vec![PHASE_DOING, PHASE_RESTING]);
    }

    #[test]
    fn last_working_task_derives_from_remaining_signals() {
        let conn = database();
        insert_active(&conn, 1, true);
        sync_derived_phase(&conn, PhaseSignals::default(), 10).unwrap();
        conn.execute("UPDATE tasks SET working_now = 0 WHERE id = 1", [])
            .unwrap();

        assert_eq!(
            sync_derived_phase(&conn, signals(false, true, false), 20)
                .unwrap()
                .as_deref(),
            Some(PHASE_SCOPING)
        );
        assert_eq!(
            sync_derived_phase(&conn, signals(false, false, true), 30).unwrap(),
            None
        );
        assert_eq!(
            sync_derived_phase(&conn, PhaseSignals::default(), 40)
                .unwrap()
                .as_deref(),
            Some(PHASE_RESTING)
        );
    }

    #[test]
    fn dashboard_blur_while_popup_visible_stays_scoping() {
        assert_eq!(
            derived_phase(false, signals(false, true, false)),
            PHASE_SCOPING
        );
    }

    #[test]
    fn leaving_dashboard_clears_stale_key_window_focus() {
        let mut left = signals(true, false, false);
        apply_left_dashboard(&mut left, false);
        assert_eq!(derived_phase(false, left), PHASE_RESTING);

        let mut to_notion = signals(true, false, false);
        apply_left_dashboard(&mut to_notion, true);
        assert_eq!(derived_phase(false, to_notion), PHASE_SCOPING);

        let mut popup_up = signals(true, true, false);
        apply_left_dashboard(&mut popup_up, false);
        assert_eq!(derived_phase(false, popup_up), PHASE_SCOPING);
    }

    #[test]
    fn popup_hide_with_notion_frontmost_stays_scoping() {
        assert_eq!(
            derived_phase(false, signals(false, false, true)),
            PHASE_SCOPING
        );
    }

    #[test]
    fn switching_dashboard_to_notion_does_not_record_resting() {
        let conn = database();
        assert!(sync_derived_phase(&conn, signals(true, false, false), 10)
            .unwrap()
            .is_some());
        assert!(sync_derived_phase(&conn, signals(false, false, true), 20)
            .unwrap()
            .is_none());
        assert_eq!(names(&conn), vec![PHASE_SCOPING]);
    }

    #[test]
    fn repeated_sync_inserts_nothing() {
        let conn = database();
        let rest = PhaseSignals::default();
        assert!(sync_derived_phase(&conn, rest, 10).unwrap().is_some());
        assert!(sync_derived_phase(&conn, rest, 11).unwrap().is_none());
        assert!(sync_derived_phase(&conn, rest, 12).unwrap().is_none());
        let (_, _, resting_id) = phase_ids(&conn);
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM phase_check_ins", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
        let latest: i64 = conn
            .query_row(
                "SELECT phase_id FROM phase_check_ins ORDER BY id DESC LIMIT 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(latest, resting_id);
    }

    #[test]
    fn resting_to_offline_records_a_checkpoint() {
        let conn = database();
        assert_eq!(
            sync_derived_phase(&conn, PhaseSignals::default(), 10)
                .unwrap()
                .as_deref(),
            Some(PHASE_RESTING)
        );
        assert_eq!(
            sync_derived_phase(&conn, away(PhaseSignals::default()), 20)
                .unwrap()
                .as_deref(),
            Some(PHASE_OFFLINE)
        );
        assert_eq!(
            sync_derived_phase(&conn, away(signals(true, true, true)), 21).unwrap(),
            None
        );
        assert_eq!(names(&conn), vec![PHASE_RESTING, PHASE_OFFLINE]);
    }

    #[test]
    fn lock_clears_doing_into_offline_even_with_popup_up() {
        let conn = database();
        insert_active(&conn, 1, true);
        assert_eq!(
            sync_derived_phase(&conn, signals(false, true, false), 10)
                .unwrap()
                .as_deref(),
            Some(PHASE_DOING)
        );
        conn.execute("UPDATE tasks SET working_now = 0 WHERE id = 1", [])
            .unwrap();
        assert_eq!(
            sync_derived_phase(&conn, away(signals(false, true, false)), 20)
                .unwrap()
                .as_deref(),
            Some(PHASE_OFFLINE)
        );
        assert_eq!(names(&conn), vec![PHASE_DOING, PHASE_OFFLINE]);
    }

    #[test]
    fn wake_with_popup_returns_to_scoping() {
        let conn = database();
        sync_derived_phase(&conn, away(signals(false, true, false)), 10).unwrap();
        assert_eq!(
            sync_derived_phase(&conn, signals(false, true, false), 20)
                .unwrap()
                .as_deref(),
            Some(PHASE_SCOPING)
        );
    }

    #[test]
    fn wake_without_engagement_returns_to_resting() {
        let conn = database();
        sync_derived_phase(&conn, away(PhaseSignals::default()), 10).unwrap();
        assert_eq!(
            sync_derived_phase(&conn, PhaseSignals::default(), 20)
                .unwrap()
                .as_deref(),
            Some(PHASE_RESTING)
        );
    }
}
