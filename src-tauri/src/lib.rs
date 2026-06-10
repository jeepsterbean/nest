mod commands;
mod db;
mod error;
mod migrations;
mod models;

use std::{
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    sync::{Mutex, OnceLock},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

// The check-in popups are subclassed into this non-activating NSPanel at
// startup. A non-activating panel can become the key window (so the form
// accepts typing) without activating Nest — which is what lets it float over
// another app's native full-screen Space instead of being hidden or yanking
// the user out of full-screen.
#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(NestPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false
        }
    })
}

#[cfg(target_os = "macos")]
const HOTKEY_MODIFIERS: Modifiers =
    Modifiers::from_bits_truncate(Modifiers::SUPER.bits() | Modifiers::SHIFT.bits());
#[cfg(not(target_os = "macos"))]
const HOTKEY_MODIFIERS: Modifiers =
    Modifiers::from_bits_truncate(Modifiers::CONTROL.bits() | Modifiers::SHIFT.bits());

#[cfg(target_os = "macos")]
const HOTKEY_LABEL: &str = "⌘⇧E";
#[cfg(not(target_os = "macos"))]
const HOTKEY_LABEL: &str = "Ctrl+Shift+E";

const DEFAULT_TASK_CHECK_IN_MINUTES: i64 = 15;
const MIN_TASK_CHECK_IN_MINUTES: i64 = 5;
const MAX_TASK_CHECK_IN_MINUTES: i64 = 30;
const TASK_CHECK_IN_STEP_MINUTES: i64 = 5;

static DIAGNOSTIC_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();

fn append_diagnostic_log(message: impl AsRef<str>) {
    let message = message.as_ref();
    let timestamp = now_unix_secs();
    eprintln!("nest[diagnostics][{timestamp}]: {message}");

    let Some(path) = DIAGNOSTIC_LOG_PATH.get() else {
        return;
    };

    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{timestamp}] {message}");
    }
}

fn install_diagnostic_logging(app_data_dir: PathBuf) {
    let log_path = app_data_dir.join("diagnostics.log");
    let _ = DIAGNOSTIC_LOG_PATH.set(log_path.clone());
    append_diagnostic_log(format!("startup diagnostics_log={}", log_path.display()));

    std::panic::set_hook(Box::new(|panic_info| {
        append_diagnostic_log(format!("panic {panic_info}"));
    }));
}

#[tauri::command]
fn log_client_event(message: String) {
    append_diagnostic_log(format!("client {message}"));
}

pub struct TaskCheckInTimer {
    pub interval_minutes: i64,
    pub next_due_at: i64,
}

fn now_unix_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

fn valid_task_interval(minutes: i64) -> bool {
    (MIN_TASK_CHECK_IN_MINUTES..=MAX_TASK_CHECK_IN_MINUTES).contains(&minutes)
        && minutes % TASK_CHECK_IN_STEP_MINUTES == 0
}

fn load_task_check_in_timer(conn: &rusqlite::Connection) -> TaskCheckInTimer {
    let now = now_unix_secs();
    let latest = conn
        .query_row(
            "SELECT created_at, next_check_in_minutes FROM task_check_ins \
             ORDER BY created_at DESC, id DESC LIMIT 1",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .ok();

    let (interval_minutes, next_due_at) = match latest {
        Some((created_at, minutes)) => {
            let interval_minutes = if valid_task_interval(minutes) {
                minutes
            } else {
                DEFAULT_TASK_CHECK_IN_MINUTES
            };
            (interval_minutes, created_at + interval_minutes * 60)
        }
        None => (
            DEFAULT_TASK_CHECK_IN_MINUTES,
            now + DEFAULT_TASK_CHECK_IN_MINUTES * 60,
        ),
    };

    append_diagnostic_log(format!(
        "task_timer_loaded interval_minutes={interval_minutes} next_due_at={next_due_at} now={now} overdue={}",
        next_due_at <= now
    ));

    TaskCheckInTimer {
        interval_minutes,
        next_due_at,
    }
}

fn start_task_check_in_timer(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(30));
        let now = now_unix_secs();
        let due = {
            let timer = app.state::<Mutex<TaskCheckInTimer>>();
            let mut timer = timer.lock().unwrap();
            if now < timer.next_due_at {
                false
            } else {
                let previous_due_at = timer.next_due_at;
                timer.next_due_at = now + timer.interval_minutes * 60;
                append_diagnostic_log(format!(
                    "task_timer_due now={now} previous_due_at={previous_due_at} interval_minutes={} next_due_at={}",
                    timer.interval_minutes, timer.next_due_at
                ));
                true
            }
        };

        if due {
            let app_for_ui = app.clone();
            if let Err(e) = app.run_on_main_thread(move || {
                summon_popup_with_route(&app_for_ui, "popup", "#/popup/task");
            }) {
                append_diagnostic_log(format!("task_timer_main_thread_dispatch_failed error={e}"));
            }
        }
    });
}

