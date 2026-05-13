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

fn show_window(app: &tauri::AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let summon_shortcut = Shortcut::new(Some(HOTKEY_MODIFIERS), Code::KeyE);

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &summon_shortcut && event.state() == ShortcutState::Pressed {
                        show_window(app, "popup");
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

            // Global hotkey
            app.global_shortcut().register(summon_shortcut)?;

            // Tray icon + menu
            let open_dashboard = MenuItem::with_id(
                app,
                "open_dashboard",
                "Open Dashboard",
                true,
                None::<&str>,
            )?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open_dashboard, &separator, &quit])?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
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
            commands::list_check_ins,
            commands::metric_series,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
