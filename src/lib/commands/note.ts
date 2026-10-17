import { invoke } from "@tauri-apps/api/core";
import type { Note, Tag } from "../types";

export function submitNote(
  text: string,
  tagIds: number[] = [],
): Promise<Note> {
  return invoke("submit_note", { text, tagIds });
}

export function listNotes(
  from: number,
  to: number,
  limit?: number,
): Promise<Note[]> {
  return invoke("list_notes", { from, to, limit: limit ?? null });
}

export function listTags(): Promise<Tag[]> {
  return invoke("list_tags");
}

export function createTag(name: string): Promise<Tag> {
  return invoke("create_tag", { name });
}

export function renameTag(id: number, name: string): Promise<Tag> {
  return invoke("rename_tag", { id, name });
}

export function deleteTag(id: number): Promise<void> {
  return invoke("delete_tag", { id });
}

export function updateNoteTags(
  id: number,
  tagIds: number[],
): Promise<Note> {
  return invoke("update_note_tags", { id, tagIds });
}
