//! Demo mode: `npm run demo` launches Nest under its own identifier and WebView
//! data store, so it never reads the real database, drafts, or stickies. Each launch rebuilds the demo database and
//! seeds a believable recent week anchored to the current local day, so a
//! recording always shows "today" and the last few days filled in.

use std::collections::HashMap;
use std::path::Path;

use rusqlite::{params, Connection, Transaction};

use crate::error::Result;

pub const DEMO_IDENTIFIER: &str = "com.huwenjie.nest.demo";

/// Drafts, stickies, and Assistant drafts live in WebView storage, which an
/// unbundled dev binary shares across identifiers. Both windows use this store
/// so the dashboard and Popup still share their drafts with each other.
const DEMO_WEBVIEW_STORE: [u8; 16] = *b"nest-demo-store!";

/// Days before today that get a full seeded schedule, so Week ranges and
/// sparklines have history to show.
const HISTORY_DAYS: i64 = 9;

/// Today's seeded activity stops this long before launch, leaving the live
/// Phase to the running app instead of a seeded checkpoint racing it.
const TODAY_CUTOFF_SECS: i64 = 10 * 60;

const MAX_START_JITTER_MINUTES: u64 = 10;

pub fn is_demo_identifier(identifier: &str) -> bool {
    identifier == DEMO_IDENTIFIER
}

/// The demo config marks its windows `create: false` because Tauri's config
/// codegen cannot compile `dataStoreIdentifier`; they are built here instead,
/// before setup looks any of them up.
pub fn create_windows<R: tauri::Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    for window in app.config().app.windows.iter().filter(|window| !window.create) {
        tauri::WebviewWindowBuilder::from_config(app.handle(), window)?
            .data_store_identifier(DEMO_WEBVIEW_STORE)
            .build()?;
    }
    Ok(())
}

/// WAL mode keeps recent writes in the side files, so all three must go for the
/// next open to start from an empty database.
pub fn remove_database(db_path: &Path) -> std::io::Result<()> {
    for suffix in ["", "-wal", "-shm"] {
        let mut path = db_path.as_os_str().to_owned();
        path.push(suffix);
        match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e),
            _ => {}
        }
    }
    Ok(())
}

/// Expects a freshly migrated database: the default Phases, Reminders, and
/// Assistant Prompt come from migrations and are kept.
pub fn seed(conn: &mut Connection, now: i64) -> Result<()> {
    let tx = conn.transaction()?;
    let today_start = local_day_start(&tx, now)?;
    let cutoff = now - TODAY_CUTOFF_SECS;
    let days: Vec<(i64, i64)> = (0..=HISTORY_DAYS)
        .rev()
        .map(|days_ago| Ok((days_ago, local_day_start(&tx, now - days_ago * 86_400)?)))
        .collect::<Result<_>>()?;
    let day_start = |days_ago: i64| -> i64 {
        days.iter()
            .find(|(offset, _)| *offset == days_ago)
            .map(|(_, start)| *start)
            .unwrap_or(today_start - days_ago * 86_400)
    };

    style_phases(&tx)?;
    let tasks = seed_tasks(&tx, &day_start)?;
    seed_days(&tx, &days, cutoff, &tasks)?;
    let metrics = seed_metrics_and_pulses(&tx)?;
    seed_metric_check_ins(&tx, &days, cutoff, &metrics)?;
    seed_brain_dumps(&tx, &day_start, cutoff)?;
    seed_assistant_chat(&tx, &day_start)?;
    seed_timer(&tx, now)?;
    tx.commit()?;
    Ok(())
}

/// SQLite knows the machine's time zone, which spares a date crate for one
/// local-midnight lookup and keeps DST days the right length.
fn local_day_start(conn: &Connection, at: i64) -> Result<i64> {
    Ok(conn.query_row(
        "SELECT CAST(strftime('%s', ?1, 'unixepoch', 'localtime', 'start of day', 'utc') AS INTEGER)",
        params![at],
        |row| row.get(0),
    )?)
}

