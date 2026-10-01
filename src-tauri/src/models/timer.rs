use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerState {
    pub interval_minutes: i64,
    pub next_due_at: i64,
    pub waiting_for_response: bool,
}
