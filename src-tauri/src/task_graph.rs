use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, Result};
use crate::models::TaskDependency;
use crate::time::now_unix_secs;

/// Owns the invariants for Task hierarchy and execution dependencies.
/// Callers do not need to know how cycles are detected or how relationship
/// changes are made atomic.
pub struct TaskGraph;

impl TaskGraph {
    pub fn list_dependencies(conn: &Connection) -> Result<Vec<TaskDependency>> {
        let mut stmt = conn.prepare(
            "SELECT blocker_task_id, blocked_task_id, created_at \
             FROM task_dependencies \
             ORDER BY created_at ASC, blocker_task_id ASC, blocked_task_id ASC",
        )?;
        let dependencies = stmt
            .query_map([], |row| {
                Ok(TaskDependency {
                    blocker_task_id: row.get(0)?,
                    blocked_task_id: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(dependencies)
    }

    pub fn set_parent(
        conn: &mut Connection,
        task_id: i64,
        parent_task_id: Option<i64>,
    ) -> Result<()> {
        let tx = conn.transaction()?;
        Self::require_task(&tx, task_id)?;

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

    pub fn add_dependency(
        conn: &mut Connection,
        blocker_task_id: i64,
        blocked_task_id: i64,
    ) -> Result<()> {
        let tx = conn.transaction()?;
        Self::require_task(&tx, blocker_task_id)?;
        Self::require_task(&tx, blocked_task_id)?;

        if blocker_task_id == blocked_task_id {
            return Err(AppError::InvalidInput("a task cannot block itself".into()));
        }

        let creates_cycle: bool = tx.query_row(
            "WITH RECURSIVE reachable(id) AS ( \
               SELECT ?1 \
               UNION \
               SELECT d.blocked_task_id \
               FROM task_dependencies d \
               JOIN reachable r ON d.blocker_task_id = r.id \
             ) \
             SELECT EXISTS(SELECT 1 FROM reachable WHERE id = ?2)",
            params![blocked_task_id, blocker_task_id],
            |row| row.get(0),
        )?;
        if creates_cycle {
            return Err(AppError::InvalidInput(
                "that dependency would create a cycle".into(),
            ));
        }

        tx.execute(
            "INSERT OR IGNORE INTO task_dependencies \
             (blocker_task_id, blocked_task_id, created_at) VALUES (?1, ?2, ?3)",
            params![blocker_task_id, blocked_task_id, now_unix_secs()],
        )?;
        tx.execute(
            "UPDATE tasks SET updated_at = ?1 WHERE id IN (?2, ?3)",
            params![now_unix_secs(), blocker_task_id, blocked_task_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn remove_dependency(
        conn: &mut Connection,
        blocker_task_id: i64,
        blocked_task_id: i64,
    ) -> Result<()> {
        let tx = conn.transaction()?;
        let removed = tx.execute(
            "DELETE FROM task_dependencies \
             WHERE blocker_task_id = ?1 AND blocked_task_id = ?2",
            params![blocker_task_id, blocked_task_id],
        )?;
        if removed == 0 {
            return Err(AppError::NotFound(format!(
                "dependency {blocker_task_id} -> {blocked_task_id}"
            )));
        }
        tx.execute(
            "UPDATE tasks SET updated_at = ?1 WHERE id IN (?2, ?3)",
            params![now_unix_secs(), blocker_task_id, blocked_task_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    pub fn delete_task(conn: &mut Connection, id: i64) -> Result<()> {
        let tx = conn.transaction()?;
        Self::require_task(&tx, id)?;
        // Deleting relies on the schema's FK actions: children are promoted to
        // root (parent_task_id SET NULL) and dependency edges plus status
        // events cascade away. Bump the affected neighbors first so list
        // ordering reflects the change.
        tx.execute(
            "UPDATE tasks SET updated_at = ?1 \
             WHERE parent_task_id = ?2 \
                OR id IN (SELECT blocked_task_id FROM task_dependencies \
                          WHERE blocker_task_id = ?2) \
                OR id IN (SELECT blocker_task_id FROM task_dependencies \
                          WHERE blocked_task_id = ?2)",
            params![now_unix_secs(), id],
        )?;
        tx.execute("DELETE FROM tasks WHERE id = ?1", params![id])?;
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
    fn dependencies_allow_diamonds_and_reject_indirect_cycles() {
        let mut conn = database();
        TaskGraph::add_dependency(&mut conn, 1, 2).unwrap();
        TaskGraph::add_dependency(&mut conn, 1, 3).unwrap();
        TaskGraph::add_dependency(&mut conn, 2, 4).unwrap();
        TaskGraph::add_dependency(&mut conn, 3, 4).unwrap();
        assert_eq!(TaskGraph::list_dependencies(&conn).unwrap().len(), 4);

        let error = TaskGraph::add_dependency(&mut conn, 4, 1).unwrap_err();
        assert!(error.to_string().contains("create a cycle"));
        assert_eq!(TaskGraph::list_dependencies(&conn).unwrap().len(), 4);
    }

    #[test]
    fn duplicate_dependencies_are_idempotent_and_removable() {
        let mut conn = database();
        TaskGraph::add_dependency(&mut conn, 1, 2).unwrap();
        TaskGraph::add_dependency(&mut conn, 1, 2).unwrap();
        assert_eq!(TaskGraph::list_dependencies(&conn).unwrap().len(), 1);

        TaskGraph::remove_dependency(&mut conn, 1, 2).unwrap();
        assert!(TaskGraph::list_dependencies(&conn).unwrap().is_empty());
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
    fn deleting_a_blocker_dissolves_its_dependencies() {
        let mut conn = database();
        TaskGraph::add_dependency(&mut conn, 1, 2).unwrap();
        TaskGraph::add_dependency(&mut conn, 3, 2).unwrap();

        TaskGraph::delete_task(&mut conn, 1).unwrap();

        let remaining = TaskGraph::list_dependencies(&conn).unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].blocker_task_id, 3);
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
