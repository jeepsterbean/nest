use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

use crate::error::{AppError, Result};
use crate::models::{BrainDump, BrainDumpTag, Tag};
use crate::time::now_unix_secs;

pub(crate) fn normalize_tag_name(name: String) -> Result<String> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::InvalidInput("tag name cannot be empty".into()));
    }
    Ok(name)
}

pub(crate) const BRAIN_DUMP_COLUMNS: &str = "id, created_at, text";

pub(crate) fn map_brain_dump(row: &Row<'_>) -> rusqlite::Result<BrainDump> {
    Ok(BrainDump {
        id: row.get(0)?,
        created_at: row.get(1)?,
        text: row.get(2)?,
        tags: Vec::new(),
    })
}

pub(crate) fn load_brain_dump_tags(conn: &Connection, dumps: &mut [BrainDump]) -> Result<()> {
    if dumps.is_empty() {
        return Ok(());
    }
    let positions: HashMap<i64, usize> = dumps
        .iter()
        .enumerate()
        .map(|(index, dump)| (dump.id, index))
        .collect();
    let ids: Vec<i64> = dumps.iter().map(|dump| dump.id).collect();
    let placeholders = std::iter::repeat_n("?", ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let mut stmt = conn.prepare(&format!(
        "SELECT bdt.brain_dump_id, t.id, t.name FROM brain_dump_tags bdt \
         JOIN tags t ON t.id = bdt.tag_id \
         WHERE bdt.brain_dump_id IN ({placeholders}) \
         ORDER BY t.name COLLATE NOCASE, t.id"
    ))?;
    let rows = stmt.query_map(params_from_iter(ids.iter()), |row| {
        Ok((
            row.get::<_, i64>(0)?,
            BrainDumpTag {
                id: row.get(1)?,
                name: row.get(2)?,
            },
        ))
    })?;
    for row in rows {
        let (dump_id, tag) = row?;
        if let Some(index) = positions.get(&dump_id) {
            dumps[*index].tags.push(tag);
        }
    }
    Ok(())
}

pub(crate) const TAG_COLUMNS_WITH_LAST_USED: &str = "t.id, t.name, t.created_at, MAX(bd.created_at) \
     FROM tags t \
     LEFT JOIN brain_dump_tags bdt ON bdt.tag_id = t.id \
     LEFT JOIN brain_dumps bd ON bd.id = bdt.brain_dump_id";

pub(crate) fn map_tag(row: &Row<'_>) -> rusqlite::Result<Tag> {
    Ok(Tag {
        id: row.get(0)?,
        name: row.get(1)?,
        created_at: row.get(2)?,
        last_used_at: row.get(3)?,
    })
}

pub(crate) fn fetch_tag(conn: &Connection, id: i64) -> Result<Tag> {
    conn.query_row(
        &format!("SELECT {TAG_COLUMNS_WITH_LAST_USED} WHERE t.id = ?1 GROUP BY t.id"),
        params![id],
        map_tag,
    )
    .optional()?
    .ok_or_else(|| AppError::NotFound(format!("tag {id}")))
}

pub(crate) fn fetch_brain_dump(conn: &Connection, id: i64) -> Result<BrainDump> {
    let mut dump = conn
        .query_row(
            &format!("SELECT {BRAIN_DUMP_COLUMNS} FROM brain_dumps WHERE id = ?1"),
            params![id],
            map_brain_dump,
        )
        .optional()?
        .ok_or_else(|| AppError::NotFound(format!("brain dump {id}")))?;
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name FROM brain_dump_tags bdt \
         JOIN tags t ON t.id = bdt.tag_id \
         WHERE bdt.brain_dump_id = ?1 \
         ORDER BY t.name COLLATE NOCASE, t.id",
    )?;
    dump.tags = stmt
        .query_map(params![id], |row| {
            Ok(BrainDumpTag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(dump)
}

pub(crate) fn validate_tag_ids(conn: &Connection, tag_ids: &[i64]) -> Result<()> {
    if tag_ids.iter().copied().collect::<HashSet<_>>().len() != tag_ids.len() {
        return Err(AppError::InvalidInput("tag ids must be unique".into()));
    }
    for id in tag_ids {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tags WHERE id = ?1)",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("tag {id}")));
        }
    }
    Ok(())
}

pub(crate) const BRAIN_DUMP_RICH_TEXT_PREFIX: &str = "<!--nest-rich-text:v1-->";

pub(crate) fn brain_dump_plain_text(text: &str) -> String {
    let Some(text) = text.strip_prefix(BRAIN_DUMP_RICH_TEXT_PREFIX) else {
        return text.to_string();
    };
    let mut plain = String::with_capacity(text.len());
    let mut in_tag = false;
    let mut entity = String::new();
    let mut in_entity = false;

    for ch in text.chars() {
        if in_tag {
            if ch == '>' {
                in_tag = false;
            }
            continue;
        }

        if in_entity {
            if ch == ';' {
                match entity.as_str() {
                    "nbsp" => plain.push(' '),
                    "amp" => plain.push('&'),
                    "lt" => plain.push('<'),
                    "gt" => plain.push('>'),
                    "quot" => plain.push('"'),
                    "#39" | "apos" => plain.push('\''),
                    _ => {}
                }
                entity.clear();
                in_entity = false;
                continue;
            }

            if ch.is_ascii_alphanumeric() || ch == '#' {
                entity.push(ch);
                continue;
            }

            in_entity = false;
            entity.clear();
        }

        match ch {
            '<' => in_tag = true,
            '&' => {
                in_entity = true;
                entity.clear();
            }
            _ => plain.push(ch),
        }
    }

    plain
}

pub(crate) fn record_brain_dump(
    conn: &mut Connection,
    text: String,
    tag_ids: &[i64],
    created_at: i64,
) -> Result<BrainDump> {
    let tx = conn.transaction()?;
    validate_tag_ids(&tx, tag_ids)?;
    tx.execute(
        "INSERT INTO brain_dumps (created_at, text) VALUES (?1, ?2)",
        params![created_at, text],
    )?;
    let id = tx.last_insert_rowid();
    for tag_id in tag_ids {
        tx.execute(
            "INSERT INTO brain_dump_tags (brain_dump_id, tag_id) VALUES (?1, ?2)",
            params![id, tag_id],
        )?;
    }
    tx.commit()?;
    fetch_brain_dump(conn, id)
}
#[tauri::command]
pub fn list_tags(state: State<'_, Mutex<Connection>>) -> Result<Vec<Tag>> {
    let conn = state.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {TAG_COLUMNS_WITH_LAST_USED} \
         GROUP BY t.id \
         ORDER BY MAX(bd.created_at) IS NULL, MAX(bd.created_at) DESC, \
                  t.name COLLATE NOCASE, t.id",
    ))?;
    let rows = stmt
        .query_map([], map_tag)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_tag(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    name: String,
) -> Result<Tag> {
    let name = normalize_tag_name(name)?;
    let tag = {
        let conn = state.lock().unwrap();
        let duplicate: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tags WHERE name = ?1 COLLATE NOCASE)",
            params![name],
            |row| row.get(0),
        )?;
        if duplicate {
            return Err(AppError::InvalidInput("tag name already exists".into()));
        }
        let created_at = now_unix_secs();
        conn.execute(
            "INSERT INTO tags (name, created_at) VALUES (?1, ?2)",
            params![name, created_at],
        )?;
        Tag {
            id: conn.last_insert_rowid(),
            name,
            created_at,
            last_used_at: None,
        }
    };
    let _ = app.emit("data-changed", ());
    Ok(tag)
}

