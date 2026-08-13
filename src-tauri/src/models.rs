use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    pub id: i64,
    pub name: String,
    pub created_at: i64,
    pub inactive_since: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricCheckIn {
    pub id: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricRating {
    pub check_in_id: i64,
    pub metric_id: i64,
    pub value: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricRatingInput {
    pub metric_id: i64,
    pub value: i32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricCheckInWithRatings {
    #[serde(flatten)]
    pub check_in: MetricCheckIn,
    pub ratings: Vec<MetricRating>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Phase {
    pub id: i64,
    pub name: String,
    pub created_at: i64,
    pub inactive_since: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseCheckIn {
    pub id: i64,
    pub created_at: i64,
    pub phase_id: Option<i64>,
    pub phase_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub status: String,
    pub working_now: bool,
    pub scope: Option<String>,
    pub value: Option<i64>,
    pub effort: Option<i64>,
    pub parent_task_id: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDependency {
    pub blocker_task_id: i64,
    pub blocked_task_id: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStatusEvent {
    pub id: i64,
    pub task_id: i64,
    pub from_status: Option<String>,
    pub to_status: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckInSchedule {
    pub interval_minutes: i64,
    pub next_due_at: i64,
    pub waiting_for_response: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainDump {
    pub id: i64,
    pub created_at: i64,
    pub title: Option<String>,
    pub text: String,
}