/// Deterministic noise so every demo launch tells the same story.
fn noise(seed: u64) -> u64 {
    let mut z = seed.wrapping_add(0x9E37_79B9_7F4A_7C15);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

const fn hm(hours: i64, minutes: i64) -> i64 {
    hours * 60 + minutes
}

fn style_phases(tx: &Transaction) -> Result<()> {
    for (name, icon, color) in [
        ("Doing", "target", "#35764e"),
        ("Scoping", "compass", "#c47a3a"),
        ("Resting", "sofa", "#5f8fb8"),
        ("Offline", "moon", "#6872bd"),
    ] {
        tx.execute(
            "UPDATE phases SET icon = ?1, color = ?2 WHERE name = ?3",
            params![icon, color, name],
        )?;
    }
    Ok(())
}

struct TaskSeed {
    key: &'static str,
    title: &'static str,
    description: &'static str,
    scope: Option<&'static str>,
    value: Option<i64>,
    effort: Option<i64>,
    parent: Option<&'static str>,
    /// (days ago, minute of day, status). The first entry is creation; the
    /// last is the Task's current status.
    history: &'static [(i64, i64, &'static str)],
}

const TASKS: &[TaskSeed] = &[
    TaskSeed {
        key: "portfolio",
        title: "Refresh portfolio site",
        description: "Three strong projects beat ten thin ones. Keep it warm and personal.",
        scope: Some("Work / Portfolio"),
        value: Some(5),
        effort: Some(4),
        parent: None,
        history: &[(9, hm(9, 5), "backlog"), (8, hm(9, 0), "active")],
    },
    TaskSeed {
        key: "case_study",
        title: "Write the Field Notes case study",
        description: "Outline is done. Start with the moment the idea clicked, not the timeline.",
        scope: Some("Work / Portfolio"),
        value: Some(5),
        effort: Some(4),
        parent: Some("portfolio"),
        history: &[(8, hm(9, 20), "backlog"), (6, hm(15, 45), "active")],
    },
    TaskSeed {
        key: "pick_projects",
        title: "Pick three projects to feature",
        description: "",
        scope: Some("Work / Portfolio"),
        value: Some(4),
        effort: Some(2),
        parent: Some("portfolio"),
        history: &[(8, hm(9, 10), "up_next"), (8, hm(9, 15), "active"), (6, hm(15, 40), "completed")],
    },
    TaskSeed {
        key: "headshot",
        title: "Update headshot",
        description: "",
        scope: Some("Work / Portfolio"),
        value: Some(2),
        effort: Some(2),
        parent: Some("portfolio"),
        history: &[(8, hm(9, 25), "backlog")],
    },
    TaskSeed {
        key: "publish",
        title: "Publish and share with Maya",
        description: "She offered to read it before it goes out.",
        scope: Some("Work / Portfolio"),
        value: Some(4),
        effort: Some(1),
        parent: Some("portfolio"),
        history: &[(8, hm(9, 30), "up_next")],
    },
    TaskSeed {
        key: "inbox",
        title: "Clear the inbox down to ten",
        description: "Archive generously. Anything needing more than two minutes becomes a Task.",
        scope: Some("Work"),
        value: Some(3),
        effort: Some(2),
        parent: None,
        history: &[(9, hm(9, 0), "active")],
    },
    TaskSeed {
        key: "spanish",
        title: "Finish Spanish lesson 12",
        description: "",
        scope: Some("Learning / Spanish"),
        value: Some(3),
        effort: Some(2),
        parent: None,
        history: &[(7, hm(8, 50), "active"), (2, hm(11, 50), "completed")],
    },
    TaskSeed {
        key: "reading",
        title: "Read 20 pages of The Overstory",
        description: "Evenings, away from the desk.",
        scope: Some("Learning / Reading"),
        value: Some(3),
        effort: Some(1),
        parent: None,
        history: &[(9, hm(20, 0), "active")],
    },
    TaskSeed {
        key: "meal_prep",
        title: "Plan Sunday meal prep",
        description: "Two soups, one grain, something green.",
        scope: Some("Home / Kitchen"),
        value: Some(3),
        effort: Some(2),
        parent: None,
        history: &[(5, hm(19, 40), "up_next"), (1, hm(13, 10), "active")],
    },
    TaskSeed {
        key: "library",
        title: "Return library books",
        description: "",
        scope: Some("Errands"),
        value: Some(2),
        effort: Some(1),
        parent: None,
        history: &[(7, hm(9, 0), "up_next"), (3, hm(11, 15), "active"), (3, hm(12, 0), "completed")],
    },
    TaskSeed {
        key: "grandma",
        title: "Call Grandma",
        description: "Ask about the garden and the recipe for the plum cake.",
        scope: None,
        value: Some(5),
        effort: Some(1),
        parent: None,
        history: &[(2, hm(19, 30), "up_next"), (1, hm(19, 35), "active"), (1, hm(20, 15), "completed")],
    },
    TaskSeed {
        key: "dentist",
        title: "Book a dentist checkup",
        description: "",
        scope: Some("Health"),
        value: Some(4),
        effort: Some(1),
        parent: None,
        history: &[(7, hm(19, 45), "up_next")],
    },
    TaskSeed {
        key: "photos",
        title: "Get passport photos taken",
        description: "",
        scope: Some("Errands"),
        value: Some(3),
        effort: Some(1),
        parent: None,
        history: &[(4, hm(12, 10), "up_next")],
    },
    TaskSeed {
        key: "passport",
        title: "Renew passport",
        description: "Before booking anything for spring.",
        scope: Some("Errands"),
        value: Some(4),
        effort: Some(3),
        parent: None,
        history: &[(4, hm(12, 15), "backlog")],
    },
    TaskSeed {
        key: "garden",
        title: "Sketch ideas for the garden bed",
        description: "",
        scope: Some("Home / Garden"),
        value: Some(2),
        effort: Some(3),
        parent: None,
        history: &[(5, hm(20, 10), "backlog")],
    },
    TaskSeed {
        key: "trial",
        title: "Cancel the unused streaming trial",
        description: "",
        scope: Some("Errands"),
        value: Some(1),
        effort: Some(1),
        parent: None,
        history: &[(6, hm(12, 30), "backlog"), (2, hm(12, 20), "cancelled")],
    },
];

