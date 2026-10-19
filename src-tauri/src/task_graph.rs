use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, Result};
use crate::time::now_unix_secs;

/// Owns the invariants for Task hierarchy.
/// Callers do not need to know how cycles are detected or how relationship
/// changes are made atomic.
pub struct TaskGraph;

impl TaskGraph {
    pub fn set_parent(
        conn: &mut Connection,
        task_id: i64,
        parent_task_id: Option<i64>,
    ) -> Result<()> {
        let tx = conn.transaction()?;
        Self::require_task(&tx, task_id)?;
        let current: Option<i64> = tx.query_row(
            "SELECT parent_task_id FROM tasks WHERE id=?1",
            params![task_id],
            |row| row.get(0),
        )?;
        if current == parent_task_id {
            return Ok(());
        }

        if let Some(parent_id) = parent_task_id {
            Self::require_task(&tx, parent_id)?;
            if parent_id == task_id {
                return Err(AppError::InvalidInput(
                    "a task cannot be its own parent".into(),
                ));
            }

            let creates_cycle: bool = tx.query_row(
                "WITH RECURSIVE ancestors(id) AS ( \
                   SELECT ?1 \
                   UNION \
                   SELECT t.parent_task_id \
                   FROM tasks t \
                   JOIN ancestors a ON t.id = a.id \
                   WHERE t.parent_task_id IS NOT NULL \
                 ) \
                 SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = ?2)",
                params![parent_id, task_id],
                |row| row.get(0),
            )?;
            if creates_cycle {
                return Err(AppError::InvalidInput(
                    "that parent would create a task hierarchy cycle".into(),
                ));
            }
        }

        tx.execute(
            "UPDATE tasks SET parent_task_id = ?1, updated_at = ?2 WHERE id = ?3",
            params![parent_task_id, now_unix_secs(), task_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub(crate) fn delete_task_in(tx: &rusqlite::Transaction<'_>, id: i64) -> Result<()> {
        Self::require_task(tx, id)?;
        // Unlink before deleting so the edit-history triggers record each
        // removal on the surviving Tasks. The FK actions would do the same
        // unlinking silently, and a trigger must not edit the row SQLite is
        // deleting. The Task's own entries then cascade away with it.
        let now = now_unix_secs();
        tx.execute(
            "INSERT INTO task_edit_history(task_id,kind,related_task_id,related_title,created_at)
             SELECT follows_task_id,'follow_up_removed',id,title,?1 FROM tasks
             WHERE id=?2 AND follows_task_id IS NOT NULL
             UNION ALL
             SELECT follower.id,'follows_removed',original.id,original.title,?1
             FROM tasks follower JOIN tasks original ON follower.follows_task_id=original.id
             WHERE original.id=?2",
            params![now, id],
        )?;
        tx.execute(
            "UPDATE tasks SET parent_task_id = NULL, updated_at = ?1 \
             WHERE parent_task_id = ?2 \
                OR (id = ?2 AND parent_task_id IS NOT NULL)",
            params![now, id],
        )?;
        tx.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
        Ok(())
    }

    #[cfg(test)]
    pub fn delete_task(conn: &mut Connection, id: i64) -> Result<()> {
        let tx = conn.transaction()?;
        Self::delete_task_in(&tx, id)?;
        tx.commit()?;
        Ok(())
    }

    fn require_task(conn: &Connection, id: i64) -> Result<()> {
        let exists = conn
            .query_row("SELECT 1 FROM tasks WHERE id = ?1", params![id], |_| Ok(()))
            .optional()?;
        exists.ok_or_else(|| AppError::NotFound(format!("task {id}")))
    }
}

#[cfg(test)]
mod tests {
    use super::TaskGraph;
    use crate::migrations::migrations;
    use rusqlite::{params, Connection};

    fn database() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "foreign_keys", "ON").unwrap();
        migrations().to_latest(&mut conn).unwrap();
        for (id, title) in [(1, "A"), (2, "B"), (3, "C"), (4, "D")] {
            conn.execute(
                "INSERT INTO tasks \
                 (id, title, description, status, created_at, updated_at) \
                 VALUES (?1, ?2, '', 'backlog', ?1, ?1)",
                params![id, title],
            )
            .unwrap();
        }
        conn
    }

    #[test]
    fn hierarchy_allows_nesting_and_rejects_cycles() {
        let mut conn = database();
        TaskGraph::set_parent(&mut conn, 2, Some(1)).unwrap();
        TaskGraph::set_parent(&mut conn, 3, Some(2)).unwrap();

        let error = TaskGraph::set_parent(&mut conn, 1, Some(3)).unwrap_err();
        assert!(error.to_string().contains("hierarchy cycle"));

        let parent: Option<i64> = conn
            .query_row("SELECT parent_task_id FROM tasks WHERE id = 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(parent, None);
    }

    #[test]
    fn deleting_a_parent_promotes_children_but_keeps_grandchildren_nested() {
        let mut conn = database();
        TaskGraph::set_parent(&mut conn, 2, Some(1)).unwrap();
        TaskGraph::set_parent(&mut conn, 3, Some(2)).unwrap();

        TaskGraph::delete_task(&mut conn, 1).unwrap();

        let child_parent: Option<i64> = conn
            .query_row("SELECT parent_task_id FROM tasks WHERE id = 2", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(child_parent, None);

        let grandchild_parent: Option<i64> = conn
            .query_row("SELECT parent_task_id FROM tasks WHERE id = 3", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(grandchild_parent, Some(2));
    }

    #[test]
    fn deleting_a_task_removes_its_status_events() {
        let mut conn = database();
        conn.execute(
            "INSERT INTO task_status_events (task_id, from_status, to_status, created_at) \
             VALUES (1, NULL, 'backlog', 1)",
            [],
        )
        .unwrap();

        TaskGraph::delete_task(&mut conn, 1).unwrap();

        let events: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_status_events WHERE task_id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(events, 0);
    }

    #[test]
    fn deleting_an_unknown_task_is_not_found() {
        let mut conn = database();
        let error = TaskGraph::delete_task(&mut conn, 99).unwrap_err();
        assert!(error.to_string().contains("task 99"));
    }
}
