#![allow(clippy::unused_unit)] // Required by tauri-nspanel's panel_event! syntax.

mod check_in;
mod commands;
mod db;
mod error;
mod migrations;
mod models;
mod task_graph;
mod time;

use std::{
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    ptr,
    sync::atomic::{AtomicI64, Ordering},
    sync::{Mutex, OnceLock},
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(target_os = "macos")]
use crate::time::now_unix_millis;
use crate::time::now_unix_secs;

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

    panel_event!(NestPanelEventHandler {
        window_did_resign_key(notification: &tauri_nspanel::NSNotification) -> ()
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

const POPUP_DISMISS_GRACE_MS: i64 = 2_000;

static DIAGNOSTIC_LOG_PATH: OnceLock<PathBuf> = OnceLock::new();
#[cfg(target_os = "macos")]
static POPUP_LAST_SUMMONED_AT_MS: AtomicI64 = AtomicI64::new(0);

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

#[tauri::command]
fn summon_check_in(app: tauri::AppHandle, step: Option<String>) {
    let route = match step.as_deref() {
        Some("metrics") => "#/popup?step=metrics",
        _ => "#/popup",
    };
    summon_popup_with_route(&app, "popup", route);
}

#[tauri::command]
fn close_check_in_popup(
    app: tauri::AppHandle,
    dismissed: bool,
    minutes: Option<i64>,
) -> error::Result<()> {
    resolve_and_hide_popup(
        &app,
        dismissed,
        minutes,
        if dismissed { "dismissed" } else { "completed" },
    )
}

// Cadence of the recurring check-in popup. At zero it pauses until the popup
// is completed or dismissed; schedule_next_check_in starts the next cycle.
pub struct CheckInTimer {
    pub interval_minutes: i64,
    pub next_due_at: i64,
    pub waiting_for_response: bool,
}

impl CheckInTimer {
    fn pause_if_due(&mut self, now: i64) -> bool {
        if self.waiting_for_response || now < self.next_due_at {
            return false;
        }
        self.waiting_for_response = true;
        true
    }
}

fn load_check_in_timer(conn: &rusqlite::Connection) -> CheckInTimer {
    let now = now_unix_secs();
    let persisted = conn
        .query_row(
            "SELECT interval_minutes, next_due_at FROM check_in_schedule WHERE id = 1",
            [],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .ok();

    let (interval_minutes, next_due_at) = match persisted {
        Some((minutes, due_at)) if check_in::is_valid_interval(minutes) => (minutes, due_at),
        // Missing row or a bad interval (corrupt/hand-edited db): fall back to
        // the default cadence starting now.
        _ => (
            check_in::DEFAULT_MINUTES,
            now + check_in::DEFAULT_MINUTES * 60,
        ),
    };

    append_diagnostic_log(format!(
        "check_in_timer_loaded interval_minutes={interval_minutes} next_due_at={next_due_at} now={now} overdue={}",
        next_due_at <= now
    ));

    CheckInTimer {
        interval_minutes,
        next_due_at,
        waiting_for_response: false,
    }
}

fn start_check_in_timer(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));
        let now = now_unix_secs();
        let due = {
            let timer = app.state::<Mutex<CheckInTimer>>();
            let mut timer = timer.lock().unwrap();
            if timer.pause_if_due(now) {
                append_diagnostic_log(format!(
                    "check_in_timer_due now={now} next_due_at={} waiting_for_response=true",
                    timer.next_due_at
                ));
                true
            } else {
                false
            }
        };

        if due {
            let app_for_ui = app.clone();
            if let Err(e) = app.run_on_main_thread(move || {
                #[cfg(target_os = "macos")]
                tauri_nspanel::objc2_app_kit::NSBeep();
                summon_popup_with_route(&app_for_ui, "popup", "#/popup?source=timer");
            }) {
                append_diagnostic_log(format!(
                    "check_in_timer_main_thread_dispatch_failed error={e}"
                ));
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
            append_diagnostic_log(format!(
                "popup_set_route_failed label={label} route={route} error={e}"
            ));
        }
    } else {
        append_diagnostic_log(format!(
            "popup_set_route_missing_window label={label} route={route}"
        ));
    }
}

fn summon_popup_with_route(app: &tauri::AppHandle, label: &str, route: &str) {
    append_diagnostic_log(format!(
        "popup_summon_with_route label={label} route={route}"
    ));
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
    POPUP_LAST_SUMMONED_AT_MS.store(now_unix_millis(), Ordering::Relaxed);
    let panel = match app.get_webview_panel(label) {
        Ok(panel) => panel,
        Err(e) => {
            append_diagnostic_log(format!(
                "popup_summon_macos_failed label={label} error={e:?}"
            ));
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

#[cfg(target_os = "macos")]
fn hide_popup_panel(app: &tauri::AppHandle, reason: &str) {
    match app.get_webview_panel("popup") {
        Ok(panel) if panel.is_visible() => {
            append_diagnostic_log(format!("popup_hide_native reason={reason}"));
            panel.hide();
        }
        Ok(_) => {}
        Err(e) => append_diagnostic_log(format!("popup_hide_native_failed error={e:?}")),
    }
}

fn hide_check_in_popup(app: &tauri::AppHandle, reason: &str) {
    #[cfg(target_os = "macos")]
    hide_popup_panel(app, reason);

    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window("popup") {
        let _ = window.hide();
    }
}

fn resolve_and_hide_popup(
    app: &tauri::AppHandle,
    dismissed: bool,
    minutes: Option<i64>,
    reason: &str,
) -> error::Result<()> {
    let resolved = {
        let state = app.state::<Mutex<rusqlite::Connection>>();
        let timer_state = app.state::<Mutex<CheckInTimer>>();
        let conn = state.lock().unwrap();
        let mut timer = timer_state.lock().unwrap();
        commands::resolve_due_check_in(&conn, &mut timer, dismissed, minutes, now_unix_secs())?
    };

    if resolved {
        let _ = app.emit("check-in-submitted", ());
    }
    hide_check_in_popup(app, reason);
    Ok(())
}

#[cfg(target_os = "macos")]
fn dismiss_popup_after_focus_grace(app: &tauri::AppHandle, reason: &str) {
    let elapsed_ms = now_unix_millis() - POPUP_LAST_SUMMONED_AT_MS.load(Ordering::Relaxed);
    if elapsed_ms <= POPUP_DISMISS_GRACE_MS {
        append_diagnostic_log(format!(
            "popup_hide_ignored reason={reason} elapsed_ms={elapsed_ms}"
        ));
        return;
    }

    if let Err(error) = resolve_and_hide_popup(app, true, None, reason) {
        append_diagnostic_log(format!(
            "popup_dismiss_failed reason={reason} error={error}"
        ));
    }
}

#[cfg(target_os = "macos")]
fn install_popup_escape_monitor(app: tauri::AppHandle) {
    let block = block2::RcBlock::new(
        move |event: std::ptr::NonNull<tauri_nspanel::objc2_app_kit::NSEvent>| {
            let event_ref = unsafe { event.as_ref() };
            if event_ref.keyCode() == 53 {
                let visible = app
                    .get_webview_panel("popup")
                    .map(|panel| panel.is_visible())
                    .unwrap_or(false);
                if visible {
                    let dispatched = app.get_webview_window("popup").is_some_and(|window| {
                        match window.eval(
                            "window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))",
                        ) {
                            Ok(()) => true,
                            Err(error) => {
                                append_diagnostic_log(format!(
                                    "popup_escape_dispatch_failed error={error}"
                                ));
                                false
                            }
                        }
                    });
                    if !dispatched {
                        if let Err(error) =
                            resolve_and_hide_popup(&app, true, None, "escape_dispatch_failed")
                        {
                            append_diagnostic_log(format!(
                                "popup_dismiss_failed reason=escape_dispatch_failed error={error}"
                            ));
                        }
                    }
                    return ptr::null_mut();
                }
            }

            event.as_ptr()
        },
    );

    let block = Box::leak(Box::new(block));
    let monitor = unsafe {
        tauri_nspanel::objc2_app_kit::NSEvent::addLocalMonitorForEventsMatchingMask_handler(
            tauri_nspanel::objc2_app_kit::NSEventMask::from_type(
                tauri_nspanel::objc2_app_kit::NSEventType::KeyDown,
            ),
            block,
        )
    };

    if monitor.is_none() {
        append_diagnostic_log("popup_escape_monitor_install_failed");
    }
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
            let check_in_timer = load_check_in_timer(&conn);
            app.manage(Mutex::new(conn));
            app.manage(Mutex::new(check_in_timer));
            start_check_in_timer(app.handle().clone());

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
                            let handler = NestPanelEventHandler::new();
                            let app_handle = app.handle().clone();
                            handler.window_did_resign_key(move |_| {
                                dismiss_popup_after_focus_grace(&app_handle, "resign_key");
                            });
                            panel.set_event_handler(Some(handler.as_ref()));
                            panel.set_level(PanelLevel::ScreenSaver.value());
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

                install_popup_escape_monitor(app.handle().clone());
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
            app.on_menu_event(|app, event| match event.id.as_ref() {
                "open_dashboard" => show_window(app, "dashboard"),
                "quit" => app.exit(0),
                _ => {}
            });

            let tooltip = if main_hotkey_ok {
                format!("Nest — {HOTKEY_LABEL} for a check-in")
            } else {
                "Nest — hotkey unavailable".to_string()
            };

            if let Some(tray) = app.tray_by_id("main") {
                append_diagnostic_log(format!("tray_config_found tooltip={tooltip}"));
                tray.set_tooltip(Some(&tooltip))?;
                tray.set_title(Some("Nest"))?;
                tray.set_menu(Some(menu))?;
                let tray_lookup_ok = app.tray_by_id("main").is_some();
                append_diagnostic_log(format!("tray_lookup id=main found={tray_lookup_ok}"));
            } else {
                append_diagnostic_log(format!("tray_build_start tooltip={tooltip}"));
                let tray = TrayIconBuilder::with_id("main")
                    .icon(app.default_window_icon().unwrap().clone())
                    .title("Nest")
                    .tooltip(&tooltip)
                    .menu(&menu)
                    .build(app)?;
                append_diagnostic_log("tray_build_ok id=main");
                let tray_lookup_ok = app.tray_by_id("main").is_some();
                append_diagnostic_log(format!("tray_lookup id=main found={tray_lookup_ok}"));
                let tray_managed = app.manage(tray);
                append_diagnostic_log(format!("tray_manage stored={tray_managed}"));
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_metrics,
            commands::list_tasks,
            commands::list_task_dependencies,
            commands::list_task_status_events,
            commands::create_task,
            commands::rename_task,
            commands::set_task_description,
            commands::set_task_scope,
            commands::set_task_parent,
            commands::add_task_dependency,
            commands::remove_task_dependency,
            commands::delete_task,
            commands::set_task_status,
            commands::set_task_working,
            commands::set_task_score,
            commands::create_metric,
            commands::rename_metric,
            commands::set_metric_active,
            commands::list_phases,
            commands::create_phase,
            commands::rename_phase,
            commands::set_phase_active,
            commands::submit_metric_check_in,
            commands::list_metric_check_ins,
            commands::delete_metric_check_in,
            commands::submit_phase_check_in,
            commands::latest_phase_check_in,
            commands::list_phase_check_ins,
            commands::get_check_in_schedule,
            commands::schedule_next_check_in,
            commands::submit_primary_check_in,
            commands::submit_brain_dump,
            commands::update_brain_dump_title,
            commands::list_brain_dumps,
            summon_check_in,
            close_check_in_popup,
            log_client_event,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod check_in_timer_tests {
    use super::CheckInTimer;

    #[test]
    fn due_timer_pauses_until_rescheduled() {
        let mut timer = CheckInTimer {
            interval_minutes: 15,
            next_due_at: 100,
            waiting_for_response: false,
        };

        assert!(!timer.pause_if_due(99));
        assert!(timer.pause_if_due(100));
        assert!(!timer.pause_if_due(101));

        timer.next_due_at = 401;
        timer.waiting_for_response = false;
        assert!(!timer.pause_if_due(400));
    }
}
