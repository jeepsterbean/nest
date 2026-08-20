//! Persist the popup's last user-dragged origin (macOS screen coords).
//! Writes only after a real drag, on hide — never on programmatic place/show.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;

static ORIGIN_PATH: OnceLock<PathBuf> = OnceLock::new();
static USER_DRAGGED: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct Origin {
    pub x: f64,
    pub y: f64,
}

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

pub fn load() -> Option<Origin> {
    let path = ORIGIN_PATH.get()?;
    load_from(path)
}

pub fn save(origin: Origin) {
    let Some(path) = ORIGIN_PATH.get() else {
        return;
    };
    if let Ok(json) = serde_json::to_string(&origin) {
        let _ = fs::write(path, json);
    }
}

fn load_from(path: &Path) -> Option<Origin> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Cocoa bottom-left origin + size; screens are visible frames `(x, y, w, h)`.
/// Usable when the window center sits inside at least one screen.
pub fn origin_is_usable(
    origin: Origin,
    width: f64,
    height: f64,
    screens: &[(f64, f64, f64, f64)],
) -> bool {
    if width <= 0.0 || height <= 0.0 || screens.is_empty() {
        return false;
    }
    let cx = origin.x + width / 2.0;
    let cy = origin.y + height / 2.0;
    screens.iter().any(|&(sx, sy, sw, sh)| {
        cx >= sx && cx <= sx + sw && cy >= sy && cy <= sy + sh
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn rejects_empty_screens_or_bad_size() {
        let origin = Origin { x: 10.0, y: 10.0 };
        assert!(!origin_is_usable(origin, 100.0, 100.0, &[]));
        assert!(!origin_is_usable(
            origin,
            0.0,
            100.0,
            &[(0.0, 0.0, 800.0, 600.0)]
        ));
    }

    #[test]
    fn accepts_center_inside_a_screen() {
        let screens = [(0.0, 0.0, 1440.0, 900.0), (1440.0, 0.0, 1920.0, 1080.0)];
        let on_left = Origin { x: 200.0, y: 100.0 };
        assert!(origin_is_usable(on_left, 760.0, 540.0, &screens));
        let on_right = Origin {
            x: 1440.0 + 100.0,
            y: 200.0,
        };
        assert!(origin_is_usable(on_right, 760.0, 540.0, &screens));
    }

    #[test]
    fn rejects_fully_off_screen() {
        let screens = [(0.0, 0.0, 1440.0, 900.0)];
        let origin = Origin {
            x: 5000.0,
            y: 5000.0,
        };
        assert!(!origin_is_usable(origin, 760.0, 540.0, &screens));
    }

    #[test]
    fn round_trips_json_file() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("nest-popup-origin-{nanos}.json"));
        let origin = Origin { x: 12.5, y: -40.0 };
        fs::write(&path, serde_json::to_string(&origin).unwrap()).unwrap();
        assert_eq!(load_from(&path), Some(origin));
        let _ = fs::remove_file(&path);
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