fn show_window(app: &tauri::AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn set_popup_route(app: &tauri::AppHandle, label: &str, route: &str) {
    if let Some(window) = app.get_webview_window(label) {
        append_diagnostic_log(format!("popup_set_route label={label} route={route}"));
        let script = format!(
            "try {{ \
             if (window.location.hash !== {route:?}) {{ \
             window.location.hash = {route:?}; \
             }} else {{ \
             window.dispatchEvent(new Event('hashchange')); \
             }} \
             }} catch (error) {{ \
             console.error('nest popup route failed', error); \
             }}"
        );
        if let Err(e) = window.eval(&script) {
            append_diagnostic_log(format!("popup_set_route_failed label={label} route={route} error={e}"));
        }
    } else {
        append_diagnostic_log(format!("popup_set_route_missing_window label={label} route={route}"));
    }
}

fn summon_popup_with_route(app: &tauri::AppHandle, label: &str, route: &str) {
    append_diagnostic_log(format!("popup_summon_with_route label={label} route={route}"));
    set_popup_route(app, label, route);
    summon_popup(app, label);
}

/// Center `window` on the monitor under the mouse cursor, so a summoned popup
/// follows the user's attention across displays instead of always landing on
/// the primary (laptop) screen. "Active screen" is taken to mean the screen
/// the cursor is on — in normal use that's the display you're working on.
/// All math is in physical pixels to stay scale-factor-correct on mixed-DPI
/// setups. Best-effort: on any failure the popup just keeps its prior spot.
/// Center the popup on the screen the mouse pointer is on. Uses macOS's own
/// screen coordinates so the pointer and the screens are measured with the
/// same "ruler" — Tauri's cross-platform cursor/monitor values disagree on
/// mixed-DPI Retina + external-monitor setups. Best-effort: on any failure
/// the popup just keeps its previous position.
#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn center_on_cursor_screen(window: &tauri::WebviewWindow) {
    use cocoa::appkit::{NSEvent, NSScreen, NSWindow};
    use cocoa::base::{id, nil};
    use cocoa::foundation::{NSArray, NSPoint, NSRect};

    let Ok(ns_window_ptr) = window.ns_window() else {
        append_diagnostic_log("popup_center_failed reason=missing_ns_window");
        return;
    };
    let ns_window = ns_window_ptr as id;

    unsafe {
        let mouse: NSPoint = NSEvent::mouseLocation(nil);

        // Screen whose frame contains the pointer; fall back to the screen the
        // window is currently on.
        let screens: id = NSScreen::screens(nil);
        let mut target: id = nil;
        for i in 0..NSArray::count(screens) {
            let screen: id = NSArray::objectAtIndex(screens, i);
            let f: NSRect = NSScreen::frame(screen);
            let inside = mouse.x >= f.origin.x
                && mouse.x <= f.origin.x + f.size.width
                && mouse.y >= f.origin.y
                && mouse.y <= f.origin.y + f.size.height;
            if inside {
                target = screen;
                break;
            }
        }
        if target == nil {
            target = NSWindow::screen(ns_window);
        }
        if target == nil {
            append_diagnostic_log("popup_center_failed reason=missing_target_screen");
            return;
        }

        // visibleFrame excludes the menu bar / Dock so the popup is centered
        // in the usable area, not behind the menu bar.
        let area: NSRect = NSScreen::visibleFrame(target);
        let win: NSRect = NSWindow::frame(ns_window);
        let x = area.origin.x + (area.size.width - win.size.width) / 2.0;
        let y = area.origin.y + (area.size.height - win.size.height) / 2.0;
        append_diagnostic_log(format!(
            "popup_center mouse=({:.0},{:.0}) origin=({:.0},{:.0})",
            mouse.x, mouse.y, x, y
        ));
        NSWindow::setFrameOrigin_(ns_window, NSPoint::new(x, y));
    }
}

