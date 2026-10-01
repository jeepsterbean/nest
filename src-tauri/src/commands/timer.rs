use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;

use crate::error::Result;
use crate::models::TimerState;
use crate::time::now_unix_secs;
use crate::timer::{schedule_timer, Timer};

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
    let conn = state.lock().unwrap();
    let mut timer = timer.lock().unwrap();
    schedule_timer(&conn, &mut timer, minutes, now_unix_secs())
}
