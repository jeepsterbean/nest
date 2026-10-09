use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Phase {
    pub id: i64,
    pub name: String,
    pub icon: String,
    pub color: Option<String>,
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
