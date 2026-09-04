//! Persist the popup's last user-dragged position for each macOS display.
//! Writes only after a real drag, on hide — never on programmatic place/show.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

static ORIGIN_PATH: OnceLock<PathBuf> = OnceLock::new();
static USER_DRAGGED: AtomicBool = AtomicBool::new(false);

pub type DisplayId = u32;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Origin {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct VisibleFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

type SavedOrigins = HashMap<DisplayId, Origin>;

pub fn install(app_data_dir: PathBuf) {
    let _ = ORIGIN_PATH.set(app_data_dir.join("popup_origin.json"));
}

/// Frontend calls this when the user starts a window drag.
pub fn mark_user_drag() {
    USER_DRAGGED.store(true, Ordering::SeqCst);
}

pub fn clear_user_drag() {
    USER_DRAGGED.store(false, Ordering::SeqCst);
}

pub fn user_dragged() -> bool {
    USER_DRAGGED.load(Ordering::SeqCst)
}

pub fn load(display_id: DisplayId) -> Option<Origin> {
    load_from(ORIGIN_PATH.get()?).get(&display_id).copied()
}

pub fn save(display_id: DisplayId, origin: Origin) {
    let Some(path) = ORIGIN_PATH.get() else {
        return;
    };
    save_to(path, display_id, origin);
}

fn save_to(path: &Path, display_id: DisplayId, origin: Origin) {
    let mut origins = load_from(path);
    origins.insert(display_id, origin);
    if let Ok(json) = serde_json::to_string(&origins) {
        let _ = fs::write(path, json);
    }
}

fn load_from(path: &Path) -> SavedOrigins {
    fs::read(path)
        .ok()
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

pub fn relative_origin(origin: Origin, frame: VisibleFrame) -> Origin {
    Origin {
        x: origin.x - frame.x,
        y: origin.y - frame.y,
    }
}

pub fn restored_origin(
    relative: Origin,
    window_width: f64,
    window_height: f64,
    frame: VisibleFrame,
) -> Option<Origin> {
    if window_width <= 0.0
        || window_height <= 0.0
        || window_width > frame.width
        || window_height > frame.height
        || !relative.x.is_finite()
        || !relative.y.is_finite()
    {
        return None;
    }
    Some(Origin {
        x: frame.x + relative.x.clamp(0.0, frame.width - window_width),
        y: frame.y + relative.y.clamp(0.0, frame.height - window_height),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("nest-popup-origin-{nanos}.json"))
    }

    #[test]
    fn stores_independent_positions_for_each_display() {
        let path = temporary_path();
        save_to(&path, 1, Origin { x: 12.5, y: 40.0 });
        save_to(&path, 2, Origin { x: 50.0, y: 60.0 });

        let stored = load_from(&path);
        assert_eq!(stored.get(&1), Some(&Origin { x: 12.5, y: 40.0 }));
        assert_eq!(stored.get(&2), Some(&Origin { x: 50.0, y: 60.0 }));
        assert_eq!(stored.get(&3), None);
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn legacy_origin_falls_back_to_empty_positions() {
        let path = temporary_path();
        fs::write(&path, r#"{"x":12.5,"y":-40.0}"#).unwrap();
        assert!(load_from(&path).is_empty());
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn relative_position_survives_screen_rearrangement() {
        let relative = relative_origin(
            Origin {
                x: -1300.0,
                y: 240.0,
            },
            VisibleFrame {
                x: -1440.0,
                y: 0.0,
                width: 1440.0,
                height: 900.0,
            },
        );
        assert_eq!(relative, Origin { x: 140.0, y: 240.0 });
        assert_eq!(
            restored_origin(
                relative,
                760.0,
                540.0,
                VisibleFrame {
                    x: 1920.0,
                    y: 100.0,
                    width: 1440.0,
                    height: 900.0,
                },
            ),
            Some(Origin {
                x: 2060.0,
                y: 340.0
            })
        );
    }

    #[test]
    fn clamps_restored_position_inside_visible_frame() {
        assert_eq!(
            restored_origin(
                Origin { x: 900.0, y: -20.0 },
                760.0,
                540.0,
                VisibleFrame {
                    x: 100.0,
                    y: 50.0,
                    width: 1440.0,
                    height: 900.0,
                },
            ),
            Some(Origin { x: 780.0, y: 50.0 })
        );
    }

    #[test]
    fn rejects_window_larger_than_visible_frame() {
        assert_eq!(
            restored_origin(
                Origin { x: 0.0, y: 0.0 },
                1500.0,
                540.0,
                VisibleFrame {
                    x: 0.0,
                    y: 0.0,
                    width: 1440.0,
                    height: 900.0,
                },
            ),
            None
        );
    }

    #[test]
    fn user_drag_flag_round_trips() {
        clear_user_drag();
        assert!(!user_dragged());
        mark_user_drag();
        assert!(user_dragged());
        clear_user_drag();
        assert!(!user_dragged());
    }
}