#[tauri::command]
pub fn rename_tag(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    name: String,
) -> Result<Tag> {
    let name = normalize_tag_name(name)?;
    let tag = {
        let conn = state.lock().unwrap();
        let duplicate: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM tags WHERE name = ?1 COLLATE NOCASE AND id != ?2)",
            params![name, id],
            |row| row.get(0),
        )?;
        if duplicate {
            return Err(AppError::InvalidInput("tag name already exists".into()));
        }
        let updated = conn.execute("UPDATE tags SET name = ?1 WHERE id = ?2", params![name, id])?;
        if updated == 0 {
            return Err(AppError::NotFound(format!("tag {id}")));
        }
        fetch_tag(&conn, id)?
    };
    let _ = app.emit("data-changed", ());
    Ok(tag)
}

#[tauri::command]
pub fn delete_tag(app: AppHandle, state: State<'_, Mutex<Connection>>, id: i64) -> Result<()> {
    let deleted = {
        let conn = state.lock().unwrap();
        conn.execute("DELETE FROM tags WHERE id = ?1", params![id])?
    };
    if deleted == 0 {
        return Err(AppError::NotFound(format!("tag {id}")));
    }
    let _ = app.emit("data-changed", ());
    Ok(())
}

#[tauri::command]
pub fn submit_brain_dump(
    state: State<'_, Mutex<Connection>>,
    text: String,
    tag_ids: Vec<i64>,
) -> Result<BrainDump> {
    let text_clean = text.trim().to_string();
    if brain_dump_plain_text(&text_clean).trim().is_empty() {
        return Err(AppError::InvalidInput("brain dump cannot be empty".into()));
    }
    let mut conn = state.lock().unwrap();
    record_brain_dump(&mut conn, text_clean, &tag_ids, now_unix_secs())
}

#[tauri::command]
pub fn update_brain_dump_tags(
    app: AppHandle,
    state: State<'_, Mutex<Connection>>,
    id: i64,
    tag_ids: Vec<i64>,
) -> Result<BrainDump> {
    let dump = {
        let mut conn = state.lock().unwrap();
        let tx = conn.transaction()?;
        let exists: bool = tx.query_row(
            "SELECT EXISTS(SELECT 1 FROM brain_dumps WHERE id = ?1)",
            params![id],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound(format!("brain dump {id}")));
        }
        validate_tag_ids(&tx, &tag_ids)?;
        tx.execute(
            "DELETE FROM brain_dump_tags WHERE brain_dump_id = ?1",
            params![id],
        )?;
        for tag_id in tag_ids {
            tx.execute(
                "INSERT INTO brain_dump_tags (brain_dump_id, tag_id) VALUES (?1, ?2)",
                params![id, tag_id],
            )?;
        }
        tx.commit()?;
        fetch_brain_dump(&conn, id)?
    };
    let _ = app.emit("data-changed", ());
    Ok(dump)
}

