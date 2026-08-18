mod check_in;
mod commands;
mod db;
mod error;
mod migrations;
mod models;
mod phase;
mod task_graph;
mod time;

use std::{
    fs::OpenOptions,
    io::Write,
    path::PathBuf,
    ptr,
    sync::{Mutex, OnceLock},
};

#[cfg(target_os = "macos")]
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::Duration,
};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

use crate::time::now_unix_secs;

#[cfg(target_os = "macos")]
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

// The check-in popup is subclassed into this non-activating NSPanel at
// startup. A non-activating panel can become the key window (so the form
// accepts typing) without activating Nest — which is what lets it float over
// another app's native full-screen Space instead of being hidden or yanking
// the user out of full-screen.
#[cfg(target_os = "macos")]
tauri_panel! {
    panel!(NestPanel {
        config: {
            can_become_key_window: true,
            can_become_main_window: false,
            // Required to float over another app's native full-screen Space.
            is_floating_panel: true
        }
    })
}

/// Collection behavior for the check-in panel over full-screen Spaces.
/// Matches tauri-nspanel's fullscreen example, plus macOS 13+
/// `CanJoinAllApplications` so the panel can join other apps' Spaces.
/// Do not set `stationary()` — that pins the panel off the active
/// full-screen Space, so summon "succeeds" while nothing is visible.
#[cfg(target_os = "macos")]
fn popup_collection_behavior() -> tauri_nspanel::objc2_app_kit::NSWindowCollectionBehavior {
    CollectionBehavior::new()
        .full_screen_auxiliary()
        .can_join_all_spaces()
        .ignores_cycle()
        .value()
        // The plugin wrapper does not yet expose this macOS 13 flag.
        | tauri_nspanel::objc2_app_kit::NSWindowCollectionBehavior::CanJoinAllApplications
}

#[cfg(target_os = "macos")]
fn configure_popup_panel(panel: &dyn tauri_nspanel::Panel<tauri::Wry>) {
    let behavior = popup_collection_behavior();
    panel.set_level(PanelLevel::ScreenSaver.value());
    panel.set_style_mask(StyleMask::empty().nonactivating_panel().into());
    panel.set_floating_panel(true);
    panel.set_collection_behavior(behavior);
    panel.set_hides_on_deactivate(false);
    append_diagnostic_log(format!(
        "popup_panel_config collection_behavior={:#x}",
        behavior.bits()
    ));
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

#[tauri::command]
fn summon_check_in(app: tauri::AppHandle) {
    summon_popup_with_route(&app, "popup", "#/popup");
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
                summon_popup_with_route(&app_for_ui, "popup", "#/popup");
            }) {
                append_diagnostic_log(format!(
                    "check_in_timer_main_thread_dispatch_failed error={e}"
                ));
            }
        }
    });
}

/// Invalidates a pending “left dashboard” settle so a later sample cannot
/// overwrite a newer attention state.
#[cfg(target_os = "macos")]
struct PhaseLeaveEpoch(AtomicU64);

/// Wait for NSWorkspace to publish the newly frontmost app before recording
/// Resting. Switching dashboard → Notion otherwise inserts a Resting blip.
#[cfg(target_os = "macos")]
const PHASE_LEAVE_SETTLE: Duration = Duration::from_millis(100);

#[cfg(target_os = "macos")]
fn bump_leave_epoch(app: &tauri::AppHandle) -> u64 {
    app.state::<PhaseLeaveEpoch>()
        .0
        .fetch_add(1, Ordering::SeqCst)
        + 1
}

#[cfg(target_os = "macos")]
fn enter_dashboard_attention(app: &tauri::AppHandle) {
    bump_leave_epoch(app);
    if phase::with_current_signals(app, |signals| signals.dashboard_focused) {
        return;
    }
    phase::update_signals_and_sync(app, |signals| {
        signals.dashboard_focused = true;
        signals.notion_frontmost = false;
    });
}

/// Record that attention left the dashboard. Deferred so Notion activation
/// can land in the same checkpoint; cancelled if the dashboard is focused
/// again before the settle elapses.
#[cfg(target_os = "macos")]
fn schedule_leave_dashboard_attention(app: &tauri::AppHandle) {
    if !phase::with_current_signals(app, |signals| signals.dashboard_focused) {
        return;
    }
    let epoch = bump_leave_epoch(app);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(PHASE_LEAVE_SETTLE);
        let app_for_sync = app.clone();
        let _ = app.run_on_main_thread(move || {
            if app_for_sync
                .state::<PhaseLeaveEpoch>()
                .0
                .load(Ordering::SeqCst)
                != epoch
            {
                return;
            }
            let notion_frontmost = phase::notion_is_frontmost();
            phase::update_signals_and_sync(&app_for_sync, |signals| {
                phase::apply_left_dashboard(signals, notion_frontmost);
            });
        });
    });
}

