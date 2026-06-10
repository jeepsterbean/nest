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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SeriesPoint {
    pub timestamp: i64,
    pub value: i32,
}

/// The broad mode a phase check-in records. Stored as the lowercase keyword in
/// `phase_check_ins.phase`; `Others` carries an optional free-text label.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Decluttering,
    Scoping,
    Doing,
    Resting,
    Others,
}

impl Phase {
    pub fn as_db(self) -> &'static str {
        match self {
            Phase::Decluttering => "decluttering",
            Phase::Scoping => "scoping",
            Phase::Doing => "doing",
            Phase::Resting => "resting",
            Phase::Others => "others",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseCheckIn {
    pub id: i64,
    pub created_at: i64,
    pub phase: Phase,
    pub phase_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskCheckIn {
    pub id: i64,
    pub created_at: i64,
    pub task: String,
    pub next_check_in_minutes: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainDump {
    pub id: i64,
    pub created_at: i64,
    pub text: String,
}
