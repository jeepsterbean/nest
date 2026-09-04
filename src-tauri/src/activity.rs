use std::sync::atomic::{AtomicBool, Ordering};

/// No keyboard or pointer input for this long → Resting, even if Notion is frontmost.
pub const IDLE_SECONDS: f64 = 180.0;

#[cfg(target_os = "macos")]
pub fn seconds_since_last_input() -> f64 {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state: i64, event_type: u32) -> f64;
    }
    const HID_SYSTEM_STATE: i64 = 1;
    const ANY_INPUT: u32 = 0xFFFF_FFFF;
    unsafe { CGEventSourceSecondsSinceLastEventType(HID_SYSTEM_STATE, ANY_INPUT) }
}

#[cfg(not(target_os = "macos"))]
pub fn seconds_since_last_input() -> f64 {
    0.0
}

pub fn is_idle() -> bool {
    seconds_since_last_input() >= IDLE_SECONDS
}

#[derive(Debug, PartialEq, Eq)]
pub enum ActivityIdleTransition {
    BecameIdle,
    BecameActive { show_popup: bool },
}

/// Tracks idle edges for phase sync and the post-idle popup.
pub struct ActivityIdleTracker {
    was_idle: AtomicBool,
    summon_popup_on_resume: AtomicBool,
}

impl ActivityIdleTracker {
    pub fn new(initially_idle: bool) -> Self {
        Self {
            was_idle: AtomicBool::new(initially_idle),
            summon_popup_on_resume: AtomicBool::new(false),
        }
    }

    pub fn tick(&self, idle: bool) -> Option<ActivityIdleTransition> {
        let was = self.was_idle.load(Ordering::SeqCst);
        if idle == was {
            return None;
        }
        self.was_idle.store(idle, Ordering::SeqCst);
        if idle {
            Some(ActivityIdleTransition::BecameIdle)
        } else {
            let show_popup = self.summon_popup_on_resume.swap(false, Ordering::SeqCst);
            Some(ActivityIdleTransition::BecameActive { show_popup })
        }
    }

    pub fn arm_popup_on_resume(&self) {
        self.summon_popup_on_resume.store(true, Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracker_records_idle_edge_and_popup_on_resume() {
        let tracker = ActivityIdleTracker::new(false);
        assert!(tracker.tick(false).is_none());
        assert_eq!(tracker.tick(true), Some(ActivityIdleTransition::BecameIdle));
        assert!(tracker.tick(true).is_none());
        tracker.arm_popup_on_resume();
        assert_eq!(
            tracker.tick(false),
            Some(ActivityIdleTransition::BecameActive { show_popup: true })
        );
        assert!(tracker.tick(false).is_none());
    }

    #[test]
    fn resume_without_prior_idle_does_not_summon_popup() {
        let tracker = ActivityIdleTracker::new(true);
        assert_eq!(
            tracker.tick(false),
            Some(ActivityIdleTransition::BecameActive { show_popup: false })
        );
    }
}