/// Summon a check-in popup. On macOS the popups are NSPanels, shown via the
/// panel API so they become key (accept typing) without activating the app or
/// leaving a full-screen Space. Elsewhere they're ordinary windows.
#[cfg(target_os = "macos")]
fn summon_popup(app: &tauri::AppHandle, label: &str) {
    append_diagnostic_log(format!("popup_summon_macos label={label}"));
    let panel = match app.get_webview_panel(label) {
        Ok(panel) => panel,
        Err(e) => {
            append_diagnostic_log(format!("popup_summon_macos_failed label={label} error={e:?}"));
            eprintln!("nest: popup '{label}' is not an NSPanel: {e:?}");
            return;
        }
    };
    // Reposition before showing so it appears on the active screen without a
    // visible jump.
    match app.get_webview_window(label) {
        Some(window) => center_on_cursor_screen(&window),
        None => {
            append_diagnostic_log(format!("popup_center_missing_window label={label}"));
            eprintln!("nest[popup-pos]: get_webview_window('{label}') is None — cannot reposition")
        }
    }
    panel.show_and_make_key();
    append_diagnostic_log(format!("popup_summon_macos_shown label={label}"));
}

#[cfg(not(target_os = "macos"))]
fn summon_popup(app: &tauri::AppHandle, label: &str) {
    append_diagnostic_log(format!("popup_summon_window label={label}"));
    show_window(app, label);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let summon_shortcut = Shortcut::new(Some(HOTKEY_MODIFIERS), Code::KeyE);

    let builder = tauri::Builder::default()
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
                        summon_popup_with_route(app, "popup", "#/popup");
                    }
                })
                .build(),
        );

    #[cfg(target_os = "macos")]
    let builder = builder.plugin(tauri_nspanel::init());

    builder
        .setup(move |app| {
            // Database
            let app_data = app.path().app_data_dir()?;
            install_diagnostic_logging(app_data.clone());
            let db_path = app_data.join("nest.db");
            let conn = db::open(&db_path)?;
            let task_check_in_timer = load_task_check_in_timer(&conn);
            app.manage(Mutex::new(conn));
            app.manage(Mutex::new(task_check_in_timer));
            start_task_check_in_timer(app.handle().clone());

            // macOS: run as an accessory (agent) app — no Dock icon — and turn
            // the check-in popups into non-activating NSPanels so they overlay
            // other apps' full-screen Spaces and accept typing without pulling
            // the user out of full-screen.
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                for label in ["popup"] {
                    let Some(window) = app.get_webview_window(label) else {
                        continue;
                    };
                    match window.to_panel::<NestPanel>() {
                        Ok(panel) => {
                            panel.set_level(PanelLevel::Floating.value());
                            panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
                            panel.set_collection_behavior(
                                CollectionBehavior::new()
                                    .full_screen_auxiliary()
                                    .can_join_all_spaces()
                                    .stationary()
                                    .ignores_cycle()
                                    .into(),
                            );
                            panel.set_hides_on_deactivate(false);
                        }
                        Err(e) => eprintln!("nest: failed to convert '{label}' to NSPanel: {e:?}"),
                    }
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
            // Tray menu: prepend a disabled warning item if the hotkey is unavailable.
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
            if !main_hotkey_ok {
                menu.append(&PredefinedMenuItem::separator(app)?)?;
            }
            let open_dashboard =
                MenuItem::with_id(app, "open_dashboard", "Open Dashboard", true, None::<&str>)?;
            menu.append(&open_dashboard)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            menu.append(&quit)?;

            let tooltip = if main_hotkey_ok {
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
            commands::submit_metric_check_in,
            commands::list_metric_check_ins,
            commands::delete_metric_check_in,
            commands::submit_phase_check_in,
            commands::latest_task_check_in,
            commands::submit_task_check_in,
            commands::submit_brain_dump,
            commands::metric_series,
            log_client_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
