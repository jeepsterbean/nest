use rusqlite::{params, Connection, OptionalExtension};

use crate::error::{AppError, Result};
use crate::time::now_unix_secs;

/// Owns the invariants for Task hierarchy.
/// Callers do not need to know how cycles are detected or how relationship
/// changes are made atomic.
pub struct TaskGraph;

impl TaskGraph {
    pub fn add_parent(conn: &mut Connection, task_id: i64, parent_id: i64) -> Result<()> {
        let tx = conn.transaction()?;
        Self::add_parent_in(&tx, task_id, parent_id)?;
        tx.commit()?;
        Ok(())
    }

    pub(crate) fn add_parent_in(conn: &Connection, task_id: i64, parent_id: i64) -> Result<()> {
        Self::require_task(conn, task_id)?;
        Self::require_task(conn, parent_id)?;
        if parent_id == task_id {
            return Err(AppError::InvalidInput(
                "a task cannot be its own parent".into(),
            ));
        }
        let creates_cycle: bool = conn.query_row(
            "WITH RECURSIVE ancestors(id) AS (
               SELECT ?1 UNION
               SELECT p.parent_task_id FROM task_parents p JOIN ancestors a ON p.child_task_id=a.id
             ) SELECT EXISTS(SELECT 1 FROM ancestors WHERE id=?2)",
            params![parent_id, task_id],
            |row| row.get(0),
        )?;
        if creates_cycle {
            return Err(AppError::InvalidInput(
                "that parent would create a task hierarchy cycle".into(),
            ));
        }
        conn.execute(
            "INSERT INTO task_parents(child_task_id,parent_task_id,created_at) VALUES(?1,?2,?3)
             ON CONFLICT(child_task_id,parent_task_id) DO NOTHING",
            params![task_id, parent_id, now_unix_secs()],
        )?;
        Ok(())
    }

    pub fn remove_parent(conn: &mut Connection, task_id: i64, parent_id: i64) -> Result<()> {
        let tx = conn.transaction()?;
        Self::require_task(&tx, task_id)?;
        Self::require_task(&tx, parent_id)?;
        tx.execute(
            "DELETE FROM task_parents WHERE child_task_id=?1 AND parent_task_id=?2",
            params![task_id, parent_id],
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
            "DELETE FROM task_parents WHERE child_task_id=?1 OR parent_task_id=?1",
            params![id],
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
    fn multiple_parents_unlink_independently_and_skip_duplicate_history() {
        let mut conn = database();
        TaskGraph::add_parent(&mut conn, 3, 1).unwrap();
        TaskGraph::add_parent(&mut conn, 3, 2).unwrap();
        assert_eq!(
            crate::task::fetch_task(&conn, 3).unwrap().parent_task_ids,
            vec![1, 2]
        );
        let before = crate::task::fetch_task(&conn, 3).unwrap().history_revision;
        TaskGraph::add_parent(&mut conn, 3, 2).unwrap();
        assert_eq!(
            crate::task::fetch_task(&conn, 3).unwrap().history_revision,
            before
        );
        TaskGraph::remove_parent(&mut conn, 3, 1).unwrap();
        assert_eq!(
            crate::task::fetch_task(&conn, 3).unwrap().parent_task_ids,
            vec![2]
        );
        let after = crate::task::fetch_task(&conn, 3).unwrap().history_revision;
        TaskGraph::remove_parent(&mut conn, 3, 1).unwrap();
        assert_eq!(
            crate::task::fetch_task(&conn, 3).unwrap().history_revision,
            after
        );
        let removals: i64 = conn.query_row(
            "SELECT COUNT(*) FROM task_edit_history WHERE (task_id=1 AND kind='child_removed') OR (task_id=3 AND kind='parent_removed')",
            [], |row| row.get(0),
        ).unwrap();
        assert_eq!(removals, 2);
        let unrelated_removals: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM task_edit_history WHERE task_id=2 AND kind='child_removed'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(unrelated_removals, 0);
    }

    #[test]
    fn cycles_are_rejected_across_every_parent_branch_and_in_sqlite() {
        let mut conn = database();
        TaskGraph::add_parent(&mut conn, 3, 1).unwrap();
        TaskGraph::add_parent(&mut conn, 3, 2).unwrap();
        TaskGraph::add_parent(&mut conn, 4, 3).unwrap();
        assert!(TaskGraph::add_parent(&mut conn, 2, 4).is_err());
        assert!(TaskGraph::add_parent(&mut conn, 1, 4).is_err());
        assert!(TaskGraph::add_parent(&mut conn, 4, 4).is_err());
        assert!(TaskGraph::add_parent(&mut conn, 4, 99).is_err());
        assert!(TaskGraph::add_parent(&mut conn, 99, 1).is_err());
        assert!(conn
            .execute("INSERT INTO task_parents VALUES(2,4,1)", [])
            .is_err());
        assert!(conn
            .execute("INSERT INTO task_parents VALUES(1,1,1)", [])
            .is_err());
        assert!(conn
            .execute("INSERT INTO task_parents VALUES(1,99,1)", [])
            .is_err());
        assert!(conn
            .execute("INSERT INTO task_parents VALUES(3,1,1)", [])
            .is_err());
        assert!(conn
            .execute(
                "UPDATE task_parents SET parent_task_id=4 WHERE child_task_id=3",
                []
            )
            .is_err());
    }

    #[test]
    fn deleting_one_parent_keeps_other_connections_and_records_removals() {
        let mut conn = database();
        TaskGraph::add_parent(&mut conn, 3, 1).unwrap();
        TaskGraph::add_parent(&mut conn, 3, 2).unwrap();
        TaskGraph::add_parent(&mut conn, 4, 1).unwrap();
        TaskGraph::delete_task(&mut conn, 1).unwrap();
        assert_eq!(
            crate::task::fetch_task(&conn, 3).unwrap().parent_task_ids,
            vec![2]
        );
        assert!(crate::task::fetch_task(&conn, 4)
            .unwrap()
            .parent_task_ids
            .is_empty());
        let snapshots: i64 = conn.query_row(
            "SELECT COUNT(*) FROM task_edit_history WHERE kind='parent_removed' AND related_title='A'", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(snapshots, 2);
        TaskGraph::delete_task(&mut conn, 3).unwrap();
        let removal: String = conn.query_row(
            "SELECT related_title FROM task_edit_history WHERE task_id=2 AND kind='child_removed'", [], |row| row.get(0),
        ).unwrap();
        assert_eq!(removal, "C");
        assert!(conn
            .prepare("PRAGMA foreign_key_check")
            .unwrap()
            .query([])
            .unwrap()
            .next()
            .unwrap()
            .is_none());
    }

    #[test]
    fn failed_relationship_batch_rolls_back_edges_and_history() {
        let mut conn = database();
        let before = crate::task::fetch_task(&conn, 3).unwrap().history_revision;
        {
            let tx = conn.transaction().unwrap();
            TaskGraph::add_parent_in(&tx, 3, 1).unwrap();
            assert!(TaskGraph::add_parent_in(&tx, 3, 99).is_err());
        }
        let task = crate::task::fetch_task(&conn, 3).unwrap();
        assert!(task.parent_task_ids.is_empty());
        assert_eq!(task.history_revision, before);
    }

    #[test]
    fn hierarchy_allows_nesting_and_rejects_cycles() {
        let mut conn = database();
        TaskGraph::add_parent(&mut conn, 2, 1).unwrap();
        TaskGraph::add_parent(&mut conn, 3, 2).unwrap();

        let error = TaskGraph::add_parent(&mut conn, 1, 3).unwrap_err();
        assert!(error.to_string().contains("hierarchy cycle"));

        let parent: Option<i64> = conn
            .query_row(
                "SELECT (SELECT parent_task_id FROM task_parents WHERE child_task_id=1)",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(parent, None);
    }

    #[test]
    fn deleting_a_parent_promotes_children_but_keeps_grandchildren_nested() {
        let mut conn = database();
        TaskGraph::add_parent(&mut conn, 2, 1).unwrap();
        TaskGraph::add_parent(&mut conn, 3, 2).unwrap();

        TaskGraph::delete_task(&mut conn, 1).unwrap();

        let child_parent: Option<i64> = conn
            .query_row(
                "SELECT (SELECT parent_task_id FROM task_parents WHERE child_task_id=2)",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(child_parent, None);

        let grandchild_parent: Option<i64> = conn
            .query_row(
                "SELECT (SELECT parent_task_id FROM task_parents WHERE child_task_id=3)",
                [],
                |row| row.get(0),
            )
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