#[cfg(target_os = "macos")]
fn sync_phase_from_workspace(app: &tauri::AppHandle) {
    bump_leave_epoch(app);
    if phase::nest_is_frontmost() {
        let dashboard_focused = app
            .get_webview_window("dashboard")
            .and_then(|window| window.is_focused().ok())
            .unwrap_or(false);
        phase::update_signals_and_sync(app, |signals| {
            signals.dashboard_focused = dashboard_focused;
            signals.notion_frontmost = false;
        });
        return;
    }
    let notion_frontmost = phase::notion_is_frontmost();
    phase::update_signals_and_sync(app, |signals| {
        phase::apply_left_dashboard(signals, notion_frontmost);
    });
}

#[cfg(target_os = "macos")]
fn dashboard_window_number(app: &tauri::AppHandle) -> Option<isize> {
    use tauri_nspanel::objc2_app_kit::NSWindow;

    let window = app.get_webview_window("dashboard")?;
    let ptr = window.ns_window().ok()? as *const NSWindow;
    if ptr.is_null() {
        return None;
    }
    Some(unsafe { (*ptr).windowNumber() as isize })
}

#[cfg(target_os = "macos")]
fn install_phase_application_observer(app: tauri::AppHandle) {
    use objc2_app_kit::{NSWorkspace, NSWorkspaceDidActivateApplicationNotification};
    use objc2_foundation::NSNotification;

    let block = block2::RcBlock::new(move |_notification: ptr::NonNull<NSNotification>| {
        sync_phase_from_workspace(&app);
    });
    let center = NSWorkspace::sharedWorkspace().notificationCenter();
    let observer = unsafe {
        center.addObserverForName_object_queue_usingBlock(
            Some(NSWorkspaceDidActivateApplicationNotification),
            None,
            None,
            &block,
        )
    };
    std::mem::forget(observer);
}

/// Whether the login session currently reports a locked screen.
#[cfg(target_os = "macos")]
fn screen_is_locked() -> bool {
    use std::ffi::{c_void, CString};

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFRelease(cf: *const c_void);
        fn CFDictionaryGetValue(dict: *const c_void, key: *const c_void) -> *const c_void;
        fn CFStringCreateWithCString(
            alloc: *const c_void,
            c_str: *const i8,
            encoding: u32,
        ) -> *const c_void;
        fn CFEqual(a: *const c_void, b: *const c_void) -> u8;
        static kCFBooleanTrue: *const c_void;
    }
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn CGSessionCopyCurrentDictionary() -> *const c_void;
    }

    const CF_STRING_ENCODING_UTF8: u32 = 0x0800_0100;
    let dict = unsafe { CGSessionCopyCurrentDictionary() };
    if dict.is_null() {
        return false;
    }
    let key_c = CString::new("CGSSessionScreenIsLocked").expect("static key");
    let key = unsafe {
        CFStringCreateWithCString(std::ptr::null(), key_c.as_ptr(), CF_STRING_ENCODING_UTF8)
    };
    let value = unsafe { CFDictionaryGetValue(dict, key) };
    let locked = !value.is_null() && unsafe { CFEqual(value, kCFBooleanTrue) != 0 };
    unsafe {
        if !key.is_null() {
            CFRelease(key);
        }
        CFRelease(dict);
    }
    locked
}