pub(crate) fn query_brain_dumps(
    conn: &Connection,
    from: i64,
    to: i64,
    limit: Option<i64>,
) -> Result<Vec<BrainDump>> {
    let mut sql = format!(
        "SELECT {BRAIN_DUMP_COLUMNS} FROM brain_dumps \
         WHERE created_at >= ?1 AND created_at < ?2 ORDER BY created_at DESC"
    );
    if limit.is_some() {
        sql.push_str(" LIMIT ?3");
    }
    let mut stmt = conn.prepare(&sql)?;
    let mut rows = match limit {
        Some(n) => stmt
            .query_map(params![from, to, n], map_brain_dump)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
        None => stmt
            .query_map(params![from, to], map_brain_dump)?
            .collect::<rusqlite::Result<Vec<_>>>()?,
    };
    load_brain_dump_tags(conn, &mut rows)?;
    Ok(rows)
}

#[tauri::command]
pub fn list_brain_dumps(
    state: State<'_, Mutex<Connection>>,
    from: i64,
    to: i64,
    limit: Option<i64>,
) -> Result<Vec<BrainDump>> {
    let conn = state.lock().unwrap();
    query_brain_dumps(&conn, from, to, limit)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::migrations::migrations;

    #[test]
    fn records_brain_dump_tags_atomically() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO tags (id, name, created_at) VALUES (1, 'Work', 1), (2, 'Idea', 2)",
            [],
        )
        .unwrap();

        let dump = record_brain_dump(&mut conn, "Thought".into(), &[2, 1], 10).unwrap();
        assert_eq!(
            dump.tags
                .iter()
                .map(|tag| tag.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Idea", "Work"]
        );
        assert!(record_brain_dump(&mut conn, "Bad".into(), &[1, 99], 11).is_err());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM brain_dumps", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn strips_rich_text_markup_when_validating_brain_dumps() {
        assert_eq!(
            brain_dump_plain_text("Use <draft> wording"),
            "Use <draft> wording"
        );
        assert_eq!(brain_dump_plain_text("<3 & counting"), "<3 & counting");
        assert_eq!(
            brain_dump_plain_text("<!--nest-rich-text:v1--><p>Hello <strong>there</strong></p>"),
            "Hello there"
        );
        assert_eq!(
            brain_dump_plain_text("<!--nest-rich-text:v1--><p>&nbsp;</p>"),
            " "
        );
        assert!(
            brain_dump_plain_text("<!--nest-rich-text:v1--><p><u> </u></p>")
                .trim()
                .is_empty()
        );
    }

    #[test]
    fn lists_recent_brain_dumps_with_limit() {
        let mut conn = Connection::open_in_memory().unwrap();
        migrations().to_latest(&mut conn).unwrap();
        for i in 1..=6 {
            record_brain_dump(&mut conn, format!("d{i}"), &[], i).unwrap();
        }
        let rows = query_brain_dumps(&conn, 0, 100, Some(5)).unwrap();
        assert_eq!(
            rows.iter().map(|d| d.text.as_str()).collect::<Vec<_>>(),
            vec!["d6", "d5", "d4", "d3", "d2"]
        );
    }

    #[test]
    fn lists_brain_dumps_with_their_own_tags() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO tags (id, name, created_at) VALUES (1, 'Work', 1), (2, 'Idea', 2)",
            [],
        )
        .unwrap();

        record_brain_dump(&mut conn, "early".into(), &[1], 0).unwrap();
        record_brain_dump(&mut conn, "mixed".into(), &[2, 1], 100).unwrap();
        record_brain_dump(&mut conn, "bound".into(), &[2], 500).unwrap();
        record_brain_dump(&mut conn, "later".into(), &[1], 900).unwrap();

        let listed = query_brain_dumps(&conn, 0, 500, None).unwrap();
        let shape: Vec<(&str, Vec<&str>)> = listed
            .iter()
            .map(|dump| {
                (
                    dump.text.as_str(),
                    dump.tags.iter().map(|tag| tag.name.as_str()).collect(),
                )
            })
            .collect();
        assert_eq!(
            shape,
            vec![("mixed", vec!["Idea", "Work"]), ("early", vec!["Work"])]
        );

        let limited = query_brain_dumps(&conn, 0, 500, Some(1)).unwrap();
        assert_eq!(limited[0].text, "mixed");
        assert_eq!(
            limited[0]
                .tags
                .iter()
                .map(|tag| tag.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Idea", "Work"]
        );
    }
}
