import { useState, type FormEvent } from "react";
import { createTag, deleteTag, renameTag } from "../../lib/commands";
import { trashIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { useInlineRename } from "../hooks/useInlineRename";

export function TagsView() {
  const { tags, mutate } = useDashboardData();
  const [name, setName] = useState("");
  const rename = useInlineRename({
    rename: renameTag,
    isUnchanged: (id, next) =>
      tags.some((tag) => tag.id === id && tag.name === next),
    mutate,
  });

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    if (await mutate(() => createTag(next))) setName("");
  };

  const remove = (id: number, tagName: string) => {
    if (!window.confirm(`Delete “${tagName}”? It will be removed from every brain dump.`)) return;
    void mutate(() => deleteTag(id));
  };

  return (
    <div className="settings-pane settings-pane--tags tags-view">
      <form className="tags-view__create" onSubmit={create}>
        <input
          value={name}
          placeholder="New tag name"
          aria-label="New tag name"
          onChange={(event) => setName(event.target.value)}
        />
        <button className="btn-accent" type="submit" disabled={!name.trim()}>
          Add tag
        </button>
      </form>
      <ul className="tags-view__list">
        {tags.map((tag) => (
          <li key={tag.id}>
            {rename.editingId === tag.id ? (
              <input
                autoFocus
                value={rename.draft}
                aria-label="Tag name"
                onChange={(event) => rename.setDraft(event.target.value)}
                onBlur={rename.commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") rename.commit();
                  if (event.key === "Escape") rename.cancel();
                }}
              />
            ) : (
              <button
                type="button"
                className="tags-view__name"
                title="Rename tag"
                onClick={() => rename.start(tag.id, tag.name)}
              >
                {tag.name}
              </button>
            )}
            <span>{tag.lastUsedAt === null ? "Unused" : "Used"}</span>
            <button
              type="button"
              className="tags-view__delete"
              aria-label={`Delete ${tag.name}`}
              onClick={() => remove(tag.id, tag.name)}
            >
              {trashIcon}
            </button>
          </li>
        ))}
      </ul>
      {tags.length === 0 && <p className="tags-view__empty">No tags yet.</p>}
    </div>
  );
}
