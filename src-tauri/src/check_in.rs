//! Cadence rules for the recurring check-in popup, shared between the timer in
//! `lib.rs` and the `schedule_next_check_in` command. A valid interval is a
//! multiple of `STEP_MINUTES` within `[MIN_MINUTES, MAX_MINUTES]`.

/// Cadence used when no schedule is persisted yet (or the stored one is bad).
pub const DEFAULT_MINUTES: i64 = 15;
pub const MIN_MINUTES: i64 = 5;
pub const MAX_MINUTES: i64 = 30;
pub const STEP_MINUTES: i64 = 5;

pub fn is_valid_interval(minutes: i64) -> bool {
    (MIN_MINUTES..=MAX_MINUTES).contains(&minutes) && minutes % STEP_MINUTES == 0
}