/// Enter Offline on lock / display-sleep / system-sleep; leave on unlock/wake
/// unless the lock screen is still up.
#[cfg(target_os = "macos")]
fn install_system_offline_observers(app: tauri::AppHandle) {
    use objc2_app_kit::{
        NSWorkspace, NSWorkspaceDidWakeNotification, NSWorkspaceScreensDidSleepNotification,
        NSWorkspaceScreensDidWakeNotification, NSWorkspaceWillSleepNotification,
    };
    use objc2_foundation::{
        NSDistributedNotificationCenter, NSNotification, NSNotificationCenter, NSString,
    };
    use tauri_nspanel::objc2::ClassType;

    let workspace = NSWorkspace::sharedWorkspace().notificationCenter();
    for name in unsafe {
        [
            NSWorkspaceWillSleepNotification,
            NSWorkspaceScreensDidSleepNotification,
        ]
    } {
        let app = app.clone();
        let block = block2::RcBlock::new(move |_notification: ptr::NonNull<NSNotification>| {
            bump_leave_epoch(&app);
            commands::enter_system_offline(&app);
        });
        let observer = unsafe {
            workspace.addObserverForName_object_queue_usingBlock(Some(name), None, None, &block)
        };
        std::mem::forget(observer);
    }

    for name in unsafe {
        [
            NSWorkspaceDidWakeNotification,
            NSWorkspaceScreensDidWakeNotification,
        ]
    } {
        let app = app.clone();
        let block = block2::RcBlock::new(move |_notification: ptr::NonNull<NSNotification>| {
            if screen_is_locked() {
                return;
            }
            commands::leave_system_offline(&app);
        });
        let observer = unsafe {
            workspace.addObserverForName_object_queue_usingBlock(Some(name), None, None, &block)
        };
        std::mem::forget(observer);
    }

    let lock_name = NSString::from_str("com.apple.screenIsLocked");
    let lock_app = app.clone();
    let lock_block = block2::RcBlock::new(move |_notification: ptr::NonNull<NSNotification>| {
        bump_leave_epoch(&lock_app);
        commands::enter_system_offline(&lock_app);
    });
    let unlock_name = NSString::from_str("com.apple.screenIsUnlocked");
    let unlock_block = block2::RcBlock::new(move |_notification: ptr::NonNull<NSNotification>| {
        commands::leave_system_offline(&app);
    });
    let distributed = NSDistributedNotificationCenter::defaultCenter();
    for (name, block) in [(&lock_name, &lock_block), (&unlock_name, &unlock_block)] {
        let observer = unsafe {
            NSNotificationCenter::addObserverForName_object_queue_usingBlock(
                distributed.as_super(),
                Some(name),
                None,
                None,
                block,
            )
        };
        std::mem::forget(observer);
    }
}

/// Closing the dashboard would otherwise destroy the webview. Accessory Nest
/// has no Dock icon to relaunch from, so CloseRequested hides instead, and a
/// missing window is rebuilt from tauri.conf.json.
fn reveal_dashboard(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("dashboard") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    append_diagnostic_log("dashboard_missing recreating");
    create_dashboard_window(app);
}

fn create_dashboard_window(app: &tauri::AppHandle) {
    let Some(config) = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "dashboard")
        .cloned()
    else {
        append_diagnostic_log("dashboard_recreate_failed reason=missing_config");
        return;
    };
    match tauri::WebviewWindowBuilder::from_config(app, &config) {
        Ok(builder) => match builder.visible(true).build() {
            Ok(window) => {
                attach_dashboard_events(&window);
                append_diagnostic_log("dashboard_recreated");
            }
            Err(e) => append_diagnostic_log(format!("dashboard_recreate_failed error={e}")),
        },
        Err(e) => append_diagnostic_log(format!("dashboard_recreate_config_failed error={e}")),
    }
}

fn leave_dashboard_attention_now(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    {
        bump_leave_epoch(app);
        let notion_frontmost = phase::notion_is_frontmost();
        phase::update_signals_and_sync(app, |signals| {
            phase::apply_left_dashboard(signals, notion_frontmost);
        });
    }
    #[cfg(not(target_os = "macos"))]
    phase::update_signals_and_sync(app, |signals| {
        signals.dashboard_focused = false;
    });
}

fn attach_dashboard_events(window: &tauri::WebviewWindow) {
    let handle = window.app_handle().clone();
    let dashboard = window.clone();
    window.on_window_event(move |event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = dashboard.hide();
            append_diagnostic_log("dashboard_hidden reason=close_requested");
            leave_dashboard_attention_now(&handle);
        }
        tauri::WindowEvent::Destroyed => {
            append_diagnostic_log("dashboard_destroyed");
            leave_dashboard_attention_now(&handle);
        }
        #[cfg(target_os = "macos")]
        tauri::WindowEvent::Focused(true) => {
            enter_dashboard_attention(&handle);
        }
        #[cfg(target_os = "macos")]
        tauri::WindowEvent::Focused(false) => {
            schedule_leave_dashboard_attention(&handle);
        }
        #[cfg(not(target_os = "macos"))]
        tauri::WindowEvent::Focused(focused) => {
            phase::update_signals_and_sync(&handle, |signals| {
                signals.dashboard_focused = *focused;
            });
        }
        _ => {}
    });
}

