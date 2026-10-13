use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub status: String,
    pub working_now: bool,
    pub worked_seconds: i64,
    pub work_started_at: Option<i64>,
    pub scope: Option<String>,
    pub value: Option<i64>,
    pub effort: Option<i64>,
    pub parent_task_id: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    /// None while the Task is open.
    pub closed_at: Option<i64>,
    /// The closed Task this one was created as a follow-up to.
    pub follows_task_id: Option<i64>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWorkStretch {
    pub id: i64,
    pub task_id: i64,
    pub started_at: i64,
    /// None while the stretch is still open, i.e. the task is Working now.
    pub ended_at: Option<i64>,
}
