//! Cadence rules for the recurring timer, shared between the timer loop in
//! `lib.rs` and the `start_timer` command. A valid interval is a
//! multiple of `STEP_MINUTES` within `[MIN_MINUTES, MAX_MINUTES]`.

/// Cadence used when no timer state is persisted yet (or the stored one is bad).
pub const DEFAULT_MINUTES: i64 = 15;
pub const MIN_MINUTES: i64 = 5;
pub const MAX_MINUTES: i64 = 30;
pub const STEP_MINUTES: i64 = 5;

pub fn is_valid_interval(minutes: i64) -> bool {
    (MIN_MINUTES..=MAX_MINUTES).contains(&minutes) && minutes % STEP_MINUTES == 0
}
