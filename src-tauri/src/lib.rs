mod activity;
mod timer;
mod commands;
mod db;
mod demo;
mod error;
mod migrations;
mod models;
mod phase;
mod popup_placement;
mod retired_assistant;
mod task;
mod task_graph;
mod task_lifecycle;
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

use crate::activity::{ActivityIdleTracker, ActivityIdleTransition};
use crate::time::now_unix_secs;
use crate::timer::Timer;

#[cfg(target_os = "macos")]
use tauri_nspanel::{
    tauri_panel, CollectionBehavior, ManagerExt, PanelLevel, StyleMask, WebviewWindowExt,
};

// The popup is subclassed into this non-activating NSPanel at
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

/// Collection behavior for the popup panel over full-screen Spaces.
/// Matches tauri-nspanel's fullscreen example, plus macOS 13+
/// `CanJoinAllApplications` so the panel can join other apps' Spaces.
/// Do not set `stationary()` — that pins the panel off the active
/// full-screen Space, so show_popup "succeeds" while nothing is visible.
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

pub(crate) fn append_diagnostic_log(message: impl AsRef<str>) {
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
fn note_popup_drag() {
    popup_placement::mark_user_drag();
}

#[tauri::command]
fn show_popup(app: tauri::AppHandle) {
    summon_popup_with_route(&app, "popup", "#/popup");
}

#[tauri::command]
fn close_popup(app: tauri::AppHandle, dismissed: bool) -> error::Result<()> {
    resolve_and_hide_popup(&app, if dismissed { "dismissed" } else { "completed" })
}

/// How often the running app stamps its heartbeat while work is open. Also the
/// most a crash can shave off the stretch it was in the middle of.
const HEARTBEAT_SECONDS: u64 = 60;

/// Phase shown in the menu bar, kept fresh by `phase::emit_phase_changed` so
/// the tick loop can build a title without touching the database.
pub struct CurrentPhase(pub Mutex<String>);

/// Menu bar glyphs for the four live Phase names. Dashboard icons come from
/// each Phase's stored `icon` (see `phaseIcon` in `src/dashboard/lib/period.ts`).
fn phase_emoji(name: &str) -> &'static str {
    match name {
        phase::PHASE_DOING => "🎯",
        phase::PHASE_SCOPING => "💡",
        phase::PHASE_RESTING => "☕",
        phase::PHASE_OFFLINE => "🌙",
        _ => "📊",
    }
}

/// macOS has no animated status item, so movement is just re-setting the title
/// with the next frame — one per tick while the Timer is due.
/// ponytail: 1 frame/sec off the existing loop; shorten the sleep to spin faster.
const TIMER_DUE_FRAMES: [&str; 8] = ["🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗"];

/// `🎯 Doing 12:34` counting down, animated clock while the Timer is due.
/// Countdown format matches `formatTimerCountdown` in the frontend.
fn tray_title(phase: &str, timer: &Timer, now: i64, tick: u64) -> String {
    if timer.waiting_for_response {
        let frame = TIMER_DUE_FRAMES[tick as usize % TIMER_DUE_FRAMES.len()];
        format!("{frame} {phase}")
    } else {
        let remaining = (timer.next_due_at - now).max(0);
        format!(
            "{} {phase} {}:{:02}",
            phase_emoji(phase),
            remaining / 60,
            remaining % 60
        )
    }
}

fn popup_is_visible(app: &tauri::AppHandle) -> bool {
    #[cfg(target_os = "macos")]
    {
        app.get_webview_panel("popup")
            .map(|panel| panel.is_visible())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        app.get_webview_window("popup")
            .and_then(|window| window.is_visible().ok())
            .unwrap_or(false)
    }
}