/// (Blocker, Dependent)
const BLOCKERS: &[(&str, &str)] = &[("case_study", "publish"), ("photos", "passport")];

/// Status changes resolved to timestamps, used to decide which Tasks could be
/// Working now during a seeded Doing block.
type StatusTimelines = HashMap<&'static str, (i64, Vec<(i64, &'static str)>)>;

fn seed_tasks(tx: &Transaction, day_start: &dyn Fn(i64) -> i64) -> Result<StatusTimelines> {
    let mut timelines: StatusTimelines = HashMap::new();
    for (sort_order, task) in TASKS.iter().enumerate() {
        let events: Vec<(i64, &str)> = task
            .history
            .iter()
            .map(|&(days_ago, minute, status)| (day_start(days_ago) + minute * 60, status))
            .collect();
        let (created_at, _) = events[0];
        let (updated_at, status) = *events.last().unwrap();
        let parent_id = task.parent.map(|key| timelines[key].0);
        tx.execute(
            "INSERT INTO tasks \
             (title, description, status, scope, value, effort, parent_task_id, \
              created_at, updated_at, sort_order) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                task.title,
                task.description,
                status,
                task.scope,
                task.value,
                task.effort,
                parent_id,
                created_at,
                updated_at,
                sort_order as i64,
            ],
        )?;
        let id = tx.last_insert_rowid();
        let mut from_status: Option<&str> = None;
        for &(at, to_status) in &events {
            tx.execute(
                "INSERT INTO task_status_events (task_id, from_status, to_status, created_at) \
                 VALUES (?1, ?2, ?3, ?4)",
                params![id, from_status, to_status, at],
            )?;
            from_status = Some(to_status);
        }
        timelines.insert(task.key, (id, events));
    }
    for &(blocker, dependent) in BLOCKERS {
        let created_at = timelines[dependent].1[0].0;
        tx.execute(
            "INSERT INTO task_dependencies (blocker_task_id, blocked_task_id, created_at) \
             VALUES (?1, ?2, ?3)",
            params![timelines[blocker].0, timelines[dependent].0, created_at],
        )?;
    }
    Ok(timelines)
}

