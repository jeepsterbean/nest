//! Frontend-invoked Tauri commands only, one file per domain. `lib.rs`
//! registers each by its full path so the handler list shows where it lives.

pub(crate) mod metric;
pub(crate) mod note;
pub(crate) mod phase;
mod shared;
pub(crate) mod task;
pub(crate) mod timer;
