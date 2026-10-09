use rusqlite::{Connection, Transaction};
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::error::Result;
use crate::phase;
use crate::time::now_unix_secs;

pub(crate) fn valid_color(color: &str) -> bool {
    let bytes = color.as_bytes();
    if bytes.first() != Some(&b'#') {
        return false;
    }
    match bytes.len() {
        4 | 7 => bytes[1..].iter().all(|byte| byte.is_ascii_hexdigit()),
        _ => false,
    }
}

pub(crate) fn valid_icon(icon: &str) -> bool {
    !icon.is_empty()
        && icon.len() <= 32
        && icon
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte == b'-')
}

/// Task mutations that can change Working now must sync Phase in the same
/// transaction, then emit. Lock/sleep Offline is not this path: it also
/// writes PhaseSignals.
pub(crate) fn with_phase_tx<T>(
    app: &AppHandle,
    state: &State<'_, Mutex<Connection>>,
    work: impl FnOnce(&Transaction<'_>) -> Result<T>,
) -> Result<T> {
    let (value, changed) =
        phase::with_current_signals(app, |signals| -> Result<(T, Option<String>)> {
            let mut conn = state.lock().unwrap();
            let tx = conn.transaction()?;
            let value = work(&tx)?;
            let changed = phase::sync_derived_phase(
                &tx,
                signals,
                now_unix_secs(),
                crate::activity::is_idle(),
            )?;
            tx.commit()?;
            Ok((value, changed))
        })?;
    phase::emit_phase_changed(app, changed);
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_safe_icon_keys() {
        assert!(valid_icon("book-heart"));
        assert!(!valid_icon(""));
        assert!(!valid_icon("<svg>"));
    }

    #[test]
    fn accepts_hex_colors() {
        assert!(valid_color("#abc"));
        assert!(valid_color("#1A2b3C"));
        assert!(!valid_color("blue"));
        assert!(!valid_color("#abcd"));
    }
}
