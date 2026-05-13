mod commands;
mod db;
mod error;
mod migrations;
mod models;

use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
const HOTKEY_MODIFIERS: Modifiers = Modifiers::from_bits_truncate(
    Modifiers::SUPER.bits() | Modifiers::SHIFT.bits(),
);
#[cfg(not(target_os = "macos"))]
const HOTKEY_MODIFIERS: Modifiers = Modifiers::from_bits_truncate(
    Modifiers::CONTROL.bits() | Modifiers::SHIFT.bits(),
);

#[cfg(target_os = "macos")]
const HOTKEY_LABEL: &str = "⌘⇧E";
#[cfg(target_os = "macos")]
const WORK_HOTKEY_LABEL: &str = "⌘⇧W";
#[cfg(not(target_os = "macos"))]
const HOTKEY_LABEL: &str = "Ctrl+Shift+E";
#[cfg(not(target_os = "macos"))]
const WORK_HOTKEY_LABEL: &str = "Ctrl+Shift+W";

fn show_window(app: &tauri::AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn hide_popup_from_mission_control(window: &tauri::WebviewWindow) {
    use cocoa::appkit::{NSWindow, NSWindowCollectionBehavior};
    use cocoa::base::id;

    let Ok(ns_window_ptr) = window.ns_window() else {
        return;
    };
    let ns_window = ns_window_ptr as id;
    let behavior = NSWindowCollectionBehavior::NSWindowCollectionBehaviorCanJoinAllSpaces
        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorTransient
        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorStationary
        | NSWindowCollectionBehavior::NSWindowCollectionBehaviorIgnoresCycle;
    unsafe {
        ns_window.setCollectionBehavior_(behavior);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let summon_shortcut = Shortcut::new(Some(HOTKEY_MODIFIERS), Code::KeyE);
    // Cmd+Shift+W (or Ctrl+Shift+W) summons the work check-in popup.
    let summon_work_shortcut = Shortcut::new(Some(HOTKEY_MODIFIERS), Code::KeyW);

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    if shortcut == &summon_shortcut {
                        show_window(app, "popup");
                    } else if shortcut == &summon_work_shortcut {
                        show_window(app, "work-popup");
                    }
                })
                .build(),
        )
        .setup(move |app| {
            // Database
            let app_data = app.path().app_data_dir()?;
            let db_path = app_data.join("nest.db");
            let conn = db::open(&db_path)?;
            app.manage(Mutex::new(conn));

            // macOS: hide popup from Mission Control / Cmd+Tab
            #[cfg(target_os = "macos")]
            {
                if let Some(popup) = app.get_webview_window("popup") {
                    hide_popup_from_mission_control(&popup);
                }
                if let Some(work_popup) = app.get_webview_window("work-popup") {
                    hide_popup_from_mission_control(&work_popup);
                }
            }

            // Global hotkeys — non-fatal: if a combo is already owned by another app,
            // keep launching and surface the problem via the tray menu + tooltip.
            let main_hotkey_ok = match app.global_shortcut().register(summon_shortcut) {
                Ok(()) => true,
                Err(e) => {
                    eprintln!(
                        "nest: failed to register hotkey {HOTKEY_LABEL}: {e}. \
                         Use the tray icon to open the app."
                    );
                    false
                }
            };
            let work_hotkey_ok = match app.global_shortcut().register(summon_work_shortcut) {
                Ok(()) => true,
                Err(e) => {
                    eprintln!(
                        "nest: failed to register hotkey {WORK_HOTKEY_LABEL}: {e}."
                    );
                    false
                }
            };

            // Tray menu: prepend a disabled warning item for each unavailable hotkey.
            let menu = Menu::new(app)?;
            if !main_hotkey_ok {
                let item = MenuItem::with_id(
                    app,
                    "main_hotkey_warn",
                    format!("⚠ Hotkey {HOTKEY_LABEL} unavailable"),
                    false,
                    None::<&str>,
                )?;
                menu.append(&item)?;
            }
            if !work_hotkey_ok {
                let item = MenuItem::with_id(
                    app,
                    "work_hotkey_warn",
                    format!("⚠ Hotkey {WORK_HOTKEY_LABEL} unavailable"),
                    false,
                    None::<&str>,
                )?;
                menu.append(&item)?;
            }
            if !main_hotkey_ok || !work_hotkey_ok {
                menu.append(&PredefinedMenuItem::separator(app)?)?;
            }
            let open_dashboard = MenuItem::with_id(
                app,
                "open_dashboard",
                "Open Dashboard",
                true,
                None::<&str>,
            )?;
            menu.append(&open_dashboard)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            menu.append(&quit)?;

            let tooltip = if main_hotkey_ok && work_hotkey_ok {
                format!("Nest — {HOTKEY_LABEL} for a check-in")
            } else {
                "Nest — hotkey unavailable".to_string()
            };

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip(&tooltip)
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open_dashboard" => show_window(app, "dashboard"),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_metrics,
            commands::create_metric,
            commands::rename_metric,
            commands::set_metric_active,
            commands::submit_check_in,
            commands::submit_work_check_in,
            commands::list_check_ins,
            commands::delete_check_in,
            commands::metric_series,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
