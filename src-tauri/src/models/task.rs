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
    pub value: Option<i64>,
    pub effort: Option<i64>,
    pub parent_task_id: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    /// None while the Task is open.
    pub closed_at: Option<i64>,
    /// The closed Task this one was created as a follow-up to.
    pub follows_task_id: Option<i64>,
    /// Changes whenever an entry joins or leaves the Task's History, even
    /// within the second updated_at resolves to.
    pub history_revision: i64,
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

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdateCursor {
    pub time: i64,
    pub source: i64,
    pub id: i64,
}

/// A work stretch as History recorded it, before or after a change.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskWorkInterval {
    pub started_at: i64,
    /// None while the stretch was still open.
    pub ended_at: Option<i64>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdate {
    pub cursor: TaskUpdateCursor,
    pub kind: String,
    pub before_value: Option<String>,
    pub after_value: Option<String>,
    /// Set instead of the text values for work corrections and removals.
    pub work_before: Option<TaskWorkInterval>,
    pub work_after: Option<TaskWorkInterval>,
    pub related_task_id: Option<i64>,
    pub related_title: Option<String>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskUpdatePage {
    pub updates: Vec<TaskUpdate>,
    pub has_more: bool,
    pub recording_started_at: i64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEditEvent {
    pub task_id: i64,
    pub update: TaskUpdate,
}
