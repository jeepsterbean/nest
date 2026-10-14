use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metric {
    pub id: i64,
    pub name: String,
    pub icon: String,
    pub created_at: i64,
    pub color: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pulse {
    pub id: i64,
    pub name: String,
    pub icon: String,
    pub created_at: i64,
    pub metric_ids: Vec<i64>,
}

/// One Metric in a Pulse being created: an existing Metric with the name,
/// icon, and color it should end up with, or a Metric to create.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PulseMetricEntry {
    Existing {
        id: i64,
        name: String,
        icon: String,
        color: Option<String>,
    },
    New {
        name: String,
        icon: String,
        color: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricCheckIn {
    pub id: i64,
    pub created_at: i64,
    pub pulse_id: Option<i64>,
    pub pulse_name: Option<String>,
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