fn sync_activity_idle_transition(app: &tauri::AppHandle, transition: ActivityIdleTransition) {
    match transition {
        ActivityIdleTransition::BecameIdle => {
            phase::update_signals_and_sync(app, |_| {});
            let phase = app
                .state::<CurrentPhase>()
                .inner()
                .0
                .lock()
                .unwrap()
                .clone();
            if phase == phase::PHASE_RESTING {
                app.state::<ActivityIdleTracker>().arm_popup_on_resume();
            }
        }
        ActivityIdleTransition::BecameActive { show_popup } => {
            phase::update_signals_and_sync(app, |_| {});
            if !show_popup {
                return;
            }
            let waiting = app
                .state::<Mutex<Timer>>()
                .lock()
                .unwrap()
                .waiting_for_response;
            if waiting || popup_is_visible(app) {
                return;
            }
            let app_for_ui = app.clone();
            if let Err(error) = app.run_on_main_thread(move || {
                summon_popup_with_route(&app_for_ui, "popup", "#/popup");
            }) {
                append_diagnostic_log(format!("activity_popup_dispatch_failed error={error}"));
            }
        }
    }
}

fn spawn_timer_loop(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut ticks: u64 = 0;
        let mut shown_title = String::new();
        loop {
            std::thread::sleep(std::time::Duration::from_secs(1));
            let now = now_unix_secs();

            ticks += 1;
            if ticks.is_multiple_of(HEARTBEAT_SECONDS) {
                let db = app.state::<Mutex<rusqlite::Connection>>();
                let conn = db.lock().unwrap();
                if let Err(e) = task_lifecycle::beat_heartbeat(&conn, now) {
                    append_diagnostic_log(format!("heartbeat_failed error={e}"));
                }
            }

            let due = {
                let db = app.state::<Mutex<rusqlite::Connection>>();
                let conn = db.lock().unwrap();
                let timer = app.state::<Mutex<Timer>>();
                let mut timer = timer.lock().unwrap();
                if timer.pause_if_due(now) {
                    append_diagnostic_log(format!(
                        "timer_due now={now} next_due_at={} waiting_for_response=true",
                        timer.next_due_at
                    ));
                    if let Err(e) = timer::persist_timer_waiting(&conn, true) {
                        append_diagnostic_log(format!("timer_waiting_persist_failed error={e}"));
                    }
                    true
                } else {
                    false
                }
            };

            if due {
                let _ = app.emit("data-changed", ());
                let app_for_ui = app.clone();
                if let Err(e) = app.run_on_main_thread(move || {
                    #[cfg(target_os = "macos")]
                    tauri_nspanel::objc2_app_kit::NSBeep();
                    summon_popup_with_route(&app_for_ui, "popup", "#/popup");
                }) {
                    append_diagnostic_log(format!("timer_main_thread_dispatch_failed error={e}"));
                }
            }

            if let Some(transition) = app
                .state::<ActivityIdleTracker>()
                .tick(activity::is_idle())
            {
                sync_activity_idle_transition(&app, transition);
            }

            let title = {
                let phase = app.state::<CurrentPhase>().inner().0.lock().unwrap().clone();
                let timer = app.state::<Mutex<Timer>>();
                let timer = timer.lock().unwrap();
                tray_title(&phase, &timer, now, ticks)
            };
            if title != shown_title {
                if let Some(tray) = app.tray_by_id("main") {
                    // Only relayout the menu bar when the text actually moves.
                    if tray.set_title(Some(&title)).is_ok() {
                        shown_title = title;
                    }
                }
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
    Some(unsafe { (*ptr).windowNumber() })
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
            phase::enter_system_offline(&app);
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
            phase::leave_system_offline(&app);
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
        phase::enter_system_offline(&lock_app);
    });
    let unlock_name = NSString::from_str("com.apple.screenIsUnlocked");
    let unlock_block = block2::RcBlock::new(move |_notification: ptr::NonNull<NSNotification>| {
        phase::leave_system_offline(&app);
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

#[cfg(target_os = "macos")]
#[allow(deprecated)]
unsafe fn for_each_ns_screen(mut body: impl FnMut(cocoa::base::id)) {
    use cocoa::appkit::NSScreen;
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSArray;

    let screens: id = NSScreen::screens(nil);
    for i in 0..NSArray::count(screens) {
        body(NSArray::objectAtIndex(screens, i));
    }
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
unsafe fn screen_containing(point: cocoa::foundation::NSPoint) -> cocoa::base::id {
    use cocoa::appkit::NSScreen;
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSRect;

    let mut target: id = nil;
    for_each_ns_screen(|screen| {
        let frame: NSRect = NSScreen::frame(screen);
        if target == nil
            && point.x >= frame.origin.x
            && point.x <= frame.origin.x + frame.size.width
            && point.y >= frame.origin.y
            && point.y <= frame.origin.y + frame.size.height
        {
            target = screen;
        }
    });
    target
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
unsafe fn screen_for_point_or_window(
    point: cocoa::foundation::NSPoint,
    window: cocoa::base::id,
) -> Option<cocoa::base::id> {
    use cocoa::appkit::NSWindow;
    use cocoa::base::nil;

    let screen = screen_containing(point);
    let screen = if screen == nil {
        NSWindow::screen(window)
    } else {
        screen
    };
    (screen != nil).then_some(screen)
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
unsafe fn display_id(screen: cocoa::base::id) -> Option<popup_placement::DisplayId> {
    use cocoa::appkit::NSScreen;
    use cocoa::base::nil;
    use cocoa::foundation::{NSDictionary, NSString};
    use tauri_nspanel::objc2::{msg_send, runtime::AnyObject};

    let description = NSScreen::deviceDescription(screen);
    let key = NSString::alloc(nil).init_str("NSScreenNumber");
    let number = NSDictionary::objectForKey_(description, key);
    let _: () = msg_send![&*(key as *mut AnyObject), release];
    if number == nil {
        return None;
    }
    let value: usize = msg_send![&*(number as *mut AnyObject), unsignedIntegerValue];
    // ponytail: CGDirectDisplayID may change or be reused after display
    // reconfiguration; adopt persistent display fingerprints if that causes
    // positions to restore on the wrong physical monitor.
    value.try_into().ok()
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
unsafe fn visible_frame(screen: cocoa::base::id) -> popup_placement::VisibleFrame {
    use cocoa::appkit::NSScreen;
    use cocoa::foundation::NSRect;

    let frame: NSRect = NSScreen::visibleFrame(screen);
    popup_placement::VisibleFrame {
        x: frame.origin.x,
        y: frame.origin.y,
        width: frame.size.width,
        height: frame.size.height,
    }
}

/// The mouse always chooses the display; its saved position only chooses where
/// within that display the popup appears.
#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn place_popup(window: &tauri::WebviewWindow) {
    use cocoa::appkit::{NSEvent, NSWindow};
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSPoint;

    let Ok(ns_window_ptr) = window.ns_window() else {
        append_diagnostic_log("popup_place_failed reason=missing_ns_window");
        return;
    };
    let ns_window = ns_window_ptr as id;

    unsafe {
        let mouse = NSEvent::mouseLocation(nil);
        let Some(target) = screen_for_point_or_window(mouse, ns_window) else {
            append_diagnostic_log("popup_place_failed reason=missing_target_screen");
            return;
        };
        let display_id = display_id(target);
        let area = visible_frame(target);
        let window_frame = NSWindow::frame(ns_window);
        let saved = display_id
            .and_then(popup_placement::load)
            .and_then(|origin| {
                popup_placement::restored_origin(
                    origin,
                    window_frame.size.width,
                    window_frame.size.height,
                    area,
                )
            });
        let (origin, source) = match saved {
            Some(origin) => (origin, "saved"),
            None => (
                popup_placement::Origin {
                    x: area.x + (area.width - window_frame.size.width) / 2.0,
                    y: area.y + (area.height - window_frame.size.height) / 2.0,
                },
                "center",
            ),
        };
        let display_label = display_id
            .map(|id| id.to_string())
            .unwrap_or_else(|| "unknown".into());
        append_diagnostic_log(format!(
            "popup_place display={display_label} source={source} mouse=({:.0},{:.0}) origin=({:.0},{:.0})",
            mouse.x, mouse.y, origin.x, origin.y
        ));
        NSWindow::setFrameOrigin_(ns_window, NSPoint::new(origin.x, origin.y));
    }
}

#[cfg(target_os = "macos")]
#[allow(deprecated)]
fn persist_popup_origin_if_user_dragged(window: &tauri::WebviewWindow) {
    use cocoa::appkit::NSWindow;
    use cocoa::base::id;
    use cocoa::foundation::NSPoint;

    if !popup_placement::user_dragged() {
        return;
    }
    let Ok(ns_window_ptr) = window.ns_window() else {
        popup_placement::clear_user_drag();
        return;
    };
    let ns_window = ns_window_ptr as id;
    unsafe {
        let frame = NSWindow::frame(ns_window);
        let center = NSPoint::new(
            frame.origin.x + frame.size.width / 2.0,
            frame.origin.y + frame.size.height / 2.0,
        );
        if let Some(screen) = screen_for_point_or_window(center, ns_window) {
            let Some(display_id) = display_id(screen) else {
                append_diagnostic_log("popup_origin_save_skipped reason=missing_display");
                popup_placement::clear_user_drag();
                return;
            };
            let origin = popup_placement::relative_origin(
                popup_placement::Origin {
                    x: frame.origin.x,
                    y: frame.origin.y,
                },
                visible_frame(screen),
            );
            popup_placement::save(display_id, origin);
            append_diagnostic_log(format!(
                "popup_origin_saved display={display_id} offset=({:.0},{:.0})",
                origin.x, origin.y
            ));
        } else {
            append_diagnostic_log("popup_origin_save_skipped reason=missing_screen");
        }
    }
    popup_placement::clear_user_drag();
}

/// Show the Popup window. On macOS the popups are NSPanels, shown via the
/// panel API so they become key (accept typing) without activating the app or
/// leaving a full-screen Space. Elsewhere they're ordinary windows.
#[cfg(target_os = "macos")]
fn summon_popup(app: &tauri::AppHandle, label: &str) {
    append_diagnostic_log(format!("popup_summon_macos label={label}"));
    popup_placement::clear_user_drag();
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
        Some(window) => place_popup(&window),
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
    if let Some(window) = app.get_webview_window("popup") {
        persist_popup_origin_if_user_dragged(&window);
    } else {
        popup_placement::clear_user_drag();
    }
    match app.get_webview_panel("popup") {
        Ok(panel) if panel.is_visible() => {
            append_diagnostic_log(format!("popup_hide_native reason={reason}"));
            panel.hide();
        }
        Ok(_) => {}
        Err(e) => append_diagnostic_log(format!("popup_hide_native_failed error={e:?}")),
    }
}

fn hide_popup(app: &tauri::AppHandle, reason: &str) {
    #[cfg(target_os = "macos")]
    hide_popup_panel(app, reason);

    #[cfg(not(target_os = "macos"))]
    {
        popup_placement::clear_user_drag();
        if let Some(window) = app.get_webview_window("popup") {
            let _ = window.hide();
        }
        let _ = reason;
    }
}

#[cfg(not(target_os = "macos"))]
fn summon_popup(app: &tauri::AppHandle, label: &str) {
    append_diagnostic_log(format!("popup_summon_window label={label}"));
    popup_placement::clear_user_drag();
    show_window(app, label);
    phase::update_signals_and_sync(app, |signals| signals.popup_visible = true);
}

fn resolve_and_hide_popup(app: &tauri::AppHandle, reason: &str) -> error::Result<()> {
    hide_popup(app, reason);
    phase::update_signals_and_sync(app, |signals| signals.popup_visible = false);
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

/// ANSI key codes for the number-row 1 / 2 / 3 that carry the panel chords.
/// WKWebView and a focused editor otherwise keep these from reaching JS, the
/// same way Escape used to vanish. None of the three is a text-editing chord,
/// so forwarding them costs nothing. The keypad digits are left alone.
#[cfg(target_os = "macos")]
const POPUP_KEY_ANSI_1: u16 = 18;
#[cfg(target_os = "macos")]
const POPUP_KEY_ANSI_2: u16 = 19;
#[cfg(target_os = "macos")]
const POPUP_KEY_ANSI_3: u16 = 20;
#[cfg(target_os = "macos")]
const POPUP_KEY_ESCAPE: u16 = 53;

/// Command without Shift/Control/Option. Caps Lock and the like can stay on.
#[cfg(target_os = "macos")]
fn popup_command_chord(
    flags: tauri_nspanel::objc2_app_kit::NSEventModifierFlags,
) -> bool {
    use tauri_nspanel::objc2_app_kit::NSEventModifierFlags;
    flags.intersection(
        NSEventModifierFlags::Command
            | NSEventModifierFlags::Shift
            | NSEventModifierFlags::Control
            | NSEventModifierFlags::Option,
    ) == NSEventModifierFlags::Command
}

#[cfg(target_os = "macos")]
fn popup_panel_shortcut_key(key_code: u16, command_chord: bool, repeat: bool) -> Option<&'static str> {
    if repeat || !command_chord {
        return None;
    }
    match key_code {
        POPUP_KEY_ANSI_1 => Some("1"),
        POPUP_KEY_ANSI_2 => Some("2"),
        POPUP_KEY_ANSI_3 => Some("3"),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn dispatch_popup_keydown(app: &tauri::AppHandle, key: &str, meta_key: bool) -> bool {
    app.get_webview_window("popup").is_some_and(|window| {
        let script = format!(
            "(document.activeElement ?? window).dispatchEvent(\
             new KeyboardEvent('keydown', {{ key: '{key}', metaKey: {meta_key}, \
             bubbles: true, cancelable: true }}))"
        );
        match window.eval(&script) {
            Ok(()) => true,
            Err(error) => {
                append_diagnostic_log(format!(
                    "popup_keydown_dispatch_failed key={key} error={error}"
                ));
                false
            }
        }
    })
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

            if event_type == NSEventType::KeyDown && visible {
                let key_code = event_ref.keyCode();
                if key_code == POPUP_KEY_ESCAPE
                    && dispatch_popup_keydown(&app_for_local, "Escape", false)
                {
                    return ptr::null_mut();
                }
                // Only when the chord was aimed at the Popup itself. A
                // nonactivating panel stays visible while the Dashboard is key,
                // and swallowing ⌘1 / ⌘2 / ⌘3 there would toggle panels the
                // user cannot even see.
                let aimed_at_popup = panel.as_ref().is_some_and(|panel| {
                    event_ref.windowNumber() == panel.as_panel().windowNumber()
                });
                if aimed_at_popup {
                    if let Some(key) = popup_panel_shortcut_key(
                        key_code,
                        popup_command_chord(event_ref.modifierFlags()),
                        event_ref.isARepeat(),
                    ) {
                        if dispatch_popup_keydown(&app_for_local, key, true) {
                            return ptr::null_mut();
                        }
                    }
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
                    .is_some_and(|number| event_ref.windowNumber() == number)
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
            popup_placement::install(app_data.clone());
            let db_path = app_data.join("nest.db");
            let is_demo = demo::is_demo_identifier(&app.config().identifier);
            if is_demo {
                demo::create_windows(app)?;
                demo::remove_database(&db_path)?;
            }
            let mut conn = db::open(&db_path)?;
            if is_demo {
                demo::seed(&mut conn, now_unix_secs())?;
            } else {
                // Off the setup thread: a Keychain access prompt must not hold
                // up launch.
                std::thread::spawn(retired_assistant::forget_saved_api_key);
            }
            // Before anything reads stretches — the first Phase sync below
            // derives Doing from them, and a leftover open stretch would make
            // a just-launched Nest look like it never stopped working.
            match task_lifecycle::recover_open_stretches(&conn, now_unix_secs()) {
                Ok(0) => {}
                Ok(closed) => {
                    append_diagnostic_log(format!("recovered_open_stretches closed={closed}"))
                }
                Err(e) => append_diagnostic_log(format!("recover_open_stretches_failed error={e}")),
            }
            let timer = timer::load_timer(&conn);
            app.manage(Mutex::new(phase::PhaseSignals {
                notion_frontmost: phase::notion_is_frontmost(),
                ..phase::PhaseSignals::default()
            }));
            #[cfg(target_os = "macos")]
            app.manage(PhaseLeaveEpoch(AtomicU64::new(0)));
            app.manage(Mutex::new(conn));
            app.manage(Mutex::new(timer));
            app.manage(ActivityIdleTracker::new(activity::is_idle()));
            // Before the phase observers below: they sync phases on background
            // threads, and a sync writes the menu bar's phase.
            app.manage(CurrentPhase(Mutex::new(String::new())));

            // macOS: run as an accessory (agent) app — no Dock icon — and turn
            // the popup into a non-activating NSPanel so it overlays
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
                format!("Nest — {HOTKEY_LABEL} to open Popup")
            } else {
                "Nest — hotkey unavailable".to_string()
            };

            // Seed the menu bar: the sync above only reports phase *changes*, so a
            // relaunch into the same phase would leave the cached name empty.
            let title = {
                let db = app.state::<Mutex<rusqlite::Connection>>();
                let conn = db.lock().unwrap();
                let name = phase::with_current_signals(app.handle(), |signals| {
                    phase::current_phase(&conn, signals, activity::is_idle())
                })?;
                *app.state::<CurrentPhase>().inner().0.lock().unwrap() = name.to_string();
                let timer = app.state::<Mutex<Timer>>();
                let timer = timer.lock().unwrap();
                tray_title(name, &timer, now_unix_secs(), 0)
            };
            append_diagnostic_log(format!("tray_title title={title}"));

            if let Some(tray) = app.tray_by_id("main") {
                append_diagnostic_log(format!("tray_config_found tooltip={tooltip}"));
                tray.set_tooltip(Some(&tooltip))?;
                // Phase + countdown live in the title, so no image icon.
                tray.set_icon(None)?;
                tray.set_title(Some(&title))?;
                tray.set_menu(Some(menu))?;
                let tray_lookup_ok = app.tray_by_id("main").is_some();
                append_diagnostic_log(format!("tray_lookup id=main found={tray_lookup_ok}"));
            } else {
                append_diagnostic_log(format!("tray_build_start tooltip={tooltip}"));
                let tray = TrayIconBuilder::with_id("main")
                    .title(&title)
                    .tooltip(&tooltip)
                    .menu(&menu)
                    .build(app)?;
                append_diagnostic_log("tray_build_ok id=main");
                let tray_lookup_ok = app.tray_by_id("main").is_some();
                append_diagnostic_log(format!("tray_lookup id=main found={tray_lookup_ok}"));
                let tray_managed = app.manage(tray);
                append_diagnostic_log(format!("tray_manage stored={tray_managed}"));
            }

            // After the tray exists — the loop refreshes its title every second.
            spawn_timer_loop(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::metric::list_metrics,
            commands::task::list_tasks,
            commands::task::list_task_dependencies,
            commands::task::list_task_status_events,
            commands::task::create_task,
            commands::task::create_follow_up_task,
            commands::task::rename_task,
            commands::task::set_task_description,
            commands::task::set_task_scope,
            commands::task::set_task_parent,
            commands::task::add_task_dependency,
            commands::task::remove_task_dependency,
            commands::task::delete_task,
            commands::task::set_task_status,
            commands::task::set_task_working,
            commands::task::stop_all_working_now,
            commands::task::list_task_work_stretches,
            commands::task::update_task_work_stretch,
            commands::task::delete_task_work_stretch,
            commands::task::set_task_score,
            commands::task::set_task_score_field,
            commands::task::reorder_tasks,
            commands::metric::create_metric,
            commands::metric::rename_metric,
            commands::metric::set_metric_icon,
            commands::metric::set_metric_color,
            commands::metric::list_pulses,
            commands::metric::create_pulse,
            commands::metric::create_pulse_with_metrics,
            commands::metric::rename_pulse,
            commands::metric::set_pulse_icon,
            commands::metric::delete_pulse,
            commands::metric::add_metric_to_pulse,
            commands::metric::remove_metric_from_pulse,
            commands::metric::reorder_pulses,
            commands::metric::reorder_pulse_metrics,
            commands::phase::list_phases,
            commands::metric::submit_metric_check_in,
            commands::metric::list_metric_check_ins,
            commands::metric::delete_metric_check_in,
            commands::phase::latest_phase_check_in,
            commands::phase::list_phase_check_ins,
            commands::timer::get_timer_state,
            commands::timer::start_timer,
            commands::brain_dump::list_tags,
            commands::brain_dump::create_tag,
            commands::brain_dump::rename_tag,
            commands::brain_dump::delete_tag,
            commands::brain_dump::submit_brain_dump,
            commands::brain_dump::update_brain_dump_tags,
            commands::brain_dump::list_brain_dumps,
            show_popup,
            close_popup,
            show_dashboard,
            log_client_event,
            note_popup_drag,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                finalize_on_exit(app);
            }
        });
}

fn finalize_on_exit(app: &tauri::AppHandle) {
    #[cfg(target_os = "macos")]
    if let Some(window) = app.get_webview_window("popup") {
        persist_popup_origin_if_user_dragged(&window);
    }

    // Bank first. Quitting is not working, so an open stretch has to end here
    // or the time until the next launch banks itself as work — and the final
    // Phase below has to be derived from a Nest with nothing Working now.
    {
        let db = app.state::<Mutex<rusqlite::Connection>>();
        let conn = db.lock().unwrap();
        if let Err(e) = task_lifecycle::bank_all_working_now(&conn, now_unix_secs()) {
            append_diagnostic_log(format!("bank_on_exit_failed error={e}"));
        }
    }
    phase::update_signals_and_sync(app, |signals| {
        *signals = phase::PhaseSignals::default();
    });
}

#[cfg(test)]
mod tray_title_tests {
    use super::{tray_title, Timer};

    #[test]
    fn tray_title_counts_down_then_animates_when_due() {
        let mut timer = Timer {
            interval_minutes: 15,
            next_due_at: 754,
            waiting_for_response: false,
        };

        assert_eq!(tray_title("Doing", &timer, 0, 0), "🎯 Doing 12:34");
        assert_eq!(tray_title("Resting", &timer, 750, 0), "☕ Resting 0:04");
        // Overdue but not yet paused by the loop: floor at zero, never negative.
        assert_eq!(tray_title("Scoping", &timer, 800, 0), "💡 Scoping 0:00");

        timer.waiting_for_response = true;
        assert_eq!(tray_title("Doing", &timer, 800, 0), "🕐 Doing");
        assert_eq!(tray_title("Doing", &timer, 800, 1), "🕑 Doing");
        assert_eq!(tray_title("Doing", &timer, 800, 8), "🕐 Doing");
    }
}

#[cfg(all(test, target_os = "macos"))]
mod popup_shortcut_tests {
    use super::*;

    #[test]
    fn maps_command_number_chords() {
        assert_eq!(popup_panel_shortcut_key(18, true, false), Some("1"));
        assert_eq!(popup_panel_shortcut_key(19, true, false), Some("2"));
        assert_eq!(popup_panel_shortcut_key(20, true, false), Some("3"));
        // ⌘4 has no panel, and ⌘C stays with Copy.
        assert_eq!(popup_panel_shortcut_key(21, true, false), None);
        assert_eq!(popup_panel_shortcut_key(8, true, false), None);
    }

    #[test]
    fn ignores_repeat_and_unmodified_keys() {
        assert_eq!(popup_panel_shortcut_key(18, true, true), None);
        assert_eq!(popup_panel_shortcut_key(18, false, false), None);
        assert_eq!(popup_panel_shortcut_key(53, true, false), None);
    }
}