#[tauri::command]
async fn show_dashboard(app: tauri::AppHandle) {
    reveal_dashboard(&app);
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
            append_diagnostic_log(format!(
                "popup_summon_macos_failed label={label} error={e:?}"
            ));
            eprintln!("nest: popup '{label}' is not an NSPanel: {e:?}");
            return;
        }
    };
    // Re-apply before every show — Spaces / full-screen can leave the panel
    // with a stale collection behavior from the last Space it lived on.
    configure_popup_panel(panel.as_ref());
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
    let on_active_space = panel.as_panel().isOnActiveSpace();
    append_diagnostic_log(format!(
        "popup_summon_macos_shown label={label} visible={} on_active_space={on_active_space}",
        panel.is_visible()
    ));
    phase::update_signals_and_sync(app, |signals| signals.popup_visible = true);
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
    let timer_changed = {
        let state = app.state::<Mutex<rusqlite::Connection>>();
        let timer_state = app.state::<Mutex<CheckInTimer>>();
        let conn = state.lock().unwrap();
        let mut timer = timer_state.lock().unwrap();
        commands::resolve_due_check_in(&conn, &mut timer, dismissed, minutes, now_unix_secs())?
    };

    hide_check_in_popup(app, reason);
    phase::update_signals_and_sync(app, |signals| signals.popup_visible = false);
    if timer_changed {
        let _ = app.emit("check-in-submitted", ());
    }
    Ok(())
}

fn request_popup_dismiss(app: &tauri::AppHandle, source: &str) {
    append_diagnostic_log(format!("popup_dismiss_requested source={source}"));
    if let Err(error) = app.emit_to("popup", "popup-dismiss-requested", ()) {
        append_diagnostic_log(format!(
            "popup_dismiss_request_failed source={source} error={error}"
        ));
    }
}

