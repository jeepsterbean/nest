import { useEffect, useRef, type CSSProperties } from "react";
import { setTaskScope } from "../../lib/commands";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { normalizeTaskScope, scopeSegments } from "../lib/scope";
import {
  checkIcon,
  chevronRightIcon,
  plusIcon,
  trashIcon,
} from "../components/icons";

// Fixed-position scope picker rendered once at the dashboard root. Unlike the
// status menu it keeps its own scrollable option list, so scrolling does not
// dismiss it (see TaskMenuContext close-effects).
export function ScopeMenu() {
  const { tasks, scopeTree, mutate } = useDashboardData();
  const {
    scopeMenu,
    newScopeName,
    setNewScopeName,
    closeScopeMenu,
    setScopeMenuPath,
    beginAddingScope,
  } = useTaskMenus();
  const newScopeInputRef = useRef<HTMLInputElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scopeMenu?.adding) newScopeInputRef.current?.focus();
    else if (scopeMenu) {
      const menu = menuRef.current;
      (
        menu?.querySelector<HTMLButtonElement>(".task-scope-menu__select") ??
        menu?.querySelector<HTMLButtonElement>(
          ".task-scope-menu__crumb, .task-scope-menu__icon-btn",
        )
      )?.focus();
    }
  }, [scopeMenu?.adding, scopeMenu?.currentPath]);

  if (!scopeMenu) return null;
  const task = tasks.find((t) => t.id === scopeMenu.taskId);
  if (!task) return null;

  const setScope = (scope: string | null) => {
    closeScopeMenu();
    if (task.scope !== scope) void mutate(() => setTaskScope(task.id, scope));
  };

  const submitNewScope = (e: React.FormEvent) => {
    e.preventDefault();
    const enteredScope = normalizeTaskScope(newScopeName);
    const scope =
      enteredScope && scopeMenu.currentPath
        ? `${scopeMenu.currentPath} / ${enteredScope}`
        : enteredScope;
    if (!scope) return;
    setScope(scope);
    setNewScopeName("");
  };

  const currentNode = scopeMenu.currentPath
    ? scopeTree.byPath.get(scopeMenu.currentPath)
    : null;
  const visibleScopeNodes = currentNode ? currentNode.children : scopeTree.roots;
  const currentPathSegments = scopeMenu.currentPath
    ? scopeSegments(scopeMenu.currentPath)
    : [];

  return (
    <>
      <div
        className="task-scope-menu-backdrop"
        onClick={() => closeScopeMenu()}
      />
      <div
        ref={menuRef}
        className="task-scope-menu"
        role="dialog"
        aria-label={`Scope for ${task.title}`}
        style={
          {
            left: scopeMenu.left,
            top: scopeMenu.top,
            "--task-scope-menu-max-height": `${scopeMenu.maxHeight}px`,
          } as CSSProperties
        }
      >
        <div className="task-scope-menu__head">
          <div className="task-scope-menu__path" aria-label="Current scope path">
            <button
              type="button"
              className="task-scope-menu__crumb"
              onClick={() => setScopeMenuPath(null)}
            >
              Scopes
            </button>
            {currentPathSegments.map((segment, index) => {
              const path = currentPathSegments.slice(0, index + 1).join(" / ");
              return (
                <span className="task-scope-menu__crumb-wrap" key={path}>
                  <span className="task-scope-menu__crumb-separator">/</span>
                  <button
                    type="button"
                    className="task-scope-menu__crumb"
                    onClick={() => setScopeMenuPath(path)}
                  >
                    {segment}
                  </button>
                </span>
              );
            })}
          </div>
          <div className="task-scope-menu__actions">
            <button
              type="button"
              className="task-scope-menu__icon-btn"
              aria-label={
                scopeMenu.currentPath
                  ? `Add scope under ${scopeMenu.currentPath}`
                  : "Add root scope"
              }
              title={
                scopeMenu.currentPath
                  ? `Add scope under ${scopeMenu.currentPath}`
                  : "Add root scope"
              }
              onClick={() => beginAddingScope()}
            >
              {plusIcon}
            </button>
            {task.scope && (
              <button
                type="button"
                className="task-scope-menu__icon-btn task-scope-menu__icon-btn--danger"
                aria-label="Remove scope"
                title="Remove scope"
                onClick={() => setScope(null)}
              >
                {trashIcon}
              </button>
            )}
          </div>
        </div>
        <div className="task-scope-menu__options">
          {visibleScopeNodes.length === 0 ? (
            <div className="task-scope-menu__empty">No child scopes</div>
          ) : (
            visibleScopeNodes.map((node) => {
              const selected = task.scope === node.path;
              const hasChildren = node.children.length > 0;
              return (
                <div
                  key={node.path}
                  className={`task-scope-menu__option-row${
                    selected ? " is-selected" : ""
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={selected}
                    className="task-scope-menu__select"
                    onClick={() => setScope(node.path)}
                  >
                    <span className="task-scope-menu__label">{node.label}</span>
                    {selected && (
                      <span className="task-scope-menu__check" aria-hidden="true">
                        {checkIcon}
                      </span>
                    )}
                  </button>
                  {hasChildren && (
                    <button
                      type="button"
                      className="task-scope-menu__drill"
                      aria-label={`Show scopes under ${node.path}`}
                      onClick={() => setScopeMenuPath(node.path)}
                    >
                      {chevronRightIcon}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
        {scopeMenu.adding ? (
          <form className="task-scope-menu__new" onSubmit={submitNewScope}>
            <input
              ref={newScopeInputRef}
              value={newScopeName}
              placeholder="New scope"
              aria-label="New task scope"
              onChange={(e) => setNewScopeName(e.target.value)}
            />
            <button type="submit" disabled={!normalizeTaskScope(newScopeName)}>
              Add
            </button>
          </form>
        ) : null}
      </div>
    </>
  );
}