fn status_at(events: &[(i64, &'static str)], at: i64) -> Option<&'static str> {
    events
        .iter()
        .take_while(|(changed_at, _)| *changed_at <= at)
        .last()
        .map(|(_, status)| *status)
}

enum Block {
    Doing(&'static [&'static str]),
    Phase(&'static str),
}

/// One ordinary day: a morning of focused stretches, lunch away, a softer
/// afternoon, and a short evening. Doing blocks name Task keys in preference
/// order; the first one Active at the block's start gets the Work stretch.
const DAY: &[(i64, Block)] = &[
    (hm(8, 40), Block::Phase("Scoping")),
    (hm(9, 0), Block::Doing(&["inbox", "spanish"])),
    (hm(9, 45), Block::Phase("Resting")),
    (hm(10, 0), Block::Doing(&["case_study", "pick_projects"])),
    (hm(11, 0), Block::Phase("Scoping")),
    (hm(11, 20), Block::Doing(&["library", "spanish", "pick_projects", "inbox"])),
    (hm(12, 5), Block::Phase("Offline")),
    (hm(13, 0), Block::Phase("Scoping")),
    (hm(13, 15), Block::Doing(&["meal_prep", "case_study", "pick_projects"])),
    (hm(14, 30), Block::Phase("Resting")),
    (hm(14, 50), Block::Doing(&["pick_projects", "case_study"])),
    (hm(15, 35), Block::Phase("Scoping")),
    (hm(16, 0), Block::Doing(&["case_study", "inbox"])),
    (hm(16, 50), Block::Phase("Resting")),
    (hm(17, 30), Block::Phase("Offline")),
    (hm(19, 25), Block::Phase("Scoping")),
    (hm(19, 40), Block::Doing(&["grandma", "reading"])),
    (hm(20, 25), Block::Phase("Resting")),
    (hm(20, 45), Block::Phase("Offline")),
];

/// The last block of each day runs until this minute.
const DAY_END: i64 = hm(23, 30);

fn seed_days(
    tx: &Transaction,
    days: &[(i64, i64)],
    cutoff: i64,
    tasks: &StatusTimelines,
) -> Result<()> {
    let phase_ids: HashMap<String, i64> = tx
        .prepare("SELECT name, id FROM phases")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<rusqlite::Result<_>>()?;
    let mut last_phase: Option<&str> = None;

    for &(days_ago, start_of_day) in days {
        let starts: Vec<i64> = DAY
            .iter()
            .enumerate()
            .map(|(index, (minute, _))| {
                let jitter = noise((days_ago as u64) << 8 | index as u64) % MAX_START_JITTER_MINUTES;
                start_of_day + (minute + jitter as i64) * 60
            })
            .collect();

        for (index, (_, block)) in DAY.iter().enumerate() {
            let start = starts[index];
            let end = starts.get(index + 1).copied().unwrap_or(start_of_day + DAY_END * 60);
            if start >= cutoff {
                break;
            }
            let end = end.min(cutoff);

            let working_task = match block {
                Block::Doing(candidates) => candidates.iter().find_map(|key| {
                    let (id, events) = &tasks[key];
                    (status_at(events, start) == Some("active")).then_some(*id)
                }),
                Block::Phase(_) => None,
            };
            let phase = match (block, working_task) {
                (Block::Phase(name), _) => *name,
                (Block::Doing(_), Some(_)) => "Doing",
                (Block::Doing(_), None) => "Scoping",
            };

            if let Some(task_id) = working_task {
                tx.execute(
                    "INSERT INTO task_work_stretches (task_id, started_at, ended_at) \
                     VALUES (?1, ?2, ?3)",
                    params![task_id, start, end],
                )?;
            }
            if last_phase != Some(phase) {
                tx.execute(
                    "INSERT INTO phase_check_ins (created_at, phase_id) VALUES (?1, ?2)",
                    params![start, phase_ids[phase]],
                )?;
                last_phase = Some(phase);
            }
        }
    }
    Ok(())
}

struct MetricSeed {
    name: &'static str,
    icon: &'static str,
    color: &'static str,
}

const METRICS: &[MetricSeed] = &[
    MetricSeed { name: "Sleep", icon: "bed", color: "#6872bd" },
    MetricSeed { name: "Energy", icon: "battery", color: "#c47a3a" },
    MetricSeed { name: "Mood", icon: "mood", color: "#b95755" },
    MetricSeed { name: "Focus", icon: "target", color: "#35764e" },
    MetricSeed { name: "Calm", icon: "leaf", color: "#438c83" },
    MetricSeed { name: "Body", icon: "body", color: "#a08e2f" },
];

const PULSES: &[(&str, &str, &[&str])] = &[
    ("Morning", "sun", &["Sleep", "Energy", "Mood"]),
    ("Through the day", "activity", &["Energy", "Focus", "Calm"]),
    ("Evening", "moon", &["Mood", "Calm", "Body"]),
];

/// (minute of day, Pulse name)
const CHECK_IN_TIMES: &[(i64, &str)] = &[
    (hm(8, 45), "Morning"),
    (hm(11, 5), "Through the day"),
    (hm(14, 35), "Through the day"),
    (hm(16, 55), "Through the day"),
    (hm(20, 30), "Evening"),
];

struct SeededMetrics {
    metric_ids: HashMap<&'static str, i64>,
    pulse_ids: HashMap<&'static str, i64>,
}

fn seed_metrics_and_pulses(tx: &Transaction) -> Result<SeededMetrics> {
    let mut metric_ids = HashMap::new();
    for metric in METRICS {
        tx.execute(
            "INSERT INTO metrics (name, created_at, icon, color) VALUES (?1, 0, ?2, ?3)",
            params![metric.name, metric.icon, metric.color],
        )?;
        metric_ids.insert(metric.name, tx.last_insert_rowid());
    }
    let mut pulse_ids = HashMap::new();
    for (pulse_order, &(name, icon, members)) in PULSES.iter().enumerate() {
        tx.execute(
            "INSERT INTO pulses (name, created_at, icon, sort_order) VALUES (?1, 0, ?2, ?3)",
            params![name, icon, pulse_order as i64],
        )?;
        let pulse_id = tx.last_insert_rowid();
        for (metric_order, metric) in members.iter().enumerate() {
            tx.execute(
                "INSERT INTO pulse_metrics (pulse_id, metric_id, sort_order) VALUES (?1, ?2, ?3)",
                params![pulse_id, metric_ids[metric], metric_order as i64],
            )?;
        }
        pulse_ids.insert(name, pulse_id);
    }
    Ok(SeededMetrics { metric_ids, pulse_ids })
}

/// A gentle story: Mood and Calm lift over the week, Energy dips after lunch,
/// and Focus is best late morning.
fn rating(metric: &str, days_ago: i64, minute: i64, seed: u64) -> i64 {
    let week_lift = (HISTORY_DAYS - days_ago) as f64 / HISTORY_DAYS as f64;
    let base = match metric {
        "Sleep" => 3.2,
        "Energy" if minute >= hm(14, 0) && minute < hm(16, 0) => 2.6,
        "Energy" => 3.5,
        "Mood" => 2.9 + week_lift,
        "Focus" if minute < hm(12, 0) => 4.0,
        "Focus" => 3.1,
        "Calm" => 3.0 + week_lift * 0.8,
        _ => 3.4,
    };
    let wobble = (noise(seed) % 3) as f64 - 1.0;
    (base + wobble * 0.7).round().clamp(1.0, 5.0) as i64
}

fn seed_metric_check_ins(
    tx: &Transaction,
    days: &[(i64, i64)],
    cutoff: i64,
    metrics: &SeededMetrics,
) -> Result<()> {
    for &(days_ago, start_of_day) in days {
        for (index, &(minute, pulse)) in CHECK_IN_TIMES.iter().enumerate() {
            let jitter = noise((days_ago as u64) << 16 | index as u64) % MAX_START_JITTER_MINUTES;
            let at = start_of_day + (minute + jitter as i64) * 60;
            if at >= cutoff {
                break;
            }
            tx.execute(
                "INSERT INTO metric_check_ins (created_at, pulse_id, pulse_name) VALUES (?1, ?2, ?3)",
                params![at, metrics.pulse_ids[pulse], pulse],
            )?;
            let check_in_id = tx.last_insert_rowid();
            let members = PULSES.iter().find(|(name, _, _)| *name == pulse).unwrap().2;
            for (metric_index, metric) in members.iter().enumerate() {
                let seed = (days_ago as u64) << 24 | (index as u64) << 8 | metric_index as u64;
                tx.execute(
                    "INSERT INTO metric_ratings (check_in_id, metric_id, value) VALUES (?1, ?2, ?3)",
                    params![
                        check_in_id,
                        metrics.metric_ids[metric],
                        rating(metric, days_ago, minute, seed)
                    ],
                )?;
            }
        }
    }
    Ok(())
}

const RICH_TEXT_PREFIX: &str = "<!--nest-rich-text:v1-->";

fn checklist(items: &[(&str, bool)]) -> String {
    let rows: String = items
        .iter()
        .map(|(text, done)| {
            format!(
                "<li data-checked=\"{done}\" data-type=\"taskItem\"><label><input type=\"checkbox\"{}><span></span></label><div><p>{text}</p></div></li>",
                if *done { " checked=\"checked\"" } else { "" }
            )
        })
        .collect();
    format!("<ul data-type=\"taskList\">{rows}</ul>")
}

fn bullets(items: &[&str]) -> String {
    let rows: String = items.iter().map(|text| format!("<li><p>{text}</p></li>")).collect();
    format!("<ul>{rows}</ul>")
}

fn heading(text: &str) -> String {
    format!("<p style=\"font-size: 18px\"><strong>{text}</strong></p>")
}

fn rich(parts: &[String]) -> String {
    format!("{RICH_TEXT_PREFIX}{}", parts.concat())
}

const TAGS: &[&str] = &["Work", "Idea", "Personal", "Gratitude", "Errand"];

fn seed_brain_dumps(tx: &Transaction, day_start: &dyn Fn(i64) -> i64, cutoff: i64) -> Result<()> {
    let mut tag_ids = HashMap::new();
    for tag in TAGS {
        tx.execute("INSERT INTO tags (name, created_at) VALUES (?1, 0)", params![tag])?;
        tag_ids.insert(*tag, tx.last_insert_rowid());
    }

    let dumps: Vec<(i64, i64, String, &[&str])> = vec![
        (9, hm(8, 50), "New week. I want the portfolio to feel like me again, not like a résumé.".into(), &["Work"]),
        (9, hm(20, 10), "Grateful for the long walk by the river and the bakery still being open.".into(), &["Gratitude"]),
        (8, hm(9, 35), rich(&[
            heading("Portfolio, roughly"),
            bullets(&["Field Notes app", "The library wayfinding project", "Something small and playful"]),
        ]), &["Work", "Idea"]),
        (7, hm(13, 5), "Afternoons go better when I eat away from the desk. Noting it so I believe it.".into(), &["Personal"]),
        (7, hm(19, 50), rich(&[
            heading("Errands"),
            checklist(&[("Library books", false), ("Dentist", false), ("Passport photos", false)]),
        ]), &["Errand"]),
        (6, hm(15, 50), "Picked the three projects. Relief. The case study is the real work now.".into(), &["Work"]),
        (5, hm(19, 45), "Soup idea: roasted squash with miso and a lot of ginger.".into(), &["Idea", "Personal"]),
        (4, hm(11, 10), "Felt scattered this morning. Two short Doing stretches still counted.".into(), &["Personal"]),
        (3, hm(12, 5), "Library books returned. Picked up a new one by accident, as usual.".into(), &["Errand", "Gratitude"]),
        (2, hm(16, 40), rich(&[
            heading("Case study opening"),
            bullets(&[
                "Start in the field: the notebook full of rain-smudged sketches",
                "Then the question: what if notes could find you again?",
                "Keep the process part short",
            ]),
        ]), &["Work", "Idea"]),
        (1, hm(20, 20), "Called Grandma. She laughed at the plum cake story again. A good evening.".into(), &["Gratitude", "Personal"]),
        (0, hm(8, 55), rich(&[
            heading("Today, gently"),
            checklist(&[
                ("Water the basil", true),
                ("Write the case study opening", false),
                ("Plan Sunday soups", false),
                ("Walk before dinner", false),
            ]),
        ]), &["Personal"]),
        (0, hm(11, 15), "The opening paragraph finally has a shape. Leave it alone until after lunch.".into(), &["Work"]),
    ];

    for (days_ago, minute, text, tags) in dumps {
        let at = day_start(days_ago) + minute * 60;
        if at >= cutoff {
            continue;
        }
        tx.execute(
            "INSERT INTO brain_dumps (created_at, text) VALUES (?1, ?2)",
            params![at, text],
        )?;
        let dump_id = tx.last_insert_rowid();
        for tag in tags {
            tx.execute(
                "INSERT INTO brain_dump_tags (brain_dump_id, tag_id) VALUES (?1, ?2)",
                params![dump_id, tag_ids[tag]],
            )?;
        }
    }
    Ok(())
}

fn seed_assistant_chat(tx: &Transaction, day_start: &dyn Fn(i64) -> i64) -> Result<()> {
    let started_at = day_start(1) + hm(16, 10) * 60;
    let messages: [(&str, &str); 4] = [
        (
            "user",
            "I keep opening the Field Notes case study and closing it again. Where do I start?",
        ),
        (
            "assistant",
            "It sounds like the whole case study feels like one big step. You already have an outline, so the hard part may be the first sentence rather than the structure.\n\nA smaller start:\n1. Set a 25-minute Timer.\n2. Write only the opening scene, badly, on purpose.\n3. Stop when the Timer ends, even mid-sentence.\n\nWhat moment made you want to build Field Notes in the first place?",
        ),
        (
            "user",
            "Honestly, a notebook that got soaked on a hike. I lost a whole week of sketches.",
        ),
        (
            "assistant",
            "That is a strong opening: concrete, a little painful, and it explains the product without selling it. Try starting with the rain and the smudged pages, then the question it left you with.\n\nOne next step: write three sentences about that hike before you look at the outline again.",
        ),
    ];
    tx.execute(
        "INSERT INTO assistant_conversations (title, model, created_at, updated_at) \
         VALUES (?1, 'gpt-5.6-luna', ?2, ?3)",
        params![
            "Getting the case study unstuck",
            started_at,
            started_at + (messages.len() as i64 - 1) * 60
        ],
    )?;
    let conversation_id = tx.last_insert_rowid();
    for (index, (role, content)) in messages.iter().enumerate() {
        let sent_message = (*role == "user").then_some(*content);
        tx.execute(
            "INSERT INTO assistant_messages (conversation_id, role, content, sent_message, created_at) \
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![conversation_id, role, content, sent_message, started_at + index as i64 * 60],
        )?;
    }
    Ok(())
}

fn seed_timer(tx: &Transaction, now: i64) -> Result<()> {
    tx.execute(
        "UPDATE timer_schedule SET interval_minutes = 25, next_due_at = ?1, waiting_for_response = 0 \
         WHERE id = 1",
        params![now + 25 * 60],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::migrations;
    use crate::task::{map_task, TASK_COLUMNS};

    const NOW: i64 = 1_791_385_200;

    fn seeded() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        seed(&mut conn, NOW).unwrap();
        conn
    }

    fn count(conn: &Connection, sql: &str) -> i64 {
        conn.query_row(sql, [], |row| row.get(0)).unwrap()
    }

    #[test]
    fn seeds_every_surface_without_breaking_constraints() {
        let conn = seeded();
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM tasks"), TASKS.len() as i64);
        assert!(count(&conn, "SELECT COUNT(*) FROM task_work_stretches") > 20);
        assert!(count(&conn, "SELECT COUNT(*) FROM phase_check_ins") > 50);
        assert!(count(&conn, "SELECT COUNT(*) FROM metric_check_ins") > 30);
        assert!(count(&conn, "SELECT COUNT(*) FROM brain_dumps") >= 10);
        assert_eq!(count(&conn, "SELECT COUNT(*) FROM assistant_messages"), 4);
        let violations: Vec<String> = conn
            .prepare("PRAGMA foreign_key_check")
            .unwrap()
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        assert!(violations.is_empty(), "{violations:?}");
    }

    #[test]
    fn leaves_nothing_working_and_nothing_in_the_future() {
        let conn = seeded();
        assert_eq!(
            count(&conn, "SELECT COUNT(*) FROM task_work_stretches WHERE ended_at IS NULL"),
            0
        );
        for sql in [
            "SELECT MAX(ended_at) FROM task_work_stretches",
            "SELECT MAX(created_at) FROM phase_check_ins",
            "SELECT MAX(created_at) FROM metric_check_ins",
            "SELECT MAX(created_at) FROM brain_dumps",
            "SELECT MAX(created_at) FROM task_status_events",
        ] {
            assert!(count(&conn, sql) <= NOW, "{sql}");
        }
    }

    #[test]
    fn work_only_lands_on_tasks_that_were_active() {
        let conn = seeded();
        let misplaced = count(
            &conn,
            "SELECT COUNT(*) FROM task_work_stretches s \
             WHERE (SELECT e.to_status FROM task_status_events e \
                    WHERE e.task_id = s.task_id AND e.created_at <= s.started_at \
                    ORDER BY e.created_at DESC, e.id DESC LIMIT 1) IS NOT 'active'",
        );
        assert_eq!(misplaced, 0);
    }

    #[test]
    fn phase_checkpoints_only_record_changes() {
        let conn = seeded();
        let repeats = count(
            &conn,
            "SELECT COUNT(*) FROM (SELECT phase_id, \
               LAG(phase_id) OVER (ORDER BY created_at, id) AS previous FROM phase_check_ins) \
             WHERE phase_id = previous",
        );
        assert_eq!(repeats, 0);
    }

    #[test]
    fn tasks_read_back_with_worked_time_and_current_status() {
        let conn = seeded();
        let tasks: Vec<_> = conn
            .prepare(&format!("SELECT {TASK_COLUMNS} FROM tasks t ORDER BY t.sort_order"))
            .unwrap()
            .query_map([], map_task)
            .unwrap()
            .collect::<rusqlite::Result<_>>()
            .unwrap();
        let case_study = tasks.iter().find(|t| t.title.starts_with("Write the Field")).unwrap();
        assert_eq!(case_study.status, "active");
        assert!(case_study.worked_seconds > 3600);
        assert!(!case_study.working_now);
        let headshot = tasks.iter().find(|t| t.title == "Update headshot").unwrap();
        assert_eq!(headshot.worked_seconds, 0);
    }

    #[test]
    fn removing_a_missing_database_is_fine() {
        let dir = std::env::temp_dir().join(format!("nest-demo-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let db_path = dir.join("nest.db");
        Connection::open(&db_path).unwrap().pragma_update(None, "journal_mode", "WAL").unwrap();
        remove_database(&db_path).unwrap();
        remove_database(&db_path).unwrap();
        assert!(!db_path.exists());
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