#[cfg(target_os = "macos")]
fn install_popup_event_monitors(app: tauri::AppHandle) {
    use tauri_nspanel::objc2_app_kit::{NSEvent, NSEventMask, NSEventType};

    let app_for_local = app.clone();
    let local_block = block2::RcBlock::new(
        move |event: std::ptr::NonNull<tauri_nspanel::objc2_app_kit::NSEvent>| {
            let event_ref = unsafe { event.as_ref() };
            let event_type = event_ref.r#type();
            let panel = app_for_local.get_webview_panel("popup").ok();
            let visible = panel.as_ref().is_some_and(|panel| panel.is_visible());

            if event_type == NSEventType::KeyDown && event_ref.keyCode() == 53 && visible {
                let dispatched = app_for_local
                    .get_webview_window("popup")
                    .is_some_and(|window| {
                        match window.eval(
                            "(document.activeElement ?? window).dispatchEvent(\
                             new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))",
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
                if dispatched {
                    return ptr::null_mut();
                }
            }

            let mouse_down = event_type == NSEventType::LeftMouseDown
                || event_type == NSEventType::RightMouseDown
                || event_type == NSEventType::OtherMouseDown;
            if mouse_down
                && visible
                && panel.is_some_and(|panel| {
                    event_ref.windowNumber() != panel.as_panel().windowNumber()
                })
            {
                request_popup_dismiss(&app_for_local, "outside_mouse_local");
            }
            if mouse_down
                && dashboard_window_number(&app_for_local)
                    .is_some_and(|number| event_ref.windowNumber() as isize == number)
            {
                enter_dashboard_attention(&app_for_local);
            }

            event.as_ptr()
        },
    );

    let local_block = Box::leak(Box::new(local_block));
    let mouse_mask =
        NSEventMask::LeftMouseDown | NSEventMask::RightMouseDown | NSEventMask::OtherMouseDown;
    let local_monitor = unsafe {
        NSEvent::addLocalMonitorForEventsMatchingMask_handler(
            NSEventMask::KeyDown | mouse_mask,
            local_block,
        )
    };
    if local_monitor.is_none() {
        append_diagnostic_log("popup_local_event_monitor_install_failed");
    }

    let global_block = block2::RcBlock::new(
        move |_event: std::ptr::NonNull<tauri_nspanel::objc2_app_kit::NSEvent>| {
            let visible = app
                .get_webview_panel("popup")
                .map(|panel| panel.is_visible())
                .unwrap_or(false);
            if visible {
                request_popup_dismiss(&app, "outside_mouse_global");
            }
            // Accessory Nest often stays key after a click on another display,
            // and that click does not activate a new app. The click itself is
            // the attention change.
            schedule_leave_dashboard_attention(&app);
        },
    );
    let global_block = Box::leak(Box::new(global_block));
    let global_monitor =
        NSEvent::addGlobalMonitorForEventsMatchingMask_handler(mouse_mask, global_block);
    if global_monitor.is_none() {
        append_diagnostic_log("popup_global_mouse_monitor_install_failed");
    }
}

#[cfg(not(target_os = "macos"))]
fn summon_popup(app: &tauri::AppHandle, label: &str) {
    append_diagnostic_log(format!("popup_summon_window label={label}"));
    show_window(app, label);
    phase::update_signals_and_sync(app, |signals| signals.popup_visible = true);
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
            app.manage(Mutex::new(phase::PhaseSignals {
                notion_frontmost: phase::notion_is_frontmost(),
                ..phase::PhaseSignals::default()
            }));
            #[cfg(target_os = "macos")]
            app.manage(PhaseLeaveEpoch(AtomicU64::new(0)));
            app.manage(Mutex::new(conn));
            app.manage(Mutex::new(check_in_timer));
            start_check_in_timer(app.handle().clone());

            // macOS: run as an accessory (agent) app — no Dock icon — and turn
            // the check-in popup into a non-activating NSPanel so it overlays
            // other apps' full-screen Spaces and accepts typing without pulling
            // the user out of full-screen.
            #[cfg(target_os = "macos")]
            {
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                if let Some(window) = app.get_webview_window("popup") {
                    match window.to_panel::<NestPanel>() {
                        Ok(panel) => configure_popup_panel(panel.as_ref()),
                        Err(e) => eprintln!("nest: failed to convert 'popup' to NSPanel: {e:?}"),
                    }
                }

                install_popup_event_monitors(app.handle().clone());
                install_phase_application_observer(app.handle().clone());
                install_system_offline_observers(app.handle().clone());
            }

            #[cfg(not(target_os = "macos"))]
            if let Some(window) = app.get_webview_window("popup") {
                let app_handle = app.handle().clone();
                let popup = window.clone();
                window.on_window_event(move |event| {
                    if matches!(event, tauri::WindowEvent::Focused(false))
                        && popup.is_visible().unwrap_or(false)
                    {
                        request_popup_dismiss(&app_handle, "focus_lost");
                    }
                });
            }

            if let Some(window) = app.get_webview_window("dashboard") {
                attach_dashboard_events(&window);
            }

            let popup_visible = app
                .get_webview_window("popup")
                .and_then(|window| window.is_visible().ok())
                .unwrap_or(false);
            let dashboard_focused = app
                .get_webview_window("dashboard")
                .and_then(|window| window.is_focused().ok())
                .unwrap_or(false);
            phase::update_signals_and_sync(app.handle(), |signals| {
                signals.popup_visible = popup_visible;
                signals.dashboard_focused = dashboard_focused;
                signals.notion_frontmost = phase::notion_is_frontmost();
            });

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
                "open_dashboard" => reveal_dashboard(app),
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
            commands::list_reminders,
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
            commands::stop_all_working_now,
            commands::set_task_score,
            commands::reorder_tasks,
            commands::create_metric,
            commands::rename_metric,
            commands::set_metric_icon,
            commands::list_pulses,
            commands::create_pulse,
            commands::rename_pulse,
            commands::set_pulse_icon,
            commands::delete_pulse,
            commands::add_metric_to_pulse,
            commands::remove_metric_from_pulse,
            commands::reorder_pulses,
            commands::reorder_pulse_metrics,
            commands::list_phases,
            commands::submit_metric_check_in,
            commands::list_metric_check_ins,
            commands::delete_metric_check_in,
            commands::latest_phase_check_in,
            commands::list_phase_check_ins,
            commands::get_check_in_schedule,
            commands::schedule_next_check_in,
            commands::submit_brain_dump,
            commands::update_brain_dump_title,
            commands::list_brain_dumps,
            summon_check_in,
            close_check_in_popup,
            show_dashboard,
            log_client_event,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                finalize_phase_on_exit(app);
            }
        });
}

fn finalize_phase_on_exit(app: &tauri::AppHandle) {
    phase::update_signals_and_sync(app, |signals| {
        *signals = phase::PhaseSignals::default();
    });
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
